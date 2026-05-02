import uuid
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class CommitCreate(BaseModel):
    content: str = Field(min_length=1, max_length=200_000)
    message: Optional[str] = Field(default=None, max_length=500)
    branch_id: Optional[uuid.UUID] = None


class CommitUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=200_000)
    message: Optional[str] = Field(default=None, max_length=500)


class CommitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    author_id: uuid.UUID
    message: Optional[str] = None
    content: str
    llm_summary: Optional[str] = None
    status: str
    created_at: datetime


class CommitSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    author_id: uuid.UUID
    message: Optional[str] = None
    llm_summary: Optional[str] = None
    status: str
    created_at: datetime


class SimilarCommit(BaseModel):
    id: uuid.UUID
    message: Optional[str] = None
    created_at: datetime
    similarity: float


class AiSummaryRequest(BaseModel):
    kind: Literal["diff_summary", "cumulative_summary"]


class AiOutputResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    commit_id: uuid.UUID
    user_id: uuid.UUID
    kind: str
    content: str
    model_config_id: Optional[uuid.UUID] = None
    created_at: datetime


class ForkRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class BranchResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    name: str
    head_commit_id: Optional[uuid.UUID] = None
    created_from_commit_id: Optional[uuid.UUID] = None
    created_by_id: uuid.UUID
    is_default: bool
    created_at: datetime


class GraphCommit(BaseModel):
    id: uuid.UUID
    parent_id: Optional[uuid.UUID] = None
    branch_id: Optional[uuid.UUID] = None
    message: Optional[str] = None
    created_at: datetime
    is_head: bool


class ProjectGraphResponse(BaseModel):
    branches: list[BranchResponse]
    commits: list[GraphCommit]
