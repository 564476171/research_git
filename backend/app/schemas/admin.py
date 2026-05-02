import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class AdminStatsResponse(BaseModel):
    users: int
    global_admins: int
    workspaces: int
    projects: int


class AdminUserResponse(BaseModel):
    id: uuid.UUID
    email: str
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    institution: Optional[str] = None
    is_global_admin: bool
    created_at: datetime
    workspace_count: int = 0
    project_count: int = 0


class AdminUserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    display_name: Optional[str] = Field(default=None, max_length=255)
    institution: Optional[str] = Field(default=None, max_length=255)
    avatar_url: Optional[str] = Field(default=None, max_length=1024)
    is_global_admin: Optional[bool] = None


class AdminWorkspaceUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=255)


class AdminWorkspaceResponse(BaseModel):
    id: uuid.UUID
    name: str
    mode: str
    owner_id: uuid.UUID
    owner_email: str
    owner_display_name: Optional[str] = None
    member_count: int = 0
    project_count: int = 0
    created_at: datetime


class AdminPlatformSettingsResponse(BaseModel):
    frontend_url: str


class AdminPlatformSettingsUpdate(BaseModel):
    frontend_url: str = Field(min_length=1, max_length=512)


class AdminInviteCodeResponse(BaseModel):
    id: uuid.UUID
    active: bool
    max_uses: int
    use_count: int
    expires_at: Optional[datetime] = None
    last_used_at: Optional[datetime] = None
    created_at: datetime
    created_by_id: Optional[uuid.UUID] = None


class AdminInviteCodeCreatedResponse(AdminInviteCodeResponse):
    code: str


class AdminRegistrationSettingsResponse(BaseModel):
    registration_mode: str
    invite_codes: list[AdminInviteCodeResponse] = Field(default_factory=list)


class AdminRegistrationSettingsUpdate(BaseModel):
    registration_mode: str


class AdminInviteCodeCreate(BaseModel):
    max_uses: int = Field(default=1, ge=1, le=10000)
    expires_at: Optional[datetime] = None


class AdminInviteCodeUpdate(BaseModel):
    active: Optional[bool] = None
    max_uses: Optional[int] = Field(default=None, ge=1, le=10000)
    expires_at: Optional[datetime] = None


