from pydantic import BaseModel
from typing import List, Optional


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    image: Optional[str] = None
    role: Optional[str] = "user"
    user_id: Optional[int] = None
    user_email: Optional[str] = None
    user_name: Optional[str] = None


class ChatResponse(BaseModel):
    response: str
    escalated: bool = False