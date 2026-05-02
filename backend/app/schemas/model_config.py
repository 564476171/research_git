import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ModelConfigCreate(BaseModel):
    scope: Literal["workspace", "user"]
    name: str = Field(min_length=1, max_length=120)
    base_url: str = Field(min_length=1, max_length=512)
    model: str = Field(min_length=1, max_length=120)
    embedding_model: Optional[str] = Field(default=None, max_length=120)
    api_key: str = Field(min_length=1, max_length=4000)
    is_default: bool = False


class ModelConfigUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    base_url: Optional[str] = Field(default=None, min_length=1, max_length=512)
    model: Optional[str] = Field(default=None, min_length=1, max_length=120)
    embedding_model: Optional[str] = Field(default=None, max_length=120)
    api_key: Optional[str] = Field(default=None, min_length=1, max_length=4000)
    is_default: Optional[bool] = None


class ModelConfigResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    workspace_id: uuid.UUID
    owner_id: Optional[uuid.UUID] = None
    scope: str
    name: str
    base_url: str
    model: str
    embedding_model: Optional[str] = None
    is_default: bool
    created_at: datetime


class SetActiveModelRequest(BaseModel):
    model_config_id: uuid.UUID
