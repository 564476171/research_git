import uuid
from types import SimpleNamespace

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Membership, MembershipRole, Project, User


async def is_global_admin(db: AsyncSession, user_id: uuid.UUID) -> bool:
    return bool(
        (
            await db.execute(select(User.is_global_admin).where(User.id == user_id))
        ).scalar_one_or_none()
    )


def require_global_admin_user(user: User) -> None:
    if not user.is_global_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Global admin permission required")


def _global_admin_membership(user_id: uuid.UUID, workspace_id: uuid.UUID) -> Membership:
    return SimpleNamespace(
        user_id=user_id,
        workspace_id=workspace_id,
        role=MembershipRole.ADMIN,
        advisor_of=[],
    )


async def get_membership(
    db: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> Membership | None:
    return (
        await db.execute(
            select(Membership).where(
                Membership.user_id == user_id,
                Membership.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()


async def require_member(
    db: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> Membership:
    m = await get_membership(db, user_id, workspace_id)
    if m:
        return m
    if await is_global_admin(db, user_id):
        return _global_admin_membership(user_id, workspace_id)
    raise HTTPException(
        status.HTTP_403_FORBIDDEN, "Not a member of this workspace"
    )


async def require_admin_or_self(
    db: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> Membership:
    m = await require_member(db, user_id, workspace_id)
    if m.role not in (MembershipRole.ADMIN, MembershipRole.SELF):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Admin permission required"
        )
    return m


async def require_project_access(
    db: AsyncSession, user_id: uuid.UUID, project_id: uuid.UUID
) -> Project:
    project = await db.get(Project, project_id)
    if not project:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Project not found")

    if project.owner_id == user_id or await is_global_admin(db, user_id):
        return project

    m = await get_membership(db, user_id, project.workspace_id)
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not a member")

    if m.role in (MembershipRole.ADMIN, MembershipRole.SELF):
        return project

    if m.role == MembershipRole.ADVISOR:
        if str(project.owner_id) in (m.advisor_of or []):
            return project

    raise HTTPException(status.HTTP_403_FORBIDDEN, "No access to this project")
