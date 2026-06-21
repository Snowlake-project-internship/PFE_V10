from __future__ import annotations

import logging
import os
from typing import Any, Iterable, Optional

import pandas as pd
import snowflake.connector
from dotenv import load_dotenv
from logs.constants import LogLevel, OperationType
from logs.service import LoggerService
from logs.utils import (
    duration_ms,
    error_path_from_exception,
    exception_type_name,
    function_name_from_exception,
    infer_operation_type,
    infer_table_name,
    now_ms,
    stacktrace_from_exception,
)
from services.rollback_service import IMPORT_ID_COLUMN
from pandas.api import types as pdt
from snowflake.connector import SnowflakeConnection
from snowflake.connector.pandas_tools import write_pandas

load_dotenv()

logger = logging.getLogger(__name__)


class SnowflakeService:
    def __init__(self) -> None:
        self.connection = self._connect()
        self.current_database: Optional[str] = None
        self.current_schema: Optional[str] = None
        self.actor_user_id: Optional[int] = None
        self.actor_organization_id: Optional[int] = None
        self.current_import_id: Optional[int] = None
        self.current_import_filename: Optional[str] = None
        self.viewer_role = os.getenv("SNOWFLAKE_VIEWER_ROLE", "ACCOUNTADMIN")

    def _connect(self) -> SnowflakeConnection:
        required = {
            "user": os.getenv("SNOWFLAKE_USER"),
            "password": os.getenv("SNOWFLAKE_PASSWORD"),
            "account": os.getenv("SNOWFLAKE_ACCOUNT"),
            "warehouse": os.getenv("SNOWFLAKE_WAREHOUSE"),
            "role": os.getenv("SNOWFLAKE_ROLE"),
        }
        missing = [key.upper() for key, value in required.items() if not value]
        if missing:
            raise RuntimeError(f"Missing Snowflake environment variables: {', '.join(missing)}")

        return snowflake.connector.connect(**required)

    def close(self) -> None:
        self.connection.close()

    def __enter__(self) -> "SnowflakeService":
        return self

    def __exit__(self, exc_type: Any, exc: Any, tb: Any) -> None:
        self.close()

    def set_actor(
        self,
        *,
        user_id: Optional[int] = None,
        organization_id: Optional[int] = None,
        import_id: Optional[int] = None,
        filename: Optional[str] = None,
    ) -> None:
        self.actor_user_id = user_id
        self.actor_organization_id = organization_id
        self.current_import_id = import_id
        self.current_import_filename = filename

    def _log_details(self, extra: Optional[dict[str, Any]] = None) -> Optional[dict[str, Any]]:
        details = dict(extra or {})
        if self.current_import_id is not None:
            details["import_id"] = self.current_import_id
        if self.current_import_filename:
            details["filename"] = self.current_import_filename
        return details or None

    @staticmethod
    def quote_identifier(identifier: str) -> str:
        return f'"{identifier.replace(chr(34), chr(34) + chr(34))}"'

    def execute_query(
        self,
        query: str,
        params: Optional[Iterable[Any] | dict[str, Any]] = None,
        *,
        operation_type: Optional[str] = None,
        table_name: Optional[str] = None,
    ) -> list[tuple[Any, ...]]:
        logger.debug("Executing Snowflake query: %s", query)
        cursor = self.connection.cursor()
        start = now_ms()
        operation_type = operation_type or infer_operation_type(query)
        table_name = table_name or infer_table_name(query)
        snowflake_query_id = None
        try:
            cursor.execute(query, params)
            snowflake_query_id = getattr(cursor, "sfqid", None)
            if cursor.description:
                rows = cursor.fetchall()
            else:
                rows = []
            LoggerService.log_success(
                operation_type=operation_type,
                user_id=self.actor_user_id,
                organization_id=self.actor_organization_id,
                database_name=self.current_database,
                schema_name=self.current_schema,
                service_name="SnowflakeService",
                table_name=table_name,
                query_text=query,
                snowflake_query_id=snowflake_query_id,
                rows_affected=getattr(cursor, "rowcount", None),
                duration_ms=duration_ms(start),
                message="Snowflake query executed successfully",
                details=self._log_details(),
            )
            return rows
        except Exception as exc:
            snowflake_query_id = getattr(cursor, "sfqid", None)
            elapsed_ms = duration_ms(start)
            error_path = error_path_from_exception(exc, "services/snowflake_service.py -> execute_query()")
            function_name = function_name_from_exception(exc, "execute_query")
            execution_log_id = LoggerService.log_failure(
                operation_type=operation_type,
                user_id=self.actor_user_id,
                organization_id=self.actor_organization_id,
                database_name=self.current_database,
                schema_name=self.current_schema,
                service_name="SnowflakeService",
                table_name=table_name,
                query_text=query,
                snowflake_query_id=snowflake_query_id,
                duration_ms=elapsed_ms,
                error_message=str(exc),
                error_path=error_path,
                details=self._log_details(),
            )
            LoggerService.log_error(
                LoggerService.error_from_context(
                    execution_log_id=execution_log_id,
                    user_id=self.actor_user_id,
                    organization_id=self.actor_organization_id,
                    operation_type=operation_type,
                    level=LogLevel.ERROR,
                    service_name="SnowflakeService",
                    error_type=exception_type_name(exc),
                    exception_type=exception_type_name(exc),
                    error_message=str(exc),
                    error_path=error_path,
                    function_name=function_name,
                    stacktrace=stacktrace_from_exception(exc),
                    query_text=query,
                    snowflake_query_id=snowflake_query_id,
                    details={
                        "database": self.current_database,
                        "schema": self.current_schema,
                        "table": table_name,
                        "duration_ms": elapsed_ms,
                        **(self._log_details() or {}),
                    },
                )
            )
            raise
        finally:
            cursor.close()

    def create_database(self, database_name: str) -> None:
        self.execute_query(
            f"CREATE DATABASE IF NOT EXISTS {self.quote_identifier(database_name)}",
            operation_type=OperationType.CREATE_DATABASE,
        )
        self.grant_database_usage(database_name)

    def database_exists(self, database_name: str) -> bool:
        escaped = database_name.replace("'", "''")
        rows = self.execute_query(f"SHOW DATABASES LIKE '{escaped}'")
        return bool(rows)

    def use_database(self, database_name: str) -> None:
        self.execute_query(f"USE DATABASE {self.quote_identifier(database_name)}")
        self.current_database = database_name

    def create_schema(self, schema_name: str) -> None:
        self.execute_query(
            f"CREATE SCHEMA IF NOT EXISTS {self.quote_identifier(schema_name)}",
            operation_type=OperationType.CREATE_SCHEMA,
        )
        self.grant_schema_usage(schema_name)

    def use_schema(self, schema_name: str) -> None:
        self.execute_query(f"USE SCHEMA {self.quote_identifier(schema_name)}")
        self.current_schema = schema_name

    def schema_exists(self, schema_name: str) -> bool:
        escaped = schema_name.replace("'", "''")
        rows = self.execute_query(f"SHOW SCHEMAS LIKE '{escaped}'")
        return bool(rows)

    def schema_exists_in_database(self, database_name: str, schema_name: str) -> bool:
        escaped = schema_name.replace("'", "''")
        rows = self.execute_query(
            f"SHOW SCHEMAS LIKE '{escaped}' IN DATABASE {self.quote_identifier(database_name)}"
        )
        return bool(rows)

    def table_exists(self, table_name: str) -> bool:
        escaped = table_name.replace("'", "''")
        rows = self.execute_query(f"SHOW TABLES LIKE '{escaped}'")
        return bool(rows)

    def table_columns(self, table_name: str) -> set[str]:
        rows = self.execute_query(f"DESC TABLE {self.quote_identifier(table_name)}")
        return {str(row[0]).upper() for row in rows}

    def ensure_import_tracking_column(self, table_name: str) -> None:
        self.execute_query(
            f"""
            ALTER TABLE {self.quote_identifier(table_name)}
            ADD COLUMN IF NOT EXISTS {self.quote_identifier(IMPORT_ID_COLUMN)} NUMBER(38, 0)
            """,
            operation_type=OperationType.UPDATE,
            table_name=table_name,
        )

    def validate_dataframe_columns(self, table_name: str, dataframe: pd.DataFrame) -> None:
        existing_columns = self.table_columns(table_name)
        incoming_columns = {str(column).upper() for column in dataframe.columns}
        missing_columns = sorted(incoming_columns - existing_columns)
        if missing_columns:
            raise ValueError(
                f"Table '{table_name}' already exists but is missing incoming columns: "
                f"{', '.join(missing_columns)}."
            )

    def infer_snowflake_type(self, series: pd.Series) -> str:
        dtype = series.dtype
        if pdt.is_bool_dtype(dtype):
            return "BOOLEAN"
        if pdt.is_integer_dtype(dtype):
            return "NUMBER(38, 0)"
        if pdt.is_float_dtype(dtype):
            return "FLOAT"
        if pdt.is_datetime64_any_dtype(dtype):
            return "TIMESTAMP_NTZ"
        if pdt.is_timedelta64_dtype(dtype):
            return "VARCHAR"
        return "VARCHAR"

    def create_table_from_dataframe(self, table_name: str, dataframe: pd.DataFrame) -> None:
        if len(dataframe.columns) == 0:
            raise ValueError(f"Sheet '{table_name}' has no columns after cleaning.")

        columns_sql = []
        for column in dataframe.columns:
            snowflake_type = self.infer_snowflake_type(dataframe[column])
            columns_sql.append(f"{self.quote_identifier(str(column))} {snowflake_type}")

        self.execute_query(
            f"""
            CREATE TABLE IF NOT EXISTS {self.quote_identifier(table_name)}
            ({", ".join(columns_sql)})
            """,
            operation_type=OperationType.CREATE_TABLE,
            table_name=table_name,
        )
        self.grant_table_select(table_name)

    def grant_database_usage(self, database_name: str) -> None:
        if not self.viewer_role:
            return
        try:
            self.execute_query(
                f"""
                GRANT USAGE ON DATABASE {self.quote_identifier(database_name)}
                TO ROLE {self.quote_identifier(self.viewer_role)}
                """
            )
        except Exception:
            logger.warning("Could not grant database usage to role %s", self.viewer_role, exc_info=True)

    def grant_schema_usage(self, schema_name: str) -> None:
        if not self.viewer_role or not self.current_database:
            return
        try:
            self.execute_query(
                f"""
                GRANT USAGE ON SCHEMA
                {self.quote_identifier(self.current_database)}.{self.quote_identifier(schema_name)}
                TO ROLE {self.quote_identifier(self.viewer_role)}
                """
            )
        except Exception:
            logger.warning("Could not grant schema usage to role %s", self.viewer_role, exc_info=True)

    def grant_table_select(self, table_name: str) -> None:
        if not self.viewer_role or not self.current_database or not self.current_schema:
            return
        try:
            self.execute_query(
                f"""
                GRANT SELECT ON TABLE
                {self.quote_identifier(self.current_database)}.{self.quote_identifier(self.current_schema)}.{self.quote_identifier(table_name)}
                TO ROLE {self.quote_identifier(self.viewer_role)}
                """
            )
        except Exception:
            logger.warning("Could not grant table select to role %s", self.viewer_role, exc_info=True)

    def insert_dataframe(self, table_name: str, dataframe: pd.DataFrame) -> int:
        if dataframe.empty:
            return 0
        if not self.current_database or not self.current_schema:
            raise RuntimeError("Database and schema must be selected before inserting data.")

        start = now_ms()
        prepared = dataframe.copy().reset_index(drop=True)
        prepared = prepared.where(pd.notnull(prepared), None)
        for column in prepared.columns:
            if self.infer_snowflake_type(prepared[column]) == "VARCHAR":
                prepared[column] = prepared[column].map(
                    lambda value: None if value is None else str(value)
                )
        try:
            success, _, row_count, _ = write_pandas(
                conn=self.connection,
                df=prepared,
                table_name=table_name,
                database=self.current_database,
                schema=self.current_schema,
                quote_identifiers=True,
                auto_create_table=False,
            )
            if not success:
                raise RuntimeError(f"Snowflake failed to insert rows into table {table_name}.")

            inserted_rows = int(row_count)
            LoggerService.log_success(
                operation_type=OperationType.INSERT,
                user_id=self.actor_user_id,
                organization_id=self.actor_organization_id,
                database_name=self.current_database,
                schema_name=self.current_schema,
                service_name="SnowflakeService",
                table_name=table_name,
                rows_affected=inserted_rows,
                duration_ms=duration_ms(start),
                message=f"Inserted {inserted_rows} rows into {table_name}",
                details=self._log_details({"columns": [str(column) for column in dataframe.columns]}),
            )
            return inserted_rows
        except Exception as exc:
            elapsed_ms = duration_ms(start)
            error_path = error_path_from_exception(exc, "services/snowflake_service.py -> insert_dataframe()")
            function_name = function_name_from_exception(exc, "insert_dataframe")
            execution_log_id = LoggerService.log_failure(
                operation_type=OperationType.INSERT,
                user_id=self.actor_user_id,
                organization_id=self.actor_organization_id,
                database_name=self.current_database,
                schema_name=self.current_schema,
                service_name="SnowflakeService",
                table_name=table_name,
                rows_affected=0,
                duration_ms=elapsed_ms,
                error_message=str(exc),
                error_path=error_path,
                details=self._log_details({"dataframe_rows": int(len(dataframe))}),
            )
            LoggerService.log_error(
                LoggerService.error_from_context(
                    execution_log_id=execution_log_id,
                    user_id=self.actor_user_id,
                    organization_id=self.actor_organization_id,
                    operation_type=OperationType.INSERT,
                    level=LogLevel.ERROR,
                    service_name="SnowflakeService",
                    error_type=exception_type_name(exc),
                    exception_type=exception_type_name(exc),
                    error_message=str(exc),
                    error_path=error_path,
                    function_name=function_name,
                    stacktrace=stacktrace_from_exception(exc),
                    details={
                        "database": self.current_database,
                        "schema": self.current_schema,
                        "table": table_name,
                        "dataframe_rows": int(len(dataframe)),
                        "duration_ms": elapsed_ms,
                        **(self._log_details() or {}),
                    },
                )
            )
            raise
