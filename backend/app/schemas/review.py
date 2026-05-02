import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    content: str = Field(min_length=1, max_length=8000)
    anchor_paragraph_ord: Optional[int] = None


class ReviewUpdate(BaseModel):
    status: Optional[Literal["open", "resolved"]] = None


class ReviewResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    commit_id: uuid.UUID
    reviewer_id: uuid.UUID
    reviewer_display: Optional[str] = None
    content: str
    anchor_paragraph_ord: Optional[int] = None
    status: str
    created_at: datetime
    resolved_at: Optional[datetime] = None
