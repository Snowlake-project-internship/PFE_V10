from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class FeedbackCreate(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)


class FeedbackResponse(BaseModel):
    id: int
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


class NotificationResponse(BaseModel):
    id: int
    type: str
    title: str
    message: str
    is_read: bool
    created_at: datetime
    sender_name: Optional[str] = None
    sender_email: Optional[str] = None
    feedback_id: Optional[int] = None

    class Config:
        from_attributes = True
