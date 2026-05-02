import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.permissions import require_global_admin_user
from app.db import get_db
from app.models import InviteCode, Membership, Project, RegistrationMode, User, Workspace
from app.schemas.admin import (
    AdminInviteCodeCreate,
    AdminInviteCodeCreatedResponse,
    AdminInviteCodeResponse,
    AdminInviteCodeUpdate,
    AdminPlatformSettingsResponse,
    AdminPlatformSettingsUpdate,
    AdminRegistrationSettingsResponse,
    AdminRegistrationSettingsUpdate,
    AdminStatsResponse,
    AdminUserResponse,
    AdminUserUpdate,
    AdminWorkspaceResponse,
    AdminWorkspaceUpdate,
)
from app.services.registration import generate_invite_code, get_platform_settings, hash_invite_code, normalize_origin


router = APIRouter(prefix="/api/admin", tags=["admin"])


def _user_response(
    user: User, workspace_count: int = 0, project_count: int = 0
) -> AdminUserResponse:
    return AdminUserResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        institution=user.institution,
        is_global_admin=user.is_global_admin,
        created_at=user.created_at,
        workspace_count=workspace_count,
        project_count=project_count,
    )


def _invite_code_response(invite_code: InviteCode) -> AdminInviteCodeResponse:
    return AdminInviteCodeResponse(
        id=invite_code.id,
        active=invite_code.active,
        max_uses=invite_code.max_uses,
        use_count=invite_code.use_count,
        expires_at=invite_code.expires_at,
        last_used_at=invite_code.last_used_at,
        created_at=invite_code.created_at,
        created_by_id=invite_code.created_by_id,
    )


def _workspace_response(
    workspace: Workspace,
    owner: User,
    member_count: int = 0,
    project_count: int = 0,
) -> AdminWorkspaceResponse:
    return AdminWorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        mode=workspace.mode.value,
        owner_id=owner.id,
        owner_email=owner.email,
        owner_display_name=owner.display_name,
        member_count=member_count,
        project_count=project_count,
        created_at=workspace.created_at,
    )


def _platform_settings_response(settings) -> AdminPlatformSettingsResponse:
    return AdminPlatformSettingsResponse(frontend_url=settings.frontend_url)


async def _admin_user_counts(db: AsyncSession, user_id: uuid.UUID) -> tuple[int, int]:
    workspace_count = (
        await db.execute(
            select(func.count()).select_from(Membership).where(Membership.user_id == user_id)
        )
    ).scalar_one()
    project_count = (
        await db.execute(
            select(func.count()).select_from(Project).where(Project.owner_id == user_id)
        )
    ).scalar_one()
    return workspace_count, project_count


async def _admin_workspace_counts(db: AsyncSession, workspace_id: uuid.UUID) -> tuple[int, int]:
    member_count = (
        await db.execute(
            select(func.count()).select_from(Membership).where(Membership.workspace_id == workspace_id)
        )
    ).scalar_one()
    project_count = (
        await db.execute(
            select(func.count()).select_from(Project).where(Project.workspace_id == workspace_id)
        )
    ).scalar_one()
    return member_count, project_count


async def _global_admin_count(db: AsyncSession) -> int:
    return (
        await db.execute(select(func.count()).select_from(User).where(User.is_global_admin.is_(True)))
    ).scalar_one()


@router.get("/platform-settings", response_model=AdminPlatformSettingsResponse)
async def get_platform_settings_admin(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    settings = await get_platform_settings(db)
    return _platform_settings_response(settings)


@router.patch("/platform-settings", response_model=AdminPlatformSettingsResponse)
async def update_platform_settings_admin(
    payload: AdminPlatformSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    settings = await get_platform_settings(db)
    frontend_url = normalize_origin(payload.frontend_url)
    if not frontend_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Frontend URL is required")
    settings.frontend_url = frontend_url
    settings.updated_by_id = user.id
    await db.commit()
    await db.refresh(settings)
    return _platform_settings_response(settings)


@router.get("/registration", response_model=AdminRegistrationSettingsResponse)
async def get_registration_settings(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    settings = await get_platform_settings(db)
    invite_codes = list(
        (
            await db.execute(select(InviteCode).order_by(InviteCode.created_at.desc()))
        ).scalars().all()
    )
    return AdminRegistrationSettingsResponse(
        registration_mode=settings.registration_mode.value,
        invite_codes=[_invite_code_response(invite_code) for invite_code in invite_codes],
    )


@router.patch("/registration", response_model=AdminRegistrationSettingsResponse)
async def update_registration_settings(
    payload: AdminRegistrationSettingsUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    try:
        mode = RegistrationMode(payload.registration_mode)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid registration mode")

    settings = await get_platform_settings(db)
    settings.registration_mode = mode
    settings.updated_by_id = user.id
    await db.commit()
    await db.refresh(settings)

    invite_codes = list(
        (
            await db.execute(select(InviteCode).order_by(InviteCode.created_at.desc()))
        ).scalars().all()
    )
    return AdminRegistrationSettingsResponse(
        registration_mode=settings.registration_mode.value,
        invite_codes=[_invite_code_response(invite_code) for invite_code in invite_codes],
    )


@router.post("/invite-codes", response_model=AdminInviteCodeCreatedResponse)
async def create_invite_code(
    payload: AdminInviteCodeCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    if payload.expires_at and payload.expires_at <= datetime.utcnow():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Expiration must be in the future")

    code = generate_invite_code()
    invite_code = InviteCode(
        code_hash=hash_invite_code(code),
        max_uses=payload.max_uses,
        expires_at=payload.expires_at,
        created_by_id=user.id,
    )
    db.add(invite_code)
    await db.commit()
    await db.refresh(invite_code)
    return AdminInviteCodeCreatedResponse(
        **_invite_code_response(invite_code).model_dump(),
        code=code,
    )


@router.patch("/invite-codes/{invite_code_id}", response_model=AdminInviteCodeResponse)
async def update_invite_code(
    invite_code_id: uuid.UUID,
    payload: AdminInviteCodeUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    invite_code = await db.get(InviteCode, invite_code_id)
    if not invite_code:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Invite code not found")

    if payload.active is not None:
        invite_code.active = payload.active
    if payload.max_uses is not None:
        if payload.max_uses < invite_code.use_count:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Max uses cannot be below used count")
        invite_code.max_uses = payload.max_uses
    if "expires_at" in payload.model_fields_set:
        if payload.expires_at and payload.expires_at <= datetime.utcnow():
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Expiration must be in the future")
        invite_code.expires_at = payload.expires_at

    await db.commit()
    await db.refresh(invite_code)
    return _invite_code_response(invite_code)


@router.get("/stats", response_model=AdminStatsResponse)
async def get_admin_stats(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    users = (await db.execute(select(func.count()).select_from(User))).scalar_one()
    global_admins = (
        await db.execute(select(func.count()).select_from(User).where(User.is_global_admin.is_(True)))
    ).scalar_one()
    workspaces = (await db.execute(select(func.count()).select_from(Workspace))).scalar_one()
    projects = (await db.execute(select(func.count()).select_from(Project))).scalar_one()
    return AdminStatsResponse(
        users=users,
        global_admins=global_admins,
        workspaces=workspaces,
        projects=projects,
    )


@router.get("/users", response_model=list[AdminUserResponse])
async def list_admin_users(
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    stmt = select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(or_(User.email.ilike(pattern), User.display_name.ilike(pattern)))
    users = list((await db.execute(stmt)).scalars().all())
    user_ids = [row.id for row in users]
    if not user_ids:
        return []

    workspace_counts = dict(
        (
            await db.execute(
                select(Membership.user_id, func.count(Membership.workspace_id))
                .where(Membership.user_id.in_(user_ids))
                .group_by(Membership.user_id)
            )
        ).all()
    )
    project_counts = dict(
        (
            await db.execute(
                select(Project.owner_id, func.count(Project.id))
                .where(Project.owner_id.in_(user_ids))
                .group_by(Project.owner_id)
            )
        ).all()
    )
    return [
        _user_response(
            row,
            workspace_count=workspace_counts.get(row.id, 0),
            project_count=project_counts.get(row.id, 0),
        )
        for row in users
    ]


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
async def update_admin_user(
    user_id: uuid.UUID,
    payload: AdminUserUpdate,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(actor)
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")

    if payload.email is not None:
        email = str(payload.email).strip().lower()
        existing = (
            await db.execute(select(User).where(User.email == email, User.id != target.id))
        ).scalar_one_or_none()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email already exists")
        target.email = email
    if "display_name" in payload.model_fields_set:
        target.display_name = payload.display_name
    if "institution" in payload.model_fields_set:
        target.institution = payload.institution
    if "avatar_url" in payload.model_fields_set:
        target.avatar_url = payload.avatar_url
    if payload.is_global_admin is not None:
        if target.is_global_admin and not payload.is_global_admin:
            if await _global_admin_count(db) <= 1:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot remove the last global admin")
        target.is_global_admin = payload.is_global_admin

    target.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(target)

    workspace_count, project_count = await _admin_user_counts(db, target.id)
    return _user_response(target, workspace_count, project_count)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_user(
    user_id: uuid.UUID,
    actor: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    require_global_admin_user(actor)
    target = await db.get(User, user_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    if target.id == actor.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete your own account")
    if target.is_global_admin and await _global_admin_count(db) <= 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Cannot delete the last global admin")

    await db.delete(target)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/workspaces", response_model=list[AdminWorkspaceResponse])
async def list_admin_workspaces(
    q: str | None = Query(default=None, max_length=255),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    require_global_admin_user(user)
    stmt = (
        select(Workspace, User)
        .join(User, User.id == Workspace.owner_id)
        .order_by(Workspace.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if q:
        pattern = f"%{q.strip()}%"
        stmt = stmt.where(
            or_(
                Workspace.name.ilike(pattern),
                User.email.ilike(pattern),
                User.display_name.ilike(pattern),
            )
        )
    rows = list((await db.execute(stmt)).all())
    workspace_ids = [workspace.id for workspace, _ in rows]
    if not workspace_ids:
        return []

    member_counts = dict(
        (
            await db.execute(
                select(Membership.workspace_id, func.count(Membership.user_id))
                .where(Membership.workspace_id.in_(workspace_ids))
                .group_by(Membership.workspace_id)
            )
        ).all()
    )
    project_counts = dict(
        (
            await db.execute(
                select(Project.workspace_id, func.count(Project.id))
                .where(Project.workspace_id.in_(workspace_ids))
                .group_by(Project.workspace_id)
            )
        ).all()
    )
    return [
        _workspace_response(
            workspace,
            owner,
            member_count=member_counts.get(workspace.id, 0),
            project_count=project_counts.get(workspace.id, 0),
        )
        for workspace, owner in rows
    ]


@router.patch("/workspaces/{workspace_id}", response_model=AdminWorkspaceResponse)
async def update_admin_workspace(
    workspace_id: uuid.UUID,
    payload: AdminWorkspaceUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminWorkspaceResponse:
    require_global_admin_user(user)
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    if payload.name is not None:
        workspace.name = payload.name

    await db.commit()
    await db.refresh(workspace)
    owner = await db.get(User, workspace.owner_id)
    if not owner:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace owner not found")
    member_count, project_count = await _admin_workspace_counts(db, workspace.id)
    return _workspace_response(workspace, owner, member_count, project_count)


@router.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_admin_workspace(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    require_global_admin_user(user)
    workspace = await db.get(Workspace, workspace_id)
    if not workspace:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found")
    await db.delete(workspace)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
