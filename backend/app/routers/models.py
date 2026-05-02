import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.permissions import require_admin_or_self, require_member
from app.crypto import encrypt
from app.db import get_db
from app.models import ModelConfig, ModelScope, User, UserModelPref
from app.schemas.model_config import (
    ModelConfigCreate,
    ModelConfigResponse,
    ModelConfigUpdate,
    SetActiveModelRequest,
)
from app.services import llm_router


router = APIRouter(tags=["models"])


def _to_response(cfg: ModelConfig) -> ModelConfigResponse:
    return ModelConfigResponse(
        id=cfg.id,
        workspace_id=cfg.workspace_id,
        owner_id=cfg.owner_id,
        scope=cfg.scope.value,
        name=cfg.name,
        base_url=cfg.base_url,
        model=cfg.model,
        embedding_model=cfg.embedding_model,
        is_default=cfg.is_default,
        created_at=cfg.created_at,
    )


@router.get(
    "/api/workspaces/{workspace_id}/models",
    response_model=list[ModelConfigResponse],
)
async def list_models(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_member(db, user.id, workspace_id)
    rows = (
        await db.execute(
            select(ModelConfig)
            .where(
                ModelConfig.workspace_id == workspace_id,
                (
                    (ModelConfig.scope == ModelScope.WORKSPACE)
                    | (
                        (ModelConfig.scope == ModelScope.USER)
                        & (ModelConfig.owner_id == user.id)
                    )
                ),
            )
            .order_by(ModelConfig.created_at.asc())
        )
    ).scalars().all()
    return [_to_response(c) for c in rows]


@router.post(
    "/api/workspaces/{workspace_id}/models",
    status_code=status.HTTP_201_CREATED,
    response_model=ModelConfigResponse,
)
async def create_model(
    workspace_id: uuid.UUID,
    payload: ModelConfigCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    membership = await require_member(db, user.id, workspace_id)

    scope = ModelScope(payload.scope)
    if scope == ModelScope.WORKSPACE:
        if not user.is_global_admin and membership.role.value not in ("admin", "self"):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN,
                "Only admin/owner can create workspace-shared models",
            )
        owner_id = None
    else:
        owner_id = user.id

    if payload.is_default and scope == ModelScope.WORKSPACE:
        await db.execute(
            update(ModelConfig)
            .where(
                ModelConfig.workspace_id == workspace_id,
                ModelConfig.scope == ModelScope.WORKSPACE,
            )
            .values(is_default=False)
        )

    cfg = ModelConfig(
        workspace_id=workspace_id,
        owner_id=owner_id,
        scope=scope,
        name=payload.name,
        base_url=payload.base_url,
        model=payload.model,
        embedding_model=payload.embedding_model,
        api_key_enc=encrypt(payload.api_key),
        is_default=payload.is_default and scope == ModelScope.WORKSPACE,
    )
    db.add(cfg)
    await db.commit()
    await db.refresh(cfg)
    return _to_response(cfg)


@router.patch(
    "/api/models/{model_id}",
    response_model=ModelConfigResponse,
)
async def update_model(
    model_id: uuid.UUID,
    payload: ModelConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(ModelConfig, model_id)
    if not cfg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found")

    if cfg.scope == ModelScope.USER and cfg.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your model")
    if cfg.scope == ModelScope.WORKSPACE:
        await require_admin_or_self(db, user.id, cfg.workspace_id)

    if payload.name is not None:
        cfg.name = payload.name
    if payload.base_url is not None:
        cfg.base_url = payload.base_url
    if payload.model is not None:
        cfg.model = payload.model
    if payload.embedding_model is not None:
        cfg.embedding_model = payload.embedding_model
    if payload.api_key is not None:
        cfg.api_key_enc = encrypt(payload.api_key)
    if payload.is_default is not None and cfg.scope == ModelScope.WORKSPACE:
        if payload.is_default:
            await db.execute(
                update(ModelConfig)
                .where(
                    ModelConfig.workspace_id == cfg.workspace_id,
                    ModelConfig.scope == ModelScope.WORKSPACE,
                    ModelConfig.id != cfg.id,
                )
                .values(is_default=False)
            )
        cfg.is_default = payload.is_default

    await db.commit()
    await db.refresh(cfg)
    return _to_response(cfg)


@router.delete("/api/models/{model_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_model(
    model_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    cfg = await db.get(ModelConfig, model_id)
    if not cfg:
        return
    if cfg.scope == ModelScope.USER and cfg.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your model")
    if cfg.scope == ModelScope.WORKSPACE:
        await require_admin_or_self(db, user.id, cfg.workspace_id)
    await db.delete(cfg)
    await db.commit()


@router.get("/api/workspaces/{workspace_id}/active-model")
async def get_active_model(
    workspace_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_member(db, user.id, workspace_id)
    try:
        cfg = await llm_router.resolve(db, user.id, workspace_id)
    except llm_router.NoModelConfiguredError:
        return {"active_model_config_id": None}
    return {"active_model_config_id": str(cfg.id)}


@router.put("/api/workspaces/{workspace_id}/active-model")
async def set_active_model(
    workspace_id: uuid.UUID,
    payload: SetActiveModelRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_member(db, user.id, workspace_id)

    cfg = await db.get(ModelConfig, payload.model_config_id)
    if not cfg or cfg.workspace_id != workspace_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Model not found in this workspace")
    if cfg.scope == ModelScope.USER and cfg.owner_id != user.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Not your model")

    pref = (
        await db.execute(
            select(UserModelPref).where(
                UserModelPref.user_id == user.id,
                UserModelPref.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if pref:
        pref.active_model_config_id = cfg.id
    else:
        pref = UserModelPref(
            user_id=user.id,
            workspace_id=workspace_id,
            active_model_config_id=cfg.id,
        )
        db.add(pref)
    await db.commit()
    return {"active_model_config_id": str(cfg.id)}
