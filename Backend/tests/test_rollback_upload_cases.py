import io
import re
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from openpyxl import Workbook

from services.import_service import import_excel_to_snowflake
from services.rollback_service import (
    IMPORT_ID_COLUMN,
    build_rollback_statements,
    execute_rollback_statements,
)
from routes.imports import _rollback_dependency_reason


class FakeDb:
    def __init__(self):
        self.imports = []
        self.next_id = 1

    def add(self, item):
        if item not in self.imports:
            self.imports.append(item)

    def commit(self):
        return None

    def rollback(self):
        return None

    def refresh(self, item):
        if item.id is None:
            item.id = self.next_id
            self.next_id += 1


class DependencyDb:
    def __init__(self, later_imports):
        self.later_imports = later_imports

    def query(self, _):
        return self

    def filter(self, *_):
        return self

    def all(self):
        return self.later_imports


class FakeSnowflake:
    def __init__(self):
        self.databases = {}
        self.table_definitions = {}
        self.current_database = None
        self.current_schema = None

    @staticmethod
    def quote_identifier(identifier):
        return f'"{identifier}"'

    @staticmethod
    def _quoted_identifiers(query):
        return re.findall(r'"([^"]+)"', query)

    def set_actor(self, **_):
        return None

    def database_exists(self, database_name):
        return database_name in self.databases

    def create_database(self, database_name):
        self.databases.setdefault(database_name, {})

    def use_database(self, database_name):
        self.current_database = database_name

    def schema_exists(self, schema_name):
        return schema_name in self.databases[self.current_database]

    def create_schema(self, schema_name):
        self.databases[self.current_database].setdefault(schema_name, {})

    def use_schema(self, schema_name):
        self.current_schema = schema_name

    def table_exists(self, table_name):
        return table_name in self.databases[self.current_database][self.current_schema]

    def create_table_from_dataframe(self, table_name, dataframe):
        self.databases[self.current_database][self.current_schema].setdefault(table_name, [])
        self.table_definitions[
            (self.current_database, self.current_schema, table_name)
        ] = {str(column).upper() for column in dataframe.columns}

    def table_columns(self, table_name):
        return self.table_definitions[
            (self.current_database, self.current_schema, table_name)
        ]

    def ensure_import_tracking_column(self, table_name):
        self.table_definitions[
            (self.current_database, self.current_schema, table_name)
        ].add(IMPORT_ID_COLUMN)

    def validate_dataframe_columns(self, _, __):
        return None

    def insert_dataframe(self, table_name, dataframe):
        table = self.databases[self.current_database][self.current_schema][table_name]
        table.extend([int(value) for value in dataframe[IMPORT_ID_COLUMN]])
        return len(dataframe)

    def execute_query(self, query, **_):
        identifiers = self._quoted_identifiers(query)
        normalized = query.strip().upper()
        if normalized.startswith("DROP DATABASE"):
            self.databases.pop(identifiers[0], None)
        elif normalized.startswith("DROP SCHEMA"):
            self.databases[identifiers[0]].pop(identifiers[1], None)
        elif normalized.startswith("DROP TABLE"):
            self.databases[identifiers[0]][identifiers[1]].pop(identifiers[2], None)
        elif normalized.startswith("DELETE FROM"):
            database, schema, table = identifiers[:3]
            import_id = int(re.search(r"=\s*(\d+)", query).group(1))
            rows = self.databases[database][schema][table]
            self.databases[database][schema][table] = [
                row_import_id for row_import_id in rows if row_import_id != import_id
            ]
        return []


def workbook_bytes(sheet_name, headers, rows):
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = sheet_name
    sheet.append(headers)
    for row in rows:
        sheet.append(row)
    output = io.BytesIO()
    workbook.save(output)
    return output.getvalue()


class RollbackUploadCasesTest(unittest.TestCase):
    def setUp(self):
        self.db = FakeDb()
        self.snowflake = FakeSnowflake()
        self.log_patches = [
            patch("services.import_service.LoggerService.log_execution"),
            patch("services.import_service.LoggerService.log_error"),
        ]
        for log_patch in self.log_patches:
            log_patch.start()

    def tearDown(self):
        for log_patch in self.log_patches:
            log_patch.stop()

    def upload(self, sheet_name, headers, rows):
        return import_excel_to_snowflake(
            db=self.db,
            snowflake=self.snowflake,
            file_bytes=workbook_bytes(sheet_name, headers, rows),
            original_filename="customer_upload.xlsx",
            entreprise_name="Acme",
            user_id=1,
            organization_id=1,
        )

    def rollback(self, import_index):
        imported = self.db.imports[import_index]
        statements = build_rollback_statements(
            self.snowflake,
            database_name=imported.database_name,
            schema_name=imported.schema_name,
            import_id=imported.id,
            rollback_plan=imported.rollback_plan,
        )
        execute_rollback_statements(self.snowflake, statements)

    def test_case_1_new_organization_rolls_back_created_database(self):
        imported = self.upload("CUSTOMERS", ["ID", "NAME"], [[1, "Alice"], [2, "Bob"]])

        self.assertEqual(imported.schema, "CUSTOMER_UPLOAD")
        self.assertTrue(self.db.imports[0].rollback_plan["database_created"])
        self.assertIn("ACME", self.snowflake.databases)

        self.rollback(0)

        self.assertNotIn("ACME", self.snowflake.databases)

    def test_case_2_existing_database_schema_rolls_back_only_new_table(self):
        self.snowflake.create_database("ACME")
        self.snowflake.use_database("ACME")
        self.snowflake.create_schema("CUSTOMER_UPLOAD")

        self.upload("ORDERS", ["ORDER_ID", "AMOUNT"], [[10, 25.0], [11, 40.0]])

        plan = self.db.imports[0].rollback_plan
        self.assertFalse(plan["database_created"])
        self.assertFalse(plan["schema_created"])
        self.assertTrue(plan["tables"][0]["created"])
        self.assertIn("ORDERS", self.snowflake.databases["ACME"]["CUSTOMER_UPLOAD"])

        self.rollback(0)

        self.assertIn("ACME", self.snowflake.databases)
        self.assertIn("CUSTOMER_UPLOAD", self.snowflake.databases["ACME"])
        self.assertNotIn("ORDERS", self.snowflake.databases["ACME"]["CUSTOMER_UPLOAD"])

    def test_case_3_existing_table_rolls_back_only_rows_from_selected_import(self):
        self.snowflake.create_database("ACME")
        self.snowflake.use_database("ACME")
        self.snowflake.create_schema("CUSTOMER_UPLOAD")
        self.snowflake.use_schema("CUSTOMER_UPLOAD")
        self.snowflake.databases["ACME"]["CUSTOMER_UPLOAD"]["CUSTOMERS"] = [None, None, None]
        self.snowflake.table_definitions[
            ("ACME", "CUSTOMER_UPLOAD", "CUSTOMERS")
        ] = {"ID", "NAME"}

        self.upload("CUSTOMERS", ["ID", "NAME"], [[4, "Omar"], [5, "Leila"]])

        plan = self.db.imports[0].rollback_plan
        self.assertFalse(plan["tables"][0]["created"])
        self.assertEqual(
            self.snowflake.databases["ACME"]["CUSTOMER_UPLOAD"]["CUSTOMERS"],
            [None, None, None, 1, 1],
        )

        self.rollback(0)

        self.assertEqual(
            self.snowflake.databases["ACME"]["CUSTOMER_UPLOAD"]["CUSTOMERS"],
            [None, None, None],
        )

    def test_same_sheet_and_same_columns_append_to_same_table(self):
        first = self.upload("CUSTOMERS", ["ID", "NAME"], [[1, "Alice"]])
        second = self.upload("CUSTOMERS", ["ID", "NAME"], [[2, "Bob"]])

        self.assertEqual(first.tables_created, ["CUSTOMERS"])
        self.assertEqual(second.tables_created, ["CUSTOMERS"])
        self.assertEqual(
            set(self.snowflake.databases["ACME"]["CUSTOMER_UPLOAD"]),
            {"CUSTOMERS"},
        )
        self.assertFalse(self.db.imports[1].rollback_plan["tables"][0]["created"])

    def test_same_sheet_and_different_columns_create_stable_structure_table(self):
        first = self.upload("CUSTOMERS", ["ID", "NAME"], [[1, "Alice"]])
        second = self.upload("CUSTOMERS", ["ID", "PHONE"], [[2, "0600000000"]])
        third = self.upload("CUSTOMERS", ["ID", "PHONE"], [[3, "0700000000"]])

        variant_table = second.tables_created[0]
        self.assertEqual(first.tables_created, ["CUSTOMERS"])
        self.assertTrue(variant_table.startswith("CUSTOMERS_STRUCT_"))
        self.assertEqual(third.tables_created, [variant_table])
        self.assertEqual(
            set(self.snowflake.databases["ACME"]["CUSTOMER_UPLOAD"]),
            {"CUSTOMERS", variant_table},
        )
        self.assertTrue(self.db.imports[1].rollback_plan["tables"][0]["created"])
        self.assertFalse(self.db.imports[2].rollback_plan["tables"][0]["created"])

    def test_reserved_tracking_column_creates_failed_import_without_rows(self):
        with self.assertRaisesRegex(ValueError, "reserved for rollback tracking"):
            self.upload(
                "CUSTOMERS",
                ["CUSTOMER_ID", "SNOWFAST_IMPORT_ID"],
                [[1, 999]],
            )

        imported = self.db.imports[0]
        self.assertEqual(imported.status, "FAILED")
        self.assertEqual(imported.rows_inserted, 0)
        self.assertEqual(imported.failure_step, "Column Validation")

    def test_database_drop_is_blocked_while_newer_imports_depend_on_it(self):
        imported = SimpleNamespace(
            id=1,
            database_name="ACME",
            schema_name="CUSTOMER_UPLOAD",
            imported_tables=["CUSTOMERS"],
            rollback_plan={
                "version": 2,
                "database_created": True,
                "schema_created": True,
                "tables": [{"name": "CUSTOMERS", "created": True, "rows_inserted": 3}],
            },
        )
        later = SimpleNamespace(
            schema_name="CUSTOMER_UPLOAD",
            imported_tables=["ORDERS"],
            rollback_plan={
                "version": 2,
                "tables": [{"name": "ORDERS", "created": True, "rows_inserted": 3}],
            },
        )

        reason = _rollback_dependency_reason(DependencyDb([later]), imported)

        self.assertIn("Rollback the newer imports first", reason)

    def test_new_table_drop_is_allowed_when_newer_import_uses_another_table(self):
        imported = SimpleNamespace(
            id=2,
            database_name="ACME",
            schema_name="CUSTOMER_UPLOAD",
            imported_tables=["ORDERS"],
            rollback_plan={
                "version": 2,
                "database_created": False,
                "schema_created": False,
                "tables": [{"name": "ORDERS", "created": True, "rows_inserted": 3}],
            },
        )
        later = SimpleNamespace(
            schema_name="CUSTOMER_UPLOAD",
            imported_tables=["CUSTOMERS"],
            rollback_plan={
                "version": 2,
                "tables": [{"name": "CUSTOMERS", "created": False, "rows_inserted": 2}],
            },
        )

        self.assertIsNone(_rollback_dependency_reason(DependencyDb([later]), imported))


if __name__ == "__main__":
    unittest.main()
