from __future__ import annotations

from datetime import date, datetime, time
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, case, cast, Date, func, not_, or_, String
from sqlalchemy.orm import Session

from database import get_db
from logs.constants import ExecutionStatus, OperationType
from logs.models import ExecutionLog
from models.user import User
from services.auth_service import get_current_user, is_organization_admin

router = APIRouter()


def _scoped_logs_query(
    db: Session,
    current_user: User,
    *,
    organization_id: Optional[int] = None,
    user_id: Optional[int] = None,
):
    query = db.query(ExecutionLog)
    query = query.filter(
        or_(
            ExecutionLog.operation_type != OperationType.API_REQUEST,
            ExecutionLog.api_endpoint.is_(None),
            not_(ExecutionLog.api_endpoint.ilike("/api/logfiles%")),
        )
    )
    if current_user.role == "super_admin":
        if organization_id is not None:
            query = query.filter(ExecutionLog.organization_id == organization_id)
        if user_id is not None:
            query = query.filter(ExecutionLog.user_id == user_id)
        return query
    if current_user.organization_id is not None:
        query = query.filter(ExecutionLog.organization_id == current_user.organization_id)
        if not is_organization_admin(current_user):
            query = query.filter(ExecutionLog.user_id == current_user.id)
        return query
    return query.filter(ExecutionLog.user_id == current_user.id)


def _apply_common_filters(
    query,
    *,
    search: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
):
    if date_from and date_to and date_from > date_to:
        date_from, date_to = date_to, date_from
    if date_from:
        query = query.filter(ExecutionLog.created_at >= datetime.combine(date_from, time.min))
    if date_to:
        query = query.filter(ExecutionLog.created_at <= datetime.combine(date_to, time.max))
    if search:
        pattern = f"%{search}%"
        query = query.filter(
            or_(
                ExecutionLog.query_text.ilike(pattern),
                ExecutionLog.table_name.ilike(pattern),
                ExecutionLog.message.ilike(pattern),
                ExecutionLog.error_message.ilike(pattern),
                ExecutionLog.operation_type.ilike(pattern),
                ExecutionLog.service_name.ilike(pattern),
                cast(ExecutionLog.details, String).ilike(pattern),
            )
        )
    return query


def _apply_import_scope(
    query,
    *,
    import_id: Optional[int] = None,
    filename: Optional[str] = None,
    database_name: Optional[str] = None,
    schema_name: Optional[str] = None,
):
    conditions = []
    details_text = cast(ExecutionLog.details, String)
    if import_id is not None:
        conditions.append(
            or_(
                ExecutionLog.details["import_id"].as_integer() == import_id,
                ExecutionLog.details["import_id"].as_string() == str(import_id),
            )
        )
    if database_name and schema_name:
        conditions.append(
            and_(
                ExecutionLog.database_name == database_name,
                ExecutionLog.schema_name == schema_name,
            )
        )
    elif database_name:
        conditions.append(ExecutionLog.database_name == database_name)
    elif schema_name:
        conditions.append(ExecutionLog.schema_name == schema_name)
    if filename:
        conditions.append(details_text.ilike(f"%{filename}%"))
    if conditions:
        query = query.filter(or_(*conditions))
    return query


@router.get("")
def list_log_files(
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    import_id: Optional[int] = None,
    filename: Optional[str] = None,
    database_name: Optional[str] = None,
    schema_name: Optional[str] = None,
    organization_id: Optional[int] = None,
    user_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    base_query = _apply_common_filters(
        _scoped_logs_query(
            db,
            current_user,
            organization_id=organization_id,
            user_id=user_id,
        ),
        search=search,
        date_from=date_from,
        date_to=date_to,
    )
    base_query = _apply_import_scope(
        base_query,
        import_id=import_id,
        filename=filename,
        database_name=database_name,
        schema_name=schema_name,
    )

    log_date = cast(ExecutionLog.created_at, Date).label("log_date")
    failed_count = func.sum(case((ExecutionLog.status == ExecutionStatus.FAILED, 1), else_=0)).label("failed_count")
    success_count = func.sum(case((ExecutionLog.status == ExecutionStatus.SUCCESS, 1), else_=0)).label("success_count")
    warning_count = func.sum(case((ExecutionLog.level == "WARNING", 1), else_=0)).label("warning_count")

    grouped = (
        base_query.with_entities(
            log_date,
            func.count(ExecutionLog.id).label("operation_count"),
            failed_count,
            success_count,
            warning_count,
            func.min(ExecutionLog.created_at).label("first_seen_at"),
            func.max(ExecutionLog.created_at).label("last_seen_at"),
        )
        .group_by(log_date)
    )

    if status:
        normalized_status = status.upper()
        if normalized_status == "FAILED":
            grouped = grouped.having(failed_count > 0)
        elif normalized_status == "WARNING":
            grouped = grouped.having(failed_count == 0).having(warning_count > 0)
        elif normalized_status == "SUCCESS":
            grouped = grouped.having(failed_count == 0).having(warning_count == 0)
        else:
            grouped = grouped.having(
                func.sum(case((ExecutionLog.status == normalized_status, 1), else_=0)) > 0
            )

    total = grouped.count()
    rows = (
        grouped.order_by(log_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for row in rows:
        failed = int(row.failed_count or 0)
        success = int(row.success_count or 0)
        warnings = int(row.warning_count or 0)
        if failed:
            summary = "FAILED"
        elif warnings:
            summary = "WARNING"
        else:
            summary = "SUCCESS"
        items.append(
            {
                "date": row.log_date.isoformat(),
                "label": row.log_date.strftime("%d/%m/%Y"),
                "operation_count": int(row.operation_count or 0),
                "success_count": success,
                "error_count": failed,
                "warning_count": warnings,
                "status_summary": summary,
                "first_seen_at": row.first_seen_at,
                "last_seen_at": row.last_seen_at,
            }
        )

    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/{log_date}")
def get_log_file_details(
    log_date: date,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    status: Optional[str] = None,
    search: Optional[str] = None,
    import_id: Optional[int] = None,
    filename: Optional[str] = None,
    database_name: Optional[str] = None,
    schema_name: Optional[str] = None,
    organization_id: Optional[int] = None,
    user_id: Optional[int] = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    start = datetime.combine(log_date, time.min)
    end = datetime.combine(log_date, time.max)
    query = _scoped_logs_query(
        db,
        current_user,
        organization_id=organization_id,
        user_id=user_id,
    ).filter(
        ExecutionLog.created_at >= start,
        ExecutionLog.created_at <= end,
    )
    if status:
        query = query.filter(ExecutionLog.status == status.upper())
    query = _apply_common_filters(query, search=search)
    query = _apply_import_scope(
        query,
        import_id=import_id,
        filename=filename,
        database_name=database_name,
        schema_name=schema_name,
    )

    total = query.count()
    rows = (
        query.order_by(ExecutionLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    summary_query = _scoped_logs_query(
        db,
        current_user,
        organization_id=organization_id,
        user_id=user_id,
    ).filter(
        ExecutionLog.created_at >= start,
        ExecutionLog.created_at <= end,
    )
    summary_query = _apply_import_scope(
        summary_query,
        import_id=import_id,
        filename=filename,
        database_name=database_name,
        schema_name=schema_name,
    )
    total_success = summary_query.filter(ExecutionLog.status == ExecutionStatus.SUCCESS).count()
    total_failed = summary_query.filter(ExecutionLog.status == ExecutionStatus.FAILED).count()
    total_warnings = summary_query.filter(ExecutionLog.level == "WARNING").count()
    if total_failed:
        status_summary = "FAILED"
    elif total_warnings:
        status_summary = "WARNING"
    else:
        status_summary = "SUCCESS"

    return {
        "date": log_date.isoformat(),
        "label": log_date.strftime("%d/%m/%Y"),
        "summary": {
            "operation_count": summary_query.count(),
            "success_count": total_success,
            "error_count": total_failed,
            "warning_count": total_warnings,
            "status_summary": status_summary,
        },
        "items": [
            {
                "id": row.id,
                "timestamp": row.created_at,
                "operation_type": row.operation_type,
                "filename": (row.details or {}).get("filename") if isinstance(row.details, dict) else None,
                "table_name": row.table_name,
                "database_name": row.database_name,
                "schema_name": row.schema_name,
                "status": row.status,
                "level": row.level,
                "service_name": row.service_name,
                "rows_affected": row.rows_affected,
                "duration_ms": row.duration_ms,
                "error_message": row.error_message,
                "query_text": row.query_text,
                "snowflake_query_id": row.snowflake_query_id,
                "import_id": (row.details or {}).get("import_id") if isinstance(row.details, dict) else None,
            }
            for row in rows
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }
