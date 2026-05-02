import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.permissions import get_membership
from app.config import settings
from app.db import get_db
from app.models import Membership, ModelConfig, ModelScope, User, UserModelPref, Workspace
from app.routers.models import _to_response as model_to_response
from app.schemas.profile import (
    PersonalModelGroupResponse,
    UserProfileResponse,
    UserProfileUpdate,
)


router = APIRouter(prefix="/api/me", tags=["profile"])

_AVATAR_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}


def _profile_response(user: User) -> UserProfileResponse:
    return UserProfileResponse(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        avatar_url=user.avatar_url,
        bio=user.bio,
        institution=user.institution,
        website_url=user.website_url,
        is_global_admin=user.is_global_admin,
        created_at=user.created_at,
        updated_at=user.updated_at,
    )


def _managed_avatar_path(avatar_url: str | None) -> Path | None:
    if not avatar_url:
        return None
    media_url = settings.MEDIA_URL.rstrip("/")
    prefix = f"{media_url}/avatars/"
    if not avatar_url.startswith(prefix):
        return None
    rel = avatar_url[len(media_url) :].lstrip("/")
    path = (Path(settings.MEDIA_ROOT) / rel).resolve()
    root = Path(settings.MEDIA_ROOT).resolve()
    if root not in path.parents and path != root:
        return None
    return path


def _delete_avatar(avatar_url: str | None) -> None:
    path = _managed_avatar_path(avatar_url)
    if path and path.exists():
        path.unlink()


@router.get("", response_model=UserProfileResponse)
async def get_profile(user: User = Depends(get_current_user)) -> UserProfileResponse:
    return _profile_response(user)


@router.patch("", response_model=UserProfileResponse)
async def update_profile(
    payload: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    data = payload.model_dump(exclude_unset=True)
    if "display_name" in data:
        user.display_name = data["display_name"]
    if "bio" in data:
        user.bio = data["bio"]
    if "institution" in data:
        user.institution = data["institution"]
    if "website_url" in data:
        user.website_url = data["website_url"]
    user.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)
    return _profile_response(user)


@router.post("/avatar", response_model=UserProfileResponse)
async def upload_avatar(
    avatar: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    ext = _AVATAR_TYPES.get(avatar.content_type or "")
    if not ext:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Unsupported avatar image type")

    data = await avatar.read()
    if len(data) > settings.AVATAR_MAX_BYTES:
        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, "Avatar is too large")

    avatar_dir = Path(settings.MEDIA_ROOT) / "avatars" / str(user.id)
    avatar_dir.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4()}{ext}"
    path = avatar_dir / filename
    with path.open("wb") as f:
        f.write(data)

    old_url = user.avatar_url
    user.avatar_url = f"{settings.MEDIA_URL.rstrip('/')}/avatars/{user.id}/{filename}"
    user.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)
    _delete_avatar(old_url)
    return _profile_response(user)


@router.delete("/avatar", response_model=UserProfileResponse)
async def delete_avatar(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    old_url = user.avatar_url
    user.avatar_url = None
    user.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(user)
    _delete_avatar(old_url)
    return _profile_response(user)


@router.get("/models", response_model=list[PersonalModelGroupResponse])
async def list_personal_models(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[PersonalModelGroupResponse]:
    if user.is_global_admin:
        workspace_rows = (
            await db.execute(select(Workspace).order_by(Workspace.created_at.desc()))
        ).scalars().all()
        workspaces = list(workspace_rows)
    else:
        rows = (
            await db.execute(
                select(Workspace)
                .join(Membership, Membership.workspace_id == Workspace.id)
                .where(Membership.user_id == user.id)
                .order_by(Workspace.created_at.desc())
            )
        ).scalars().all()
        workspaces = list(rows)

    workspace_ids = [workspace.id for workspace in workspaces]
    if not workspace_ids:
        return []

    memberships = (
        await db.execute(
            select(Membership).where(
                Membership.user_id == user.id,
                Membership.workspace_id.in_(workspace_ids),
            )
        )
    ).scalars().all()
    role_by_workspace = {m.workspace_id: m.role.value for m in memberships}

    configs = (
        await db.execute(
            select(ModelConfig)
            .where(
                ModelConfig.owner_id == user.id,
                ModelConfig.scope == ModelScope.USER,
                ModelConfig.workspace_id.in_(workspace_ids),
            )
            .order_by(ModelConfig.created_at.asc())
        )
    ).scalars().all()
    configs_by_workspace: dict[uuid.UUID, list[ModelConfig]] = {}
    for cfg in configs:
        configs_by_workspace.setdefault(cfg.workspace_id, []).append(cfg)

    prefs = (
        await db.execute(
            select(UserModelPref).where(
                UserModelPref.user_id == user.id,
                UserModelPref.workspace_id.in_(workspace_ids),
            )
        )
    ).scalars().all()
    active_by_workspace = {pref.workspace_id: pref.active_model_config_id for pref in prefs}

    return [
        PersonalModelGroupResponse(
            workspace_id=workspace.id,
            workspace_name=workspace.name,
            workspace_mode=workspace.mode.value,
            role=role_by_workspace.get(workspace.id, "global_admin"),
            active_model_config_id=active_by_workspace.get(workspace.id),
            personal_models=[model_to_response(cfg) for cfg in configs_by_workspace.get(workspace.id, [])],
        )
        for workspace in workspaces
    ]
