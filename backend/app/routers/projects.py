import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.permissions import require_member
from app.db import get_db
from app.models import Project, User
from app.schemas.project import ProjectCreate, ProjectResponse


router = APIRouter(prefix="/api", tags=["projects"])


@router.get(
    "/workspaces/{workspace_id}/projects",
    response_model=list[ProjectResponse],
)
async def list_projects(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[Project]:
    await require_member(db, user.id, workspace_id)
    rows = (
        await db.execute(
            select(Project)
            .where(Project.workspace_id == workspace_id)
            .order_by(Project.created_at.desc())
        )
    ).scalars().all()
    return list(rows)


@router.post(
    "/workspaces/{workspace_id}/projects",
    status_code=status.HTTP_201_CREATED,
    response_model=ProjectResponse,
)
async def create_project(
    workspace_id: uuid.UUID,
    payload: ProjectCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    await require_member(db, user.id, workspace_id)
    project = Project(
        workspace_id=workspace_id,
        owner_id=user.id,
        title=payload.title,
        description=payload.description,
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectResponse)
async def get_project(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Project:
    project = (
        await db.execute(select(Project).where(Project.id == project_id))
    ).scalar_one_or_none()
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")
    await require_member(db, user.id, project.workspace_id)
    return project
