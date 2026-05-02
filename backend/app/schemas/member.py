import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class MemberAdd(BaseModel):
    email: EmailStr
    role: Literal["admin", "advisor", "student"]
    advisor_of: list[uuid.UUID] = Field(default_factory=list)


class MemberUpdate(BaseModel):
    role: Optional[Literal["admin", "advisor", "student"]] = None
    advisor_of: Optional[list[uuid.UUID]] = None


class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    role: str
    advisor_of: list[uuid.UUID] = Field(default_factory=list)
    created_at: datetime
