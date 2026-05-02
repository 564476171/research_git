import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.permissions import require_admin_or_self, require_member
from app.db import get_db
from app.models import Membership, MembershipRole, User
from app.schemas.member import MemberAdd, MemberResponse, MemberUpdate


router = APIRouter(tags=["members"])


def _row_to_response(membership: Membership, user: User) -> MemberResponse:
    return MemberResponse(
        user_id=user.id,
        email=user.email,
        display_name=user.display_name,
        role=membership.role.value,
        advisor_of=[uuid.UUID(s) if isinstance(s, str) else s for s in (membership.advisor_of or [])],
        created_at=membership.created_at,
    )


@router.get(
    "/api/workspaces/{workspace_id}/members",
    response_model=list[MemberResponse],
)
async def list_members(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_member(db, user.id, workspace_id)
    rows = (
        await db.execute(
            select(Membership, User)
            .join(User, User.id == Membership.user_id)
            .where(Membership.workspace_id == workspace_id)
            .order_by(Membership.created_at.asc())
        )
    ).all()
    return [_row_to_response(m, u) for m, u in rows]


@router.post(
    "/api/workspaces/{workspace_id}/members",
    status_code=status.HTTP_201_CREATED,
    response_model=MemberResponse,
)
async def add_member(
    workspace_id: uuid.UUID,
    payload: MemberAdd,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_admin_or_self(db, actor.id, workspace_id)

    target = (
        await db.execute(select(User).where(User.email == payload.email))
    ).scalar_one_or_none()
    if not target:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"No user with email {payload.email}. Ask them to register first.",
        )

    membership = Membership(
        user_id=target.id,
        workspace_id=workspace_id,
        role=MembershipRole(payload.role),
        advisor_of=[str(s) for s in payload.advisor_of],
    )
    db.add(membership)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(
            status.HTTP_409_CONFLICT, "User is already a member of this workspace"
        )
    await db.refresh(membership)
    return _row_to_response(membership, target)


@router.patch(
    "/api/workspaces/{workspace_id}/members/{user_id}",
    response_model=MemberResponse,
)
async def update_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    payload: MemberUpdate,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_admin_or_self(db, actor.id, workspace_id)
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.workspace_id == workspace_id,
                Membership.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not membership:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Member not found")

    if membership.role == MembershipRole.SELF:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot modify owner role")

    if payload.role is not None:
        membership.role = MembershipRole(payload.role)
    if payload.advisor_of is not None:
        membership.advisor_of = [str(s) for s in payload.advisor_of]

    await db.commit()
    await db.refresh(membership)
    target = await db.get(User, user_id)
    return _row_to_response(membership, target)


@router.delete(
    "/api/workspaces/{workspace_id}/members/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_member(
    workspace_id: uuid.UUID,
    user_id: uuid.UUID,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_admin_or_self(db, actor.id, workspace_id)
    membership = (
        await db.execute(
            select(Membership).where(
                Membership.workspace_id == workspace_id,
                Membership.user_id == user_id,
            )
        )
    ).scalar_one_or_none()
    if not membership:
        return
    if membership.role == MembershipRole.SELF:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, "Cannot remove the workspace owner"
        )
    await db.delete(membership)
    await db.commit()
