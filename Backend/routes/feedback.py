from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import get_db
from models.feedback import Feedback
from models.notification import Notification
from models.user import User
from schemas.feedback import (
    FeedbackCreate,
    FeedbackResponse,
    NotificationReplyCreate,
    NotificationResponse,
)
from services.auth_service import get_current_user

router = APIRouter()


def _can_reply_to_notification(notification: Notification, current_user: User) -> bool:
    if current_user.role not in {"admin", "super_admin"}:
        return False
    if notification.type != "feedback" or not notification.sender_id:
        return False
    if current_user.role == "super_admin":
        return True
    sender = notification.sender
    return (
        sender is not None
        and sender.role == "user"
        and sender.organization_id == current_user.organization_id
    )


def _serialize_notification(notification: Notification, current_user: User) -> dict:
    sender = notification.sender
    return {
        "id": notification.id,
        "sender_id": notification.sender_id,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "is_read": notification.is_read,
        "created_at": notification.created_at,
        "sender_name": sender.username if sender else None,
        "sender_email": sender.email if sender else None,
        "sender_team": sender.team if sender else None,
        "organization_name": sender.organization.name if sender and sender.organization else None,
        "feedback_id": notification.feedback_id,
        "can_reply": _can_reply_to_notification(notification, current_user),
    }


def _assert_can_reply_to_user(current_user: User, target_user: User) -> None:
    if target_user.role != "user":
        raise HTTPException(status_code=400, detail="Can only reply to user reclamations")
    if current_user.role == "super_admin":
        return
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    if target_user.organization_id != current_user.organization_id:
        raise HTTPException(status_code=403, detail="You can only reply to users in your organization")


@router.post("", response_model=FeedbackResponse, status_code=201)
def submit_feedback(
    payload: FeedbackCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role != "user":
        raise HTTPException(status_code=403, detail="Only users can submit feedback")

    message = payload.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    feedback = Feedback(user_id=current_user.id, message=message)
    db.add(feedback)
    db.flush()

    organization_name = current_user.organization.name if current_user.organization else "Unknown organization"
    title = f"New reclamation from {current_user.username} ({current_user.team or 'No team'} / {organization_name})"

    recipient_filters = [User.role == "super_admin"]
    if current_user.organization_id is not None:
        recipient_filters.append(
            and_(
                User.role == "admin",
                User.organization_id == current_user.organization_id,
            )
        )
    recipients = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            or_(*recipient_filters),
        )
        .all()
    )

    for recipient_id in {recipient.id for recipient in recipients}:
        db.add(
            Notification(
                recipient_id=recipient_id,
                sender_id=current_user.id,
                feedback_id=feedback.id,
                type="feedback",
                title=title,
                message=message,
            )
        )

    db.commit()
    db.refresh(feedback)
    return feedback


@router.get("/notifications", response_model=list[NotificationResponse])
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = db.query(Notification).filter(Notification.recipient_id == current_user.id)
    if current_user.role in {"admin", "super_admin"}:
        query = query.filter(
            or_(
                Notification.type != "account_approval",
                Notification.is_read.is_(False),
            ),
        )

    notifications = query.order_by(Notification.created_at.desc()).limit(50).all()
    return [_serialize_notification(notification, current_user) for notification in notifications]


@router.get("/notifications/unread-count")
def unread_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return {
        "count": db.query(Notification)
        .filter(
            Notification.recipient_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .count()
    }


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.recipient_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")

    notification.is_read = True
    db.commit()
    return {"success": True}


@router.post("/notifications/{notification_id}/reply", response_model=NotificationResponse)
def reply_to_notification(
    notification_id: int,
    payload: NotificationReplyCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin only")

    notification = (
        db.query(Notification)
        .filter(
            Notification.id == notification_id,
            Notification.recipient_id == current_user.id,
        )
        .first()
    )
    if not notification:
        raise HTTPException(status_code=404, detail="Notification not found")
    if not _can_reply_to_notification(notification, current_user):
        raise HTTPException(status_code=400, detail="This notification cannot be replied to")

    reply_message = payload.message.strip()
    if not reply_message:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    target_user_id = notification.sender_id
    if not target_user_id:
        raise HTTPException(status_code=400, detail="Original sender not found")

    target_user = db.query(User).filter(User.id == target_user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    _assert_can_reply_to_user(current_user, target_user)

    role_label = "Super Admin" if current_user.role == "super_admin" else "Admin"
    user_notification = Notification(
        recipient_id=target_user.id,
        sender_id=current_user.id,
        feedback_id=notification.feedback_id,
        type="feedback_reply",
        title=f"Reply from {role_label} {current_user.username}",
        message=reply_message,
    )
    db.add(user_notification)

    if not notification.is_read:
        notification.is_read = True

    db.commit()
    db.refresh(user_notification)
    return _serialize_notification(user_notification, current_user)
