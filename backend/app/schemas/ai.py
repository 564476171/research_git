import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AiMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: str
    content: str
    created_at: datetime


class AiConversationResponse(BaseModel):
    id: uuid.UUID | None = None
    project_id: uuid.UUID
    user_id: uuid.UUID
    messages: list[AiMessageResponse]


class AiChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=8000)
    branch_id: uuid.UUID | None = None
    model_config_id: uuid.UUID | None = None


class AiChatResponse(BaseModel):
    conversation_id: uuid.UUID
    user_message: AiMessageResponse
    assistant_message: AiMessageResponse
