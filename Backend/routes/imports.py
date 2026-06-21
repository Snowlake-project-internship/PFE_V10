from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from database import get_db
from models.user import Organization, User
from schemas.import_file import (
    ImportAnalyzeResponse,
    ImportConfirmRequest,
    ImportFileResponse,
    ImportRollbackReadinessResponse,
    ImportRollbackResponse,
    ImportUploadResponse,
)
from services.import_service import (
    analyze_excel_import,
    import_cached_session,
    import_excel_to_snowflake,
    list_import_history,
    resolve_target_table,
)
from services.auth_service import get_current_user, is_organization_admin
from services.rollback_service import (
    build_rollback_statements,
    execute_rollback_statements,
    format_rollback_query,
    rollback_scope_message,
)
from services.snowflake_service import SnowflakeService
from models.import_file import ImportFile

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_TABULAR_EXTENSIONS = {".xlsx", ".xls", ".csv"}


def get_snowflake_service():
    try:
        service = SnowflakeService()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    try:
        yield service
    finally:
        service.close()


def _validate_tabular_upload(file: UploadFile) -> None:
    if not file.filename:
        raise HTTPException(status_code=400, detail="Filename is required.")

    lower_filename = file.filename.lower()
    if not any(lower_filename.endswith(extension) for extension in ALLOWED_TABULAR_EXTENSIONS):
        raise HTTPException(
            status_code=400,
            detail="Only .xlsx, .xls, and .csv files are accepted.",
        )


def _current_organization_name(db: Session, current_user: User) -> str:
    if current_user.organization_id is None:
        raise HTTPException(
            status_code=400,
            detail="Your account is not assigned to an organization. Contact an administrator.",
        )
    organization = (
        db.query(Organization)
        .filter(Organization.id == current_user.organization_id)
        .first()
    )
    if not organization or not organization.name.strip():
        raise HTTPException(
            status_code=400,
            detail="Your organization could not be found. Contact an administrator.",
        )
    return organization.name.strip()


@router.post("/upload", response_model=ImportUploadResponse, status_code=status.HTTP_201_CREATED)
async def upload_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    snowflake: SnowflakeService = Depends(get_snowflake_service),
) -> ImportUploadResponse:
    _validate_tabular_upload(file)
    entreprise_name = _current_organization_name(db, current_user)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = await run_in_threadpool(
            import_excel_to_snowflake,
            db=db,
            snowflake=snowflake,
            file_bytes=file_bytes,
            original_filename=file.filename,
            entreprise_name=entreprise_name,
            user_id=current_user.id,
            organization_id=current_user.organization_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.exception("Import runtime error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected import error")
        raise HTTPException(
            status_code=500,
            detail="Unexpected error while importing file data.",
        ) from exc

    return ImportUploadResponse(
        success=True,
        database=result.database,
        schema_name=result.schema,
        tables_created=result.tables_created,
        rows_inserted=result.rows_inserted,
        import_id=result.import_id,
    )


@router.post("/analyze", response_model=ImportAnalyzeResponse)
async def analyze_import(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    snowflake: SnowflakeService = Depends(get_snowflake_service),
) -> ImportAnalyzeResponse:
    _validate_tabular_upload(file)
    entreprise_name = _current_organization_name(db, current_user)

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")

    try:
        result = await run_in_threadpool(
            analyze_excel_import,
            file_bytes=file_bytes,
            original_filename=file.filename,
            entreprise_name=entreprise_name,
            user_id=current_user.id,
            organization_id=current_user.organization_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected analyze error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    database_name = result["database"]
    snowflake_org_exists = await run_in_threadpool(snowflake.database_exists, database_name)
    result["org_exists"] = snowflake_org_exists
    existing_tables: list[str] = []
    new_tables: list[str] = []
    if snowflake_org_exists:
        await run_in_threadpool(snowflake.use_database, database_name)
        schema_exists = await run_in_threadpool(snowflake.schema_exists, result["schema"])
        if schema_exists:
            await run_in_threadpool(snowflake.use_schema, result["schema"])
            for source in result["preview"].values():
                table_name, exists = await run_in_threadpool(
                    resolve_target_table,
                    snowflake,
                    source["table_name"],
                    source["columns"],
                )
                source["table_name"] = table_name
                source["action"] = "INSERT" if exists else "CREATE"
                (existing_tables if exists else new_tables).append(table_name)
        else:
            new_tables = [source["table_name"] for source in result["preview"].values()]
    else:
        new_tables = [source["table_name"] for source in result["preview"].values()]
    result["existing_tables"] = existing_tables
    result["new_tables"] = new_tables

    return ImportAnalyzeResponse(**result)


@router.post("/confirm", response_model=ImportUploadResponse, status_code=status.HTTP_201_CREATED)
async def confirm_import(
    request: ImportConfirmRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    snowflake: SnowflakeService = Depends(get_snowflake_service),
) -> ImportUploadResponse:
    entreprise_name = _current_organization_name(db, current_user)
    try:
        result = await run_in_threadpool(
            import_cached_session,
            db=db,
            snowflake=snowflake,
            session_id=request.session_id,
            user_id=current_user.id,
            organization_id=current_user.organization_id,
            entreprise_name=entreprise_name,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except RuntimeError as exc:
        logger.exception("Import runtime error")
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Unexpected import error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return ImportUploadResponse(
        success=True,
        database=result.database,
        schema_name=result.schema,
        tables_created=result.tables_created,
        rows_inserted=result.rows_inserted,
        import_id=result.import_id,
    )


@router.get("/history", response_model=list[ImportFileResponse])
def import_history(
    user_id: Optional[int] = None,
    organization_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role == "super_admin":
        return list_import_history(db, user_id=user_id, organization_id=organization_id)
    if is_organization_admin(current_user):
        return list_import_history(db, organization_id=current_user.organization_id)
    return list_import_history(db, user_id=current_user.id)


def _visible_import_query(db: Session, current_user: User, import_id: int):
    query = db.query(ImportFile).filter(ImportFile.id == import_id)
    if current_user.role != "super_admin":
        if current_user.organization_id is not None:
            query = query.filter(ImportFile.organization_id == current_user.organization_id)
        if not is_organization_admin(current_user):
            query = query.filter(ImportFile.user_id == current_user.id)
    return query


def _rollback_business_reason(import_file: ImportFile) -> Optional[str]:
    if (import_file.status or "").upper() != "SUCCESS":
        return "Only successful imports can be rolled back."
    if (import_file.rows_inserted or 0) <= 0:
        return "Rollback is unavailable because no rows were inserted."
    if import_file.rollback_status == "ROLLED_BACK":
        return "Import has already been rolled back."
    return None


def _rollback_statements(snowflake: SnowflakeService, import_file: ImportFile) -> list[str]:
    return build_rollback_statements(
        snowflake,
        database_name=import_file.database_name,
        schema_name=import_file.schema_name,
        import_id=import_file.id,
        rollback_plan=import_file.rollback_plan,
    )


def _authoritative_rollback_query(snowflake: SnowflakeService, import_file: ImportFile) -> str | None:
    return format_rollback_query(_rollback_statements(snowflake, import_file))


def _plan_table_names(import_file: ImportFile) -> set[str]:
    plan_tables = (import_file.rollback_plan or {}).get("tables") or []
    names = {str(table.get("name")) for table in plan_tables if table.get("name")}
    return names or set(import_file.imported_tables or [])


def _rollback_dependency_reason(
    db: Session,
    import_file: ImportFile,
) -> Optional[str]:
    plan = import_file.rollback_plan or {}
    if plan.get("version") != 2:
        return None

    later_imports = (
        db.query(ImportFile)
        .filter(
            ImportFile.id > import_file.id,
            ImportFile.database_name == import_file.database_name,
            ImportFile.status == "SUCCESS",
            ImportFile.rollback_status != "ROLLED_BACK",
        )
        .all()
    )
    if not later_imports:
        return None

    if plan.get("database_created"):
        return (
            "This upload created the database, but newer active imports use it. "
            "Rollback the newer imports first."
        )

    same_schema_imports = [
        later
        for later in later_imports
        if later.schema_name == import_file.schema_name
    ]
    if plan.get("schema_created") and same_schema_imports:
        return (
            "This upload created the schema, but newer active imports use it. "
            "Rollback the newer imports first."
        )

    created_tables = {
        str(table.get("name"))
        for table in plan.get("tables") or []
        if table.get("created") and table.get("name")
    }
    for later in same_schema_imports:
        shared_tables = created_tables & _plan_table_names(later)
        if shared_tables:
            return (
                f"Newer imports use table(s) created by this upload: "
                f"{', '.join(sorted(shared_tables))}. Rollback those imports first."
            )
    return None


def _snowflake_target_reason(snowflake: SnowflakeService, import_file: ImportFile) -> Optional[str]:
    if not snowflake.database_exists(import_file.database_name):
        return (
            f"Snowflake database '{import_file.database_name}' is not available in the current "
            "account or role. This import may belong to the previous Snowflake account."
        )
    if not snowflake.schema_exists_in_database(import_file.database_name, import_file.schema_name):
        return (
            f"Snowflake schema '{import_file.database_name}.{import_file.schema_name}' no longer "
            "exists, so there is no inserted data left to rollback."
        )
    return None


@router.get("/{import_id}/rollback-readiness", response_model=ImportRollbackReadinessResponse)
def rollback_readiness(
    import_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportRollbackReadinessResponse:
    import_file = _visible_import_query(db, current_user, import_id).first()
    if not import_file:
        raise HTTPException(status_code=404, detail="Import not found.")

    reason = _rollback_business_reason(import_file)
    reason = reason or _rollback_dependency_reason(db, import_file)
    if reason:
        return ImportRollbackReadinessResponse(
            import_id=import_file.id,
            available=False,
            rollback_status=import_file.rollback_status,
            reason=reason,
        )

    try:
        snowflake = SnowflakeService()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        snowflake.set_actor(
            user_id=current_user.id,
            organization_id=import_file.organization_id,
            import_id=import_file.id,
            filename=import_file.original_filename,
        )
        target_reason = _snowflake_target_reason(snowflake, import_file)
        rollback_query = _authoritative_rollback_query(snowflake, import_file)
        return ImportRollbackReadinessResponse(
            import_id=import_file.id,
            available=target_reason is None,
            rollback_status=import_file.rollback_status,
            reason=target_reason,
            rollback_query=rollback_query if target_reason is None else None,
        )
    finally:
        snowflake.close()


@router.post("/{import_id}/rollback", response_model=ImportRollbackResponse)
def rollback_import(
    import_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ImportRollbackResponse:
    import_file = _visible_import_query(db, current_user, import_id).first()
    if not import_file:
        raise HTTPException(status_code=404, detail="Import not found.")
    reason = _rollback_business_reason(import_file)
    reason = reason or _rollback_dependency_reason(db, import_file)
    if reason:
        raise HTTPException(status_code=409, detail=reason)

    try:
        snowflake = SnowflakeService()
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

    try:
        snowflake.set_actor(
            user_id=current_user.id,
            organization_id=import_file.organization_id,
            import_id=import_file.id,
            filename=import_file.original_filename,
        )
        target_reason = _snowflake_target_reason(snowflake, import_file)
        if target_reason:
            import_file.rollback_status = "UNAVAILABLE"
            import_file.rollback_error_message = target_reason
            import_file.rollback_failed_at = datetime.utcnow()
            db.commit()
            raise HTTPException(status_code=409, detail=target_reason)

        rollback_statements = _rollback_statements(snowflake, import_file)
        rollback_query = format_rollback_query(rollback_statements)
        import_file.rollback_query = rollback_query
        snowflake.current_database = import_file.database_name
        snowflake.current_schema = import_file.schema_name
        execute_rollback_statements(snowflake, rollback_statements)
    except HTTPException:
        raise
    except Exception as exc:
        import_file.rollback_status = "FAILED"
        import_file.rollback_error_message = str(exc)
        import_file.rollback_failed_at = datetime.utcnow()
        db.commit()
        raise HTTPException(status_code=500, detail=f"Rollback failed: {exc}") from exc
    finally:
        snowflake.close()

    import_file.rollback_status = "ROLLED_BACK"
    import_file.rolled_back_at = datetime.utcnow()
    import_file.rollback_error_message = None
    import_file.rollback_failed_at = None
    db.commit()
    db.refresh(import_file)
    return ImportRollbackResponse(
        success=True,
        import_id=import_file.id,
        rollback_status=import_file.rollback_status,
        rolled_back_at=import_file.rolled_back_at,
        message=(
            f"Upload #{import_file.id} rolled back. "
            f"{rollback_scope_message(import_file.rollback_plan)}"
        ),
    )
