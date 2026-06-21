from __future__ import annotations

from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session

from models.import_file import ImportFile
from models.user import Organization, User
from schemas.dashboard import DailyActivity, DashboardOverview, RecentImport, StatusCount

SUCCESS_STATUSES = {"SUCCESS"}
FAILED_STATUSES = {"FAILED"}
IN_PROGRESS_STATUSES = {"PENDING", "PROCESSING", "RUNNING"}


def _period_start(days: int) -> datetime:
    start_day = datetime.utcnow().date() - timedelta(days=max(days - 1, 0))
    return datetime.combine(start_day, time.min)


def _scoped_imports(db: Session, current_user: User):
    query = db.query(ImportFile)
    if current_user.role == "super_admin":
        return query, "platform", "All organizations"
    if current_user.role == "admin":
        organization = (
            db.query(Organization)
            .filter(Organization.id == current_user.organization_id)
            .first()
        )
        organization_name = organization.name if organization else "Unknown organization"
        organization_user_ids = db.query(User.id).filter(
            User.organization_id == current_user.organization_id
        )
        query = query.filter(
            or_(
                ImportFile.organization_id == current_user.organization_id,
                and_(
                    ImportFile.organization_id.is_(None),
                    ImportFile.user_id.in_(organization_user_ids),
                ),
                and_(
                    ImportFile.organization_id.is_(None),
                    ImportFile.entreprise_name == organization_name,
                ),
            )
        )
        return query, "organization", organization_name
    return query.filter(ImportFile.user_id == current_user.id), "user", current_user.username


def build_dashboard_overview(
    db: Session,
    *,
    current_user: User,
    days: int,
) -> DashboardOverview:
    scoped_query, scope, scope_name = _scoped_imports(db, current_user)
    query = scoped_query.filter(ImportFile.uploaded_at >= _period_start(days))
    normalized_status = func.upper(ImportFile.status)

    total_imports = query.count()
    successful_imports = query.filter(normalized_status.in_(SUCCESS_STATUSES)).count()
    failed_imports = query.filter(normalized_status.in_(FAILED_STATUSES)).count()
    in_progress_imports = query.filter(normalized_status.in_(IN_PROGRESS_STATUSES)).count()
    total_rows_loaded = (
        query.with_entities(func.coalesce(func.sum(ImportFile.rows_inserted), 0)).scalar() or 0
    )

    grouped_statuses = (
        query.with_entities(normalized_status.label("status"), func.count(ImportFile.id))
        .group_by(normalized_status)
        .order_by(normalized_status)
        .all()
    )
    by_status = [
        StatusCount(status=status or "PENDING", count=int(count or 0))
        for status, count in grouped_statuses
    ]

    import_day = func.date(ImportFile.uploaded_at)
    daily_rows = (
        query.with_entities(
            import_day.label("day"),
            func.count(ImportFile.id).label("total_imports"),
            func.sum(case((normalized_status.in_(SUCCESS_STATUSES), 1), else_=0)).label(
                "successful_imports"
            ),
            func.sum(case((normalized_status.in_(FAILED_STATUSES), 1), else_=0)).label(
                "failed_imports"
            ),
            func.coalesce(func.sum(ImportFile.rows_inserted), 0).label("rows_loaded"),
        )
        .group_by(import_day)
        .order_by(import_day)
        .all()
    )
    activity_by_day = []
    for row in daily_rows:
        total = int(row.total_imports or 0)
        success = int(row.successful_imports or 0)
        activity_by_day.append(
            DailyActivity(
                day=row.day if isinstance(row.day, date) else date.fromisoformat(str(row.day)),
                total_imports=total,
                successful_imports=success,
                failed_imports=int(row.failed_imports or 0),
                rows_loaded=int(row.rows_loaded or 0),
                success_rate=round((success / total) * 100, 1) if total else 0,
            )
        )

    recent_imports = [
        RecentImport(
            id=item.id,
            filename=item.original_filename,
            status=(item.status or "PENDING").upper(),
            rows_inserted=int(item.rows_inserted or 0),
            uploaded_at=item.uploaded_at,
            user_name=item.user_name,
            organization_name=item.organization_name or item.entreprise_name,
        )
        for item in scoped_query.order_by(ImportFile.uploaded_at.desc()).limit(6).all()
    ]

    return DashboardOverview(
        scope=scope,
        scope_name=scope_name,
        days=days,
        total_imports=total_imports,
        successful_imports=successful_imports,
        failed_imports=failed_imports,
        in_progress_imports=in_progress_imports,
        success_rate=round((successful_imports / total_imports) * 100, 1) if total_imports else 0,
        total_rows_loaded=int(total_rows_loaded),
        avg_rows_per_successful_import=round(total_rows_loaded / successful_imports, 1)
        if successful_imports
        else 0,
        by_status=by_status,
        activity_by_day=activity_by_day,
        recent_imports=recent_imports,
    )
