from __future__ import annotations

import logging
import uuid
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timedelta
from hashlib import sha256
from typing import Any, Dict, Optional

import pandas as pd
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from models.import_file import ImportFile
from models.user import Organization
from logs.constants import ExecutionStatus, LogLevel, OperationType
from logs.service import LoggerService
from logs.utils import (
    duration_ms,
    error_path_from_exception,
    exception_type_name,
    function_name_from_exception,
    now_ms,
    stacktrace_from_exception,
)
from services.excel_service import read_tabular_file, sanitize_name
from services.rollback_service import (
    IMPORT_ID_COLUMN,
    add_table_to_plan,
    build_rollback_statements,
    execute_rollback_statements,
    format_rollback_query,
    new_rollback_plan,
)
from services.snowflake_service import SnowflakeService

logger = logging.getLogger(__name__)
RESERVED_IMPORT_COLUMNS = {IMPORT_ID_COLUMN, IMPORT_ID_COLUMN.lstrip("_")}


@dataclass(frozen=True)
class ImportResult:
    database: str
    schema: str
    tables_created: list[str]
    rows_inserted: int
    import_id: int


IMPORT_SESSION_CACHE: dict[str, dict[str, Any]] = {}
IMPORT_SESSION_TTL = timedelta(minutes=30)


def _unique_table_names(sheets: Dict[str, pd.DataFrame]) -> dict[str, str]:
    seen: dict[str, int] = {}
    table_names: dict[str, str] = {}

    for sheet_name in sheets:
        base_name = sanitize_name(sheet_name, fallback="SHEET")
        count = seen.get(base_name, 0) + 1
        seen[base_name] = count
        if count == 1:
            table_names[sheet_name] = base_name
            continue

        suffix = f"_{count}"
        table_names[sheet_name] = f"{base_name[:255 - len(suffix)]}{suffix}"

    return table_names


def _normalized_business_columns(columns: Any) -> set[str]:
    return {
        str(column).upper()
        for column in columns
        if str(column).upper() != IMPORT_ID_COLUMN
    }


def _structure_table_name(base_table_name: str, columns: Any) -> str:
    normalized = sorted(_normalized_business_columns(columns))
    fingerprint = sha256("|".join(normalized).encode("utf-8")).hexdigest()[:8].upper()
    suffix = f"_STRUCT_{fingerprint}"
    return f"{base_table_name[:255 - len(suffix)]}{suffix}"


def resolve_target_table(
    snowflake: SnowflakeService,
    base_table_name: str,
    columns: Any,
) -> tuple[str, bool]:
    incoming_columns = _normalized_business_columns(columns)
    if not snowflake.table_exists(base_table_name):
        return base_table_name, False

    base_columns = _normalized_business_columns(snowflake.table_columns(base_table_name))
    if base_columns == incoming_columns:
        return base_table_name, True

    structure_table_name = _structure_table_name(base_table_name, incoming_columns)
    if not snowflake.table_exists(structure_table_name):
        return structure_table_name, False

    structure_columns = _normalized_business_columns(
        snowflake.table_columns(structure_table_name)
    )
    if structure_columns != incoming_columns:
        raise ValueError(
            f"Structure table name collision for '{base_table_name}'. "
            "Rename the worksheet and retry."
        )
    return structure_table_name, True


def _cleanup_import_sessions() -> None:
    expires_before = datetime.utcnow() - IMPORT_SESSION_TTL
    expired = [
        session_id
        for session_id, payload in IMPORT_SESSION_CACHE.items()
        if payload["created_at"] < expires_before
    ]
    for session_id in expired:
        IMPORT_SESSION_CACHE.pop(session_id, None)


def analyze_excel_import(
    *,
    file_bytes: bytes,
    original_filename: str,
    entreprise_name: str,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> dict[str, Any]:
    start = now_ms()
    _cleanup_import_sessions()
    try:
        sheets = read_tabular_file(file_bytes, original_filename)
        if not sheets:
            raise ValueError("The file does not contain readable data.")
    except Exception as exc:
        LoggerService.log_execution(
            LoggerService.execution_from_context(
                user_id=user_id,
                organization_id=organization_id,
                operation_type=OperationType.ANALYZE,
                status=ExecutionStatus.FAILED,
                level=LogLevel.ERROR,
                service_name="ImportService",
                duration_ms=duration_ms(start),
                error_message=str(exc),
                error_path=error_path_from_exception(exc, "services/import_service.py -> analyze_excel_import()"),
                details={"filename": original_filename, "entreprise_name": entreprise_name},
            )
        )
        LoggerService.log_error(
            LoggerService.error_from_context(
                user_id=user_id,
                organization_id=organization_id,
                operation_type=OperationType.ANALYZE,
                level=LogLevel.ERROR,
                service_name="ImportService",
                error_type=exception_type_name(exc),
                exception_type=exception_type_name(exc),
                error_message=str(exc),
                error_path=error_path_from_exception(exc, "services/import_service.py -> analyze_excel_import()"),
                function_name=function_name_from_exception(exc, "analyze_excel_import"),
                stacktrace=stacktrace_from_exception(exc),
                details={"filename": original_filename, "entreprise_name": entreprise_name},
            )
        )
        raise

    table_names = _unique_table_names(sheets)
    preview: dict[str, Any] = {}
    duplicates: dict[str, Any] = {}
    invalid_values: dict[str, Any] = {}
    quality_summary = {
        "original_rows": 0,
        "cleaned_rows": 0,
        "rows_removed": 0,
        "empty_rows_removed": 0,
        "duplicate_rows_removed": 0,
        "malformed_rows_removed": 0,
        "invalid_values_replaced": 0,
        "null_cells_remaining": 0,
        "rows_with_nulls": 0,
        "empty_columns_removed": 0,
        "importable_sources": 0,
        "empty_sources": 0,
    }

    for sheet_name, dataframe in sheets.items():
        table_name = table_names[sheet_name]
        quality = dataframe.attrs.get("quality_profile", {})
        warnings: list[str] = []
        if quality.get("null_cells_remaining"):
            warnings.append(
                f"{quality['null_cells_remaining']} cellule(s) NULL seront conservée(s)."
            )
        if quality.get("null_heavy_columns"):
            warnings.append(
                f"{len(quality['null_heavy_columns'])} colonne(s) contiennent au moins 50% de valeurs NULL."
            )
        if quality.get("malformed_rows_removed"):
            warnings.append(
                f"{quality['malformed_rows_removed']} ligne(s) CSV mal formée(s) ont été ignorée(s)."
            )
        if not len(dataframe.columns) or not len(dataframe):
            warnings.append("Cette source ne contient aucune ligne exploitable après nettoyage.")
            quality_summary["empty_sources"] += 1
        else:
            quality_summary["importable_sources"] += 1

        preview[sheet_name] = {
            "rows": int(len(dataframe)),
            "columns": [str(column) for column in dataframe.columns],
            "table_name": table_name,
            "action": "CREATE",
            "warnings": warnings,
            "quality": quality,
        }
        for key in quality_summary:
            if key not in {"importable_sources", "empty_sources"}:
                quality_summary[key] += int(quality.get(key, 0))

        duplicate_count = int(dataframe.attrs.get("duplicate_count", 0))
        if duplicate_count:
            duplicates[sheet_name] = {
                "count": duplicate_count,
                "examples": dataframe.attrs.get("duplicate_examples", []),
            }

        invalid_count = int(dataframe.attrs.get("invalid_count", 0))
        if invalid_count:
            invalid_values[sheet_name] = {
                "count": invalid_count,
                "examples": dataframe.attrs.get("invalid_examples", []),
            }

    session_id = str(uuid.uuid4())
    IMPORT_SESSION_CACHE[session_id] = {
        "file_bytes": file_bytes,
        "original_filename": original_filename,
        "entreprise_name": entreprise_name,
        "user_id": user_id,
        "organization_id": organization_id,
        "created_at": datetime.utcnow(),
    }

    LoggerService.log_execution(
        LoggerService.execution_from_context(
            user_id=user_id,
            organization_id=organization_id,
            session_id=session_id,
            operation_type=OperationType.ANALYZE,
            status=ExecutionStatus.SUCCESS,
            level=LogLevel.INFO,
            service_name="ImportService",
            rows_affected=sum(int(len(dataframe)) for dataframe in sheets.values()),
            duration_ms=duration_ms(start),
            message=f"Analyzed file {original_filename}",
            details={
                "filename": original_filename,
                "entreprise_name": entreprise_name,
                "tables": list(table_names.values()),
                "duplicates": duplicates,
                "invalid_values": invalid_values,
                "quality_summary": quality_summary,
            },
        )
    )

    return {
        "session_id": session_id,
        "org_name": entreprise_name,
        "database": sanitize_name(entreprise_name, fallback="ENTREPRISE"),
        "schema": sanitize_name(original_filename, fallback="IMPORT"),
        "org_exists": False,
        "preview": preview,
        "duplicates": duplicates,
        "has_duplicates": bool(duplicates),
        "invalid_values": invalid_values,
        "has_invalid_values": bool(invalid_values),
        "quality_summary": quality_summary,
        "can_import": quality_summary["importable_sources"] > 0,
        "blocking_issues": (
            [] if quality_summary["importable_sources"] > 0
            else ["Le fichier ne contient aucune ligne exploitable après nettoyage."]
        ),
        "existing_tables": [],
        "new_tables": [
            table_names[sheet_name]
            for sheet_name, dataframe in sheets.items()
            if len(dataframe.columns) and len(dataframe)
        ],
    }


def import_cached_session(
    *,
    db: Session,
    snowflake: SnowflakeService,
    session_id: str,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
    entreprise_name: Optional[str] = None,
) -> ImportResult:
    _cleanup_import_sessions()
    payload = IMPORT_SESSION_CACHE.get(session_id)
    if not payload:
        raise ValueError("Import session expired. Upload the file again.")

    result = import_excel_to_snowflake(
        db=db,
        snowflake=snowflake,
        file_bytes=payload["file_bytes"],
        original_filename=payload["original_filename"],
        entreprise_name=entreprise_name or payload["entreprise_name"],
        user_id=user_id if user_id is not None else payload.get("user_id"),
        organization_id=organization_id if organization_id is not None else payload.get("organization_id"),
    )
    IMPORT_SESSION_CACHE.pop(session_id, None)
    return result


def import_excel_to_snowflake(
    *,
    db: Session,
    snowflake: SnowflakeService,
    file_bytes: bytes,
    original_filename: str,
    entreprise_name: str,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> ImportResult:
    start = now_ms()
    database_name = sanitize_name(entreprise_name, fallback="ENTREPRISE")
    base_schema_name = sanitize_name(original_filename, fallback="IMPORT")
    metadata = ImportFile(
        user_id=user_id,
        organization_id=organization_id,
        entreprise_name=entreprise_name,
        database_name=database_name,
        schema_name=base_schema_name,
        original_filename=original_filename,
        status="PENDING",
        rollback_status="PENDING",
    )
    db.add(metadata)
    db.commit()
    db.refresh(metadata)

    current_step = "File Read"
    current_table: Optional[str] = None
    schema_name = base_schema_name
    tables_created: list[str] = []
    rows_inserted = 0
    rollback_status = "PENDING"
    rollback_query: Optional[str] = None
    rollback_plan: Optional[dict[str, Any]] = None

    try:
        metadata.status = "PROCESSING"
        db.commit()

        sheets = read_tabular_file(file_bytes, original_filename)
        if not sheets:
            raise ValueError("The file does not contain readable data.")
        sheets = {
            sheet_name: dataframe
            for sheet_name, dataframe in sheets.items()
            if len(dataframe.columns) and len(dataframe)
        }
        if not sheets:
            raise ValueError("The file does not contain any usable rows after cleaning.")

        table_names = _unique_table_names(sheets)
        snowflake.set_actor(
            user_id=user_id,
            organization_id=organization_id,
            import_id=metadata.id,
            filename=original_filename,
        )

        # Organization = database. Reuse existing objects and record exactly
        # which objects/rows belong to this import for a precise rollback.
        current_step = "Snowflake Database"
        database_created = not snowflake.database_exists(database_name)
        snowflake.create_database(database_name)
        snowflake.use_database(database_name)

        current_step = "Snowflake Schema"
        schema_name = base_schema_name
        schema_created = not snowflake.schema_exists(schema_name)
        rollback_plan = new_rollback_plan(
            import_id=metadata.id,
            database_created=database_created,
            schema_created=schema_created,
        )
        metadata.schema_name = schema_name
        metadata.rollback_plan = deepcopy(rollback_plan)
        metadata.rollback_query = format_rollback_query(
            build_rollback_statements(
                snowflake,
                database_name=database_name,
                schema_name=schema_name,
                import_id=metadata.id,
                rollback_plan=rollback_plan,
            )
        )
        db.commit()

        if schema_created:
            snowflake.create_schema(schema_name)
        snowflake.use_schema(schema_name)

        for sheet_name, dataframe in sheets.items():
            base_table_name = table_names[sheet_name]
            table_name, table_exists = resolve_target_table(
                snowflake,
                base_table_name,
                dataframe.columns,
            )
            current_table = table_name
            current_step = "Column Validation"
            reserved_columns = RESERVED_IMPORT_COLUMNS & {
                str(column).upper() for column in dataframe.columns
            }
            if reserved_columns:
                raise ValueError(
                    f"Column '{sorted(reserved_columns)[0]}' is reserved for rollback tracking."
                )

            prepared_dataframe = dataframe.copy()
            prepared_dataframe[IMPORT_ID_COLUMN] = metadata.id
            table_created = not table_exists
            current_step = "Snowflake Table Create"
            if table_created:
                snowflake.create_table_from_dataframe(table_name, prepared_dataframe)
            else:
                snowflake.ensure_import_tracking_column(table_name)
                snowflake.validate_dataframe_columns(table_name, prepared_dataframe)

            table_plan = add_table_to_plan(
                rollback_plan,
                table_name=table_name,
                table_created=table_created,
                rows_inserted=len(prepared_dataframe),
            )
            rollback_query = format_rollback_query(
                build_rollback_statements(
                    snowflake,
                    database_name=database_name,
                    schema_name=schema_name,
                    import_id=metadata.id,
                    rollback_plan=rollback_plan,
                )
            )
            metadata.rollback_plan = deepcopy(rollback_plan)
            metadata.rollback_query = rollback_query
            db.commit()

            current_step = "Snowflake Load"
            inserted_for_table = snowflake.insert_dataframe(table_name, prepared_dataframe)
            table_plan["rows_inserted"] = inserted_for_table
            rows_inserted += inserted_for_table
            tables_created.append(table_name)

        metadata.schema_name = schema_name
        metadata.rows_inserted = rows_inserted
        metadata.imported_tables = tables_created
        metadata.status = "SUCCESS"
        metadata.rollback_plan = deepcopy(rollback_plan)
        metadata.rollback_query = rollback_query
        metadata.error_type = None
        metadata.error_message = None
        metadata.failure_step = None
        metadata.sql_error_details = None
        metadata.failed_at = None
        metadata.failed_table_name = None
        db.commit()
        db.refresh(metadata)

        result = ImportResult(
            database=database_name,
            schema=schema_name,
            tables_created=tables_created,
            rows_inserted=rows_inserted,
            import_id=metadata.id,
        )
        LoggerService.log_execution(
            LoggerService.execution_from_context(
                user_id=user_id,
                organization_id=organization_id,
                operation_type=OperationType.FILE_UPLOAD,
                status=ExecutionStatus.SUCCESS,
                level=LogLevel.INFO,
                service_name="ImportService",
                database_name=database_name,
                schema_name=schema_name,
                rows_affected=rows_inserted,
                duration_ms=duration_ms(start),
                message=f"Imported {original_filename} into Snowflake",
                details={
                    "filename": original_filename,
                    "entreprise_name": entreprise_name,
                    "tables_created": tables_created,
                    "import_id": metadata.id,
                },
            )
        )
        return result
    except Exception as exc:
        db.rollback()
        logger.exception("File import failed for %s", original_filename)
        failed_at = datetime.utcnow()
        error_type = exception_type_name(exc)
        sql_error_details = str(exc) if current_step.startswith("Snowflake") else None

        if rollback_plan:
            try:
                rollback_statements = build_rollback_statements(
                    snowflake,
                    database_name=database_name,
                    schema_name=schema_name,
                    import_id=metadata.id,
                    rollback_plan=rollback_plan,
                )
                rollback_query = format_rollback_query(rollback_statements)
                execute_rollback_statements(snowflake, rollback_statements)
                rollback_status = "ROLLED_BACK"
            except Exception as rollback_exc:
                rollback_status = "FAILED"
                LoggerService.log_error(
                    LoggerService.error_from_context(
                        user_id=user_id,
                        organization_id=organization_id,
                        operation_type=OperationType.DROP,
                        level=LogLevel.ERROR,
                        service_name="ImportService",
                        error_type=exception_type_name(rollback_exc),
                        exception_type=exception_type_name(rollback_exc),
                        error_message=str(rollback_exc),
                        error_path=error_path_from_exception(
                            rollback_exc,
                            "services/import_service.py -> import_excel_to_snowflake() rollback",
                        ),
                        function_name=function_name_from_exception(rollback_exc, "import_excel_to_snowflake"),
                        stacktrace=stacktrace_from_exception(rollback_exc),
                        details={
                            "filename": original_filename,
                            "entreprise_name": entreprise_name,
                            "rollback_query": rollback_query,
                            "import_id": metadata.id,
                        },
                    )
                )

        metadata.status = "FAILED"
        metadata.schema_name = schema_name
        metadata.rows_inserted = rows_inserted
        metadata.imported_tables = tables_created
        metadata.rollback_status = rollback_status
        metadata.rollback_plan = deepcopy(rollback_plan) if rollback_plan else None
        metadata.rollback_query = rollback_query
        metadata.error_type = error_type
        metadata.error_message = str(exc)
        metadata.failure_step = current_step
        metadata.sql_error_details = sql_error_details
        metadata.failed_at = failed_at
        metadata.failed_table_name = current_table
        db.add(metadata)
        db.commit()

        LoggerService.log_execution(
            LoggerService.execution_from_context(
                user_id=user_id,
                organization_id=organization_id,
                operation_type=OperationType.FILE_UPLOAD,
                status=ExecutionStatus.FAILED,
                level=LogLevel.ERROR,
                service_name="ImportService",
                database_name=database_name,
                schema_name=schema_name,
                table_name=current_table,
                duration_ms=duration_ms(start),
                error_message=str(exc),
                error_path=error_path_from_exception(exc, "services/import_service.py -> import_excel_to_snowflake()"),
                details={
                    "filename": original_filename,
                    "entreprise_name": entreprise_name,
                    "failure_step": current_step,
                    "rollback_status": rollback_status,
                    "import_id": metadata.id,
                },
            )
        )
        LoggerService.log_error(
            LoggerService.error_from_context(
                user_id=user_id,
                organization_id=organization_id,
                operation_type=OperationType.FILE_UPLOAD,
                level=LogLevel.ERROR,
                service_name="ImportService",
                error_type=exception_type_name(exc),
                exception_type=exception_type_name(exc),
                error_message=str(exc),
                error_path=error_path_from_exception(exc, "services/import_service.py -> import_excel_to_snowflake()"),
                function_name=function_name_from_exception(exc, "import_excel_to_snowflake"),
                stacktrace=stacktrace_from_exception(exc),
                details={
                    "filename": original_filename,
                    "entreprise_name": entreprise_name,
                    "failure_step": current_step,
                    "table": current_table,
                    "rollback_status": rollback_status,
                    "import_id": metadata.id,
                },
            )
        )
        raise


def list_import_history(
    db: Session,
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
) -> list[ImportFile]:
    query = db.query(ImportFile)
    if organization_id is not None:
        organization = db.query(Organization).filter(Organization.id == organization_id).first()
        if organization:
            query = query.filter(
                or_(
                    ImportFile.organization_id == organization_id,
                    and_(
                        ImportFile.organization_id.is_(None),
                        ImportFile.entreprise_name == organization.name,
                    ),
                )
            )
        else:
            query = query.filter(ImportFile.organization_id == organization_id)
    if user_id is not None:
        query = query.filter(ImportFile.user_id == user_id)
    return query.order_by(ImportFile.uploaded_at.desc()).limit(100).all()
