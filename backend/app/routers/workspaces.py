import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.db import get_db
from app.models import Membership, MembershipRole, User, Workspace, WorkspaceMode
from app.schemas.workspace import WorkspaceCreate, WorkspaceResponse, WorkspaceUpdate

router = APIRouter(prefix="/api/workspaces", tags=["workspaces"])


def _workspace_response(ws: Workspace, role: str) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=ws.id,
        owner_id=ws.owner_id,
        name=ws.name,
        mode=ws.mode.value,
        role=role,
        created_at=ws.created_at,
    )


async def _get_owned_or_global_admin_workspace(
    db: AsyncSession, user: User, workspace_id: uuid.UUID
) -> Workspace:
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    if workspace.owner_id != user.id and not user.is_global_admin:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace owner permission required")
    return workspace


@router.get("", response_model=list[WorkspaceResponse])
async def list_my_workspaces(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[WorkspaceResponse]:
    if user.is_global_admin:
        rows = (
            await db.execute(
                select(Workspace, Membership.role)
                .outerjoin(
                    Membership,
                    (Membership.workspace_id == Workspace.id)
                    & (Membership.user_id == user.id),
                )
                .order_by(Workspace.created_at.desc())
            )
        ).all()
        return [_workspace_response(ws, role.value if role else "global_admin") for ws, role in rows]

    rows = (
        await db.execute(
            select(Workspace, Membership.role)
            .join(Membership, Membership.workspace_id == Workspace.id)
            .where(Membership.user_id == user.id)
            .order_by(Workspace.created_at.desc())
        )
    ).all()
    return [_workspace_response(ws, role.value) for ws, role in rows]


@router.post("", status_code=status.HTTP_201_CREATED, response_model=WorkspaceResponse)
async def create_workspace(
    payload: WorkspaceCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceResponse:
    mode = WorkspaceMode(payload.mode)
    role = (
        MembershipRole.SELF
        if mode == WorkspaceMode.PERSONAL
        else MembershipRole.ADMIN
    )

    ws = Workspace(name=payload.name, mode=mode, owner_id=user.id)
    db.add(ws)
    await db.flush()

    db.add(
        Membership(user_id=user.id, workspace_id=ws.id, role=role)
    )
    await db.commit()
    await db.refresh(ws)

    return _workspace_response(ws, role.value)


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
async def update_workspace(
    workspace_id: uuid.UUID,
    payload: WorkspaceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> WorkspaceResponse:
    workspace = await _get_owned_or_global_admin_workspace(db, user, workspace_id)
    if payload.name is not None:
        workspace.name = payload.name
    await db.commit()
    await db.refresh(workspace)

    membership = (
        await db.execute(
            select(Membership.role).where(
                Membership.workspace_id == workspace.id,
                Membership.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    role = membership.value if membership else "global_admin"
    return _workspace_response(workspace, role)


@router.delete("/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workspace(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    workspace = await _get_owned_or_global_admin_workspace(db, user, workspace_id)
    await db.delete(workspace)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
