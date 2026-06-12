from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session

from database import get_db
from models.feedback import Feedback
from models.notification import Notification
from models.user import User
from schemas.feedback import FeedbackCreate, FeedbackResponse, NotificationResponse
from services.auth_service import get_current_user

router = APIRouter()


def _serialize_notification(notification: Notification) -> dict:
    sender = notification.sender
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "message": notification.message,
        "is_read": notification.is_read,
        "created_at": notification.created_at,
        "sender_name": sender.username if sender else None,
        "sender_email": sender.email if sender else None,
        "feedback_id": notification.feedback_id,
    }


@router.post("", response_model=FeedbackResponse)
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

    org_name = current_user.organization.name if current_user.organization else "Unknown organization"
    title = f"New reclamation from {current_user.username} ({org_name})"

    recipients = (
        db.query(User)
        .filter(
            User.is_active.is_(True),
            or_(
                and_(
                    User.role == "admin",
                    User.organization_id == current_user.organization_id,
                ),
                User.role == "super_admin",
            ),
        )
        .all()
    )

    seen_recipient_ids: set[int] = set()
    for recipient in recipients:
        if recipient.id in seen_recipient_ids:
            continue
        seen_recipient_ids.add(recipient.id)
        db.add(
            Notification(
                recipient_id=recipient.id,
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
    if current_user.role not in {"admin", "super_admin"}:
        raise HTTPException(status_code=403, detail="Admin only")

    notifications = (
        db.query(Notification)
        .filter(Notification.recipient_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [_serialize_notification(n) for n in notifications]


@router.get("/notifications/unread-count")
def unread_notification_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role not in {"admin", "super_admin"}:
        return {"count": 0}

    count = (
        db.query(Notification)
        .filter(
            Notification.recipient_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .count()
    )
    return {"count": count}


@router.patch("/notifications/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
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

    notification.is_read = True
    db.commit()
    return {"success": True}
