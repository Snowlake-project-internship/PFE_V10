from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from logs.constants import ExecutionStatus
from logs.service import LoggerService
from models.notification import Notification
from models.user import Organization, User
from schemas.user import LoginRequest, RegisterRequest
from services.auth_service import (
    create_token,
    get_current_user,
    get_optional_current_user,
    hash_password,
    is_legacy_password_hash,
    verify_password,
)

router = APIRouter()


def _get_or_create_organization(db: Session, organization_name: str | None) -> Organization:
    name = (organization_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Organization name is required")
    organization = db.query(Organization).filter(Organization.name.ilike(name)).first()
    if not organization:
        organization = Organization(name=name)
        db.add(organization)
        db.flush()
    return organization


def _serialize_user(user: User) -> dict:
    return {
        "id": str(user.id),
        "user_id": user.id,
        "name": user.username,
        "username": user.username,
        "email": user.email,
        "team": user.team,
        "role": user.role,
        "approval_status": user.approval_status,
        "organization_id": user.organization_id,
        "organization_name": user.organization.name if user.organization else None,
        "is_active": bool(user.is_active),
        "last_login": user.last_login,
        "created_at": user.created_at,
    }


def _issue_login_response(user: User) -> dict:
    token = create_token(
        {
            "sub": str(user.id),
            "name": user.username,
            "organization_id": user.organization_id,
            "role": user.role,
        }
    )
    return {
        **_serialize_user(user),
        "access_token": token,
        "token_type": "bearer",
    }


@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    organization = _get_or_create_organization(db, req.organization_name)
    team = (req.team or "").strip()
    if not team:
        raise HTTPException(status_code=400, detail="Team is required")
    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        team=team,
        organization_id=organization.id,
        role="user",
        approval_status="PENDING",
        is_active=False,
    )
    db.add(user)
    db.flush()

    recipients = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            User.approval_status == "APPROVED",
            (
                (User.role == "super_admin")
                | (
                    (User.role == "admin")
                    & (User.organization_id == organization.id)
                )
            ),
        )
        .all()
    )
    for recipient in recipients:
        db.add(
            Notification(
                recipient_id=recipient.id,
                sender_id=user.id,
                type="account_approval",
                title=f"Account approval requested by {user.username}",
                message=(
                    f"{user.username} ({user.email}) from team {user.team} "
                    f"requested access to {organization.name}."
                ),
            )
        )
    db.commit()
    db.refresh(user)
    LoggerService.log_audit(
        LoggerService.audit_from_context(
            user_id=user.id,
            organization_id=user.organization_id,
            action="REGISTER",
            resource_type="USER",
            resource_name=user.email,
            status=ExecutionStatus.SUCCESS,
            details={"username": user.username},
        )
    )
    return {
        "message": "Account created and waiting for administrator approval",
        "user_id": user.id,
        "approval_status": user.approval_status,
    }


@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if (user.approval_status or "").upper() == "PENDING":
        raise HTTPException(status_code=403, detail="Account pending administrator approval.")
    if (user.approval_status or "").upper() == "REJECTED":
        raise HTTPException(status_code=403, detail="Account registration was rejected.")
    if hasattr(user, "is_active") and not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled. Contact your administrator.")

    if is_legacy_password_hash(user.hashed_password):
        user.hashed_password = hash_password(req.password)
    user.last_login = datetime.utcnow()
    db.commit()
    db.refresh(user)

    LoggerService.log_audit(
        LoggerService.audit_from_context(
            user_id=user.id,
            organization_id=user.organization_id,
            action="LOGIN",
            resource_type="USER",
            resource_name=user.email,
            status=ExecutionStatus.SUCCESS,
        )
    )
    return _issue_login_response(user)


@router.get("/me")
def me(current_user: User = Depends(get_current_user)):
    return _serialize_user(current_user)


@router.post("/register-admin")
def register_admin(
    req: RegisterRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can create admins")
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    organization = _get_or_create_organization(db, req.organization_name)
    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        team=(req.team or "").strip() or "Administration",
        organization_id=organization.id,
        role="admin",
        approval_status="APPROVED",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    LoggerService.log_audit(
        LoggerService.audit_from_context(
            user_id=current_user.id,
            organization_id=current_user.organization_id,
            action="CREATE_ADMIN",
            resource_type="USER",
            resource_name=user.email,
            status=ExecutionStatus.SUCCESS,
            details={"created_user_id": user.id, "organization_id": organization.id},
        )
    )
    return {"message": "Admin created", "user_id": user.id}


@router.post("/register-super-admin")
def register_super_admin(
    req: RegisterRequest,
    current_user: User | None = Depends(get_optional_current_user),
    db: Session = Depends(get_db),
):
    existing_super_admin = db.query(User).filter(User.role == "super_admin").first()
    if existing_super_admin and (not current_user or current_user.role != "super_admin"):
        raise HTTPException(status_code=403, detail="Only super admin can create another super admin")
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already in use")

    organization = _get_or_create_organization(db, req.organization_name)
    user = User(
        username=req.username,
        email=req.email,
        hashed_password=hash_password(req.password),
        team=(req.team or "").strip() or "Administration",
        organization_id=organization.id,
        role="super_admin",
        approval_status="APPROVED",
        is_active=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    LoggerService.log_audit(
        LoggerService.audit_from_context(
            user_id=current_user.id if current_user else user.id,
            organization_id=current_user.organization_id if current_user else user.organization_id,
            action="CREATE_SUPER_ADMIN",
            resource_type="USER",
            resource_name=user.email,
            status=ExecutionStatus.SUCCESS,
            details={"created_user_id": user.id, "organization_id": organization.id},
        )
    )
    return {"message": "Super admin created", "user_id": user.id}
