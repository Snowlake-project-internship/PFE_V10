from __future__ import annotations

from typing import Any, Iterable

from logs.constants import OperationType


IMPORT_ID_COLUMN = "_SNOWFAST_IMPORT_ID"
ROLLBACK_PLAN_VERSION = 2


def new_rollback_plan(
    *,
    import_id: int,
    database_created: bool,
    schema_created: bool,
) -> dict[str, Any]:
    return {
        "version": ROLLBACK_PLAN_VERSION,
        "import_id": import_id,
        "database_created": database_created,
        "schema_created": schema_created,
        "tables": [],
    }


def add_table_to_plan(
    plan: dict[str, Any],
    *,
    table_name: str,
    table_created: bool,
    rows_inserted: int,
) -> dict[str, Any]:
    table_plan = {
        "name": table_name,
        "created": table_created,
        "rows_inserted": rows_inserted,
    }
    plan["tables"].append(table_plan)
    return table_plan


def build_rollback_statements(
    snowflake: Any,
    *,
    database_name: str,
    schema_name: str,
    import_id: int,
    rollback_plan: dict[str, Any] | None,
) -> list[str]:
    quote = snowflake.quote_identifier
    database = quote(database_name)
    schema = quote(schema_name)

    # Imports created before action-aware rollback used one isolated schema per
    # upload, so their safe legacy rollback remains DROP SCHEMA.
    if not rollback_plan or rollback_plan.get("version") != ROLLBACK_PLAN_VERSION:
        return [f"DROP SCHEMA IF EXISTS {database}.{schema} CASCADE"]

    if rollback_plan.get("database_created"):
        return [f"DROP DATABASE IF EXISTS {database} CASCADE"]
    if rollback_plan.get("schema_created"):
        return [f"DROP SCHEMA IF EXISTS {database}.{schema} CASCADE"]

    statements: list[str] = []
    for table in reversed(rollback_plan.get("tables") or []):
        table_name = table.get("name")
        if not table_name:
            continue
        qualified_table = f"{database}.{schema}.{quote(table_name)}"
        if table.get("created"):
            statements.append(f"DROP TABLE IF EXISTS {qualified_table}")
        elif int(table.get("rows_inserted") or 0) > 0:
            statements.append(
                f"DELETE FROM {qualified_table} "
                f"WHERE {quote(IMPORT_ID_COLUMN)} = {int(import_id)}"
            )
    return statements


def format_rollback_query(statements: Iterable[str]) -> str | None:
    items = [statement.rstrip(";") for statement in statements if statement]
    return ";\n".join(items) + (";" if items else "") or None


def execute_rollback_statements(snowflake: Any, statements: Iterable[str]) -> None:
    for statement in statements:
        operation_type = (
            OperationType.DELETE
            if statement.lstrip().upper().startswith("DELETE")
            else OperationType.DROP
        )
        snowflake.execute_query(statement, operation_type=operation_type)


def rollback_scope_message(rollback_plan: dict[str, Any] | None) -> str:
    if not rollback_plan or rollback_plan.get("version") != ROLLBACK_PLAN_VERSION:
        return "The isolated schema created by this legacy upload was removed."
    if rollback_plan.get("database_created"):
        return "The database created by this upload was removed."
    if rollback_plan.get("schema_created"):
        return "The schema created by this upload was removed."

    created_tables = [
        table["name"]
        for table in rollback_plan.get("tables") or []
        if table.get("created") and table.get("name")
    ]
    appended_tables = [
        table["name"]
        for table in rollback_plan.get("tables") or []
        if not table.get("created") and int(table.get("rows_inserted") or 0) > 0
    ]
    parts: list[str] = []
    if created_tables:
        parts.append(f"new tables removed: {', '.join(created_tables)}")
    if appended_tables:
        parts.append(f"rows from this import removed from: {', '.join(appended_tables)}")
    return "; ".join(parts).capitalize() + "." if parts else "Nothing needed to be removed."
