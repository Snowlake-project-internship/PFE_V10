from datetime import datetime

from pydantic import AliasChoices, BaseModel, ConfigDict, EmailStr, Field


class RegisterRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    username: str = Field(validation_alias=AliasChoices("username", "name"), min_length=2)
    email: EmailStr
    password: str
    organization_name: str = Field(min_length=2, max_length=255)
    team: str | None = Field(default=None, min_length=2, max_length=100)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    email: EmailStr
    organization_id: int | None = None
    organization_name: str | None = None
    team: str | None = None
    role: str = "user"
    approval_status: str = "APPROVED"
    is_active: bool = True
    last_login: datetime | None = None
    created_at: datetime
