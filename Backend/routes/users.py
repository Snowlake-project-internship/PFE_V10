from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from database import get_db
from models.notification import Notification
from models.user import Organization, User
from services.auth_service import get_current_user, hash_password

router = APIRouter()


class UpdateUserRequest(BaseModel):
    username: Optional[str] = None
    email: Optional[EmailStr] = None
    organization_name: Optional[str] = None
    team: Optional[str] = None


class ResetPasswordRequest(BaseModel):
    new_password: str


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin only")
    return current_user


def _serialize_user(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.username,
        "username": user.username,
        "email": user.email,
        "team": user.team,
        "organization_id": user.organization_id,
        "organization_name": user.organization.name if user.organization else None,
        "role": user.role,
        "approval_status": user.approval_status,
        "is_active": bool(user.is_active),
        "last_login": user.last_login,
        "created_at": user.created_at,
    }


def _find_visible_user(db: Session, user_id: int, current_user: User) -> User:
    query = db.query(User).filter(User.id == user_id)
    if current_user.role == "admin":
        query = query.filter(User.organization_id == current_user.organization_id)
    user = query.first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _assert_can_manage(current_user: User, target: User) -> None:
    if current_user.id == target.id:
        raise HTTPException(status_code=400, detail="You cannot perform this action on your own account")
    if current_user.role == "super_admin":
        if target.role == "super_admin":
            raise HTTPException(status_code=403, detail="Super admin accounts cannot be managed here")
        return
    if current_user.role == "admin":
        if target.role != "user":
            raise HTTPException(status_code=403, detail="Admins can only manage regular users")
        if target.organization_id != current_user.organization_id:
            raise HTTPException(status_code=403, detail="Cannot manage users from another organization")
        return
    raise HTTPException(status_code=403, detail="Not authorized")


def _get_or_create_organization(db: Session, organization_name: str) -> Organization:
    name = organization_name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Organization name cannot be empty")
    organization = db.query(Organization).filter(Organization.name == name).first()
    if not organization:
        organization = Organization(name=name)
        db.add(organization)
        db.flush()
    return organization


@router.get("/")
def get_all_users(
    organization_id: Optional[int] = None,
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User)
    if current_user.role == "admin":
        query = query.filter(User.organization_id == current_user.organization_id)
    elif organization_id is not None:
        query = query.filter(User.organization_id == organization_id)
    return [_serialize_user(user) for user in query.order_by(User.id).all()]


@router.get("/pending-approvals")
def get_pending_approvals(
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    query = db.query(User).filter(
        User.role == "user",
        User.approval_status == "PENDING",
    )
    if current_user.role == "admin":
        query = query.filter(User.organization_id == current_user.organization_id)
    return [_serialize_user(user) for user in query.order_by(User.created_at.desc()).all()]


@router.get("/{id}")
def get_user(
    id: int,
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    return _serialize_user(_find_visible_user(db, id, current_user))


@router.put("/{id}")
def update_user(
    id: int,
    req: UpdateUserRequest,
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    user = _find_visible_user(db, id, current_user)
    _assert_can_manage(current_user, user)

    if req.username:
        user.username = req.username.strip()
    if req.email:
        existing = db.query(User).filter(User.email == req.email, User.id != id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already in use")
        user.email = req.email
    if req.team is not None:
        team = req.team.strip()
        if not team:
            raise HTTPException(status_code=400, detail="Team cannot be empty")
        user.team = team
    if req.organization_name:
        if current_user.role != "super_admin":
            raise HTTPException(status_code=403, detail="Only super admin can move users between organizations")
        organization = _get_or_create_organization(db, req.organization_name)
        user.organization_id = organization.id

    db.commit()
    db.refresh(user)
    return _serialize_user(user)


@router.post("/{id}/reset-password")
def reset_password(
    id: int,
    req: ResetPasswordRequest,
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    user = _find_visible_user(db, id, current_user)
    _assert_can_manage(current_user, user)
    user.hashed_password = hash_password(req.new_password)
    db.commit()
    return {"message": "Password reset"}


@router.patch("/{id}/activate")
def activate_user(
    id: int,
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    user = _find_visible_user(db, id, current_user)
    _assert_can_manage(current_user, user)
    user.approval_status = "APPROVED"
    user.is_active = True
    db.commit()
    return {"message": f"User {user.username} activated"}


def _resolve_approval_notifications(db: Session, user_id: int) -> None:
    db.query(Notification).filter(
        Notification.sender_id == user_id,
        Notification.type == "account_approval",
        Notification.is_read.is_(False),
    ).update({Notification.is_read: True}, synchronize_session=False)


@router.patch("/{id}/approve")
def approve_user(
    id: int,
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    user = _find_visible_user(db, id, current_user)
    _assert_can_manage(current_user, user)
    if user.approval_status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending accounts can be approved")
    user.approval_status = "APPROVED"
    user.is_active = True
    _resolve_approval_notifications(db, user.id)
    db.commit()
    return {"message": f"User {user.username} approved"}


@router.patch("/{id}/reject")
def reject_user(
    id: int,
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    user = _find_visible_user(db, id, current_user)
    _assert_can_manage(current_user, user)
    if user.approval_status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending accounts can be rejected")
    user.approval_status = "REJECTED"
    user.is_active = False
    _resolve_approval_notifications(db, user.id)
    db.commit()
    return {"message": f"User {user.username} rejected"}


@router.patch("/{id}/deactivate")
def deactivate_user(
    id: int,
    current_user: User = Depends(_require_admin),
    db: Session = Depends(get_db),
):
    user = _find_visible_user(db, id, current_user)
    _assert_can_manage(current_user, user)
    user.is_active = False
    db.commit()
    return {"message": f"User {user.username} deactivated"}


@router.patch("/{id}/role")
def change_role(
    id: int,
    role: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user.role != "super_admin":
        raise HTTPException(status_code=403, detail="Only super admin can change roles")
    if role not in {"user", "admin", "super_admin"}:
        raise HTTPException(status_code=400, detail="Invalid role")
    user = _find_visible_user(db, id, current_user)
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot change your own role")
    if user.role == "super_admin":
        raise HTTPException(status_code=403, detail="Super admin accounts cannot be changed here")

    user.role = role
    db.commit()
    return {"message": f"Role changed to {role}"}


@router.delete("/{id}")
def delete_user(
    id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = _find_visible_user(db, id, current_user)
    _assert_can_manage(current_user, user)
    db.delete(user)
    db.commit()
    return {"message": f"User {user.username} deleted"}
