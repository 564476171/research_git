import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.crypto import decrypt
from app.models import ModelConfig, ModelScope, UserModelPref
from app.services.llm_client import LLMClient, LLMError


class NoModelConfiguredError(LLMError):
    pass


async def resolve(
    db: AsyncSession,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    model_config_id: uuid.UUID | None = None,
) -> ModelConfig:
    if model_config_id:
        cfg = (
            await db.execute(
                select(ModelConfig).where(
                    ModelConfig.id == model_config_id,
                    ModelConfig.workspace_id == workspace_id,
                )
            )
        ).scalar_one_or_none()
        if cfg and (cfg.scope == ModelScope.WORKSPACE or cfg.owner_id == user_id):
            return cfg
        raise NoModelConfiguredError("Selected model is not available in this workspace")

    pref = (
        await db.execute(
            select(UserModelPref).where(
                UserModelPref.user_id == user_id,
                UserModelPref.workspace_id == workspace_id,
            )
        )
    ).scalar_one_or_none()
    if pref:
        cfg = (
            await db.execute(
                select(ModelConfig).where(ModelConfig.id == pref.active_model_config_id)
            )
        ).scalar_one_or_none()
        if cfg:
            return cfg

    cfg = (
        await db.execute(
            select(ModelConfig).where(
                ModelConfig.workspace_id == workspace_id,
                ModelConfig.scope == ModelScope.WORKSPACE,
                ModelConfig.is_default.is_(True),
            )
        )
    ).scalar_one_or_none()
    if cfg:
        return cfg

    cfg = (
        await db.execute(
            select(ModelConfig)
            .where(
                ModelConfig.workspace_id == workspace_id,
                ModelConfig.scope == ModelScope.USER,
                ModelConfig.owner_id == user_id,
            )
            .order_by(ModelConfig.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if cfg:
        return cfg

    raise NoModelConfiguredError(
        "No model configured. Add one in the workspace Models tab."
    )


def to_client(cfg: ModelConfig) -> LLMClient:
    return LLMClient(
        base_url=cfg.base_url,
        api_key=decrypt(cfg.api_key_enc),
        model=cfg.model,
        embedding_model=cfg.embedding_model,
    )
