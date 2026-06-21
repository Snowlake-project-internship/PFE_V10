from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class FeedbackCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)


class FeedbackResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    message: str
    created_at: datetime


class NotificationResponse(BaseModel):
    id: int
    sender_id: Optional[int] = None
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    organization_name: Optional[str] = None
    sender_team: Optional[str] = None
    feedback_id: Optional[int] = None
    can_reply: bool = False


class NotificationReplyCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)
