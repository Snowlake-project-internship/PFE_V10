from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import get_db
from models.import_file import ImportFile
from models.user import Organization, User
from schemas.dashboard import DashboardOverview
from services.auth_service import get_current_user
from services.dashboard_service import build_dashboard_overview

router = APIRouter()


@router.get("/")
def dashboard_health():
    return {"status": "ok"}


@router.get("/overview", response_model=DashboardOverview)
def dashboard_overview(
    days: int = Query(30, ge=1, le=365),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return build_dashboard_overview(db, current_user=current_user, days=days)


@router.get("/super-admin")
def super_admin_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")

    total_imports = db.query(ImportFile).count()
    failed_imports = db.query(ImportFile).filter(ImportFile.status == "FAILED").count()
    success_imports = db.query(ImportFile).filter(ImportFile.status == "SUCCESS").count()

    return {
        "total_users": db.query(User).filter(User.role == "user").count(),
        "total_admins": db.query(User).filter(User.role == "admin").count(),
        "total_imports": total_imports,
        "total_organizations": db.query(Organization).count(),
        "failed_imports": failed_imports,
        "success_imports": success_imports,
        "error_rate": round((failed_imports / total_imports * 100), 1) if total_imports else 0,
    }


@router.get("/organizations")
def get_organizations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")

    result = []
    for organization in db.query(Organization).order_by(Organization.name.asc()).all():
        import_filter = or_(
            ImportFile.organization_id == organization.id,
            and_(
                ImportFile.organization_id.is_(None),
                ImportFile.entreprise_name == organization.name,
            ),
        )
        result.append(
            {
                "id": organization.id,
                "name": organization.name,
                "total_users": db.query(User)
                .filter(User.organization_id == organization.id, User.role == "user")
                .count(),
                "total_admins": db.query(User)
                .filter(User.organization_id == organization.id, User.role == "admin")
                .count(),
                "total_imports": db.query(ImportFile).filter(import_filter).count(),
                "created_at": organization.created_at,
            }
        )
    return result


@router.get("/organizations/{organization_id}")
def get_organization_details(
    organization_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Super admin only")

    organization = db.query(Organization).filter(Organization.id == organization_id).first()
    if not organization:
        raise HTTPException(status_code=404, detail="Organization not found")

    import_filter = or_(
        ImportFile.organization_id == organization.id,
        and_(
            ImportFile.organization_id.is_(None),
            ImportFile.entreprise_name == organization.name,
        ),
    )
    imports = db.query(ImportFile).filter(import_filter)
    contacts = (
        db.query(User)
        .filter(User.organization_id == organization.id)
        .order_by(User.role.asc(), User.username.asc())
        .all()
    )
    return {
        "id": organization.id,
        "name": organization.name,
        "created_at": organization.created_at,
        "total_users": sum(user.role == "user" for user in contacts),
        "total_admins": sum(user.role == "admin" for user in contacts),
        "total_imports": imports.count(),
        "success_imports": imports.filter(ImportFile.status == "SUCCESS").count(),
        "failed_imports": imports.filter(ImportFile.status == "FAILED").count(),
        "contacts": [
            {
                "id": user.id,
                "name": user.username,
                "email": user.email,
                "role": user.role,
                "is_active": bool(user.is_active),
                "last_login": user.last_login,
            }
            for user in contacts
        ],
    }


@router.get("/admin")
def admin_stats(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin only")
    if current_user.role == "super_admin":
        return super_admin_stats(current_user=current_user, db=db)

    org_id = current_user.organization_id
    org_user_ids = db.query(User.id).filter(User.organization_id == org_id)
    total_imports = db.query(ImportFile).filter(ImportFile.user_id.in_(org_user_ids)).count()
    failed_imports = (
        db.query(ImportFile)
        .filter(ImportFile.status == "FAILED", ImportFile.user_id.in_(org_user_ids))
        .count()
    )
    success_imports = (
        db.query(ImportFile)
        .filter(ImportFile.status == "SUCCESS", ImportFile.user_id.in_(org_user_ids))
        .count()
    )
    organization = db.query(Organization).filter(Organization.id == org_id).first()

    return {
        "organization_name": organization.name if organization else "Unknown",
        "total_users": db.query(User)
        .filter(User.organization_id == org_id, User.role == "user")
        .count(),
        "total_imports": total_imports,
        "failed_imports": failed_imports,
        "success_imports": success_imports,
        "error_rate": round((failed_imports / total_imports * 100), 1) if total_imports else 0,
    }
