import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.model_config import ModelConfigResponse


class UserProfileResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    institution: Optional[str] = None
    website_url: Optional[str] = None
    is_global_admin: bool
    created_at: datetime
    updated_at: datetime


class UserProfileUpdate(BaseModel):
    display_name: Optional[str] = Field(default=None, max_length=255)
    bio: Optional[str] = Field(default=None, max_length=2000)
    institution: Optional[str] = Field(default=None, max_length=255)
    website_url: Optional[str] = Field(default=None, max_length=512)


class PersonalModelGroupResponse(BaseModel):
    workspace_id: uuid.UUID
    workspace_name: str
    workspace_mode: str
    role: str
    active_model_config_id: Optional[uuid.UUID] = None
    personal_models: list[ModelConfigResponse]
