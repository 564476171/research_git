import hashlib
import secrets
from datetime import datetime
from urllib.parse import urlparse

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.models import InviteCode, PlatformSettings, RegistrationMode


def normalize_invite_code(code: str) -> str:
    return code.strip()


def hash_invite_code(code: str) -> str:
    return hashlib.sha256(normalize_invite_code(code).encode("utf-8")).hexdigest()


def generate_invite_code() -> str:
    return secrets.token_urlsafe(18)


def _first_origin(value: str) -> str | None:
    for item in value.split(","):
        normalized = normalize_origin(item)
        if normalized:
            return normalized
    return None


def normalize_origin(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip().rstrip("/")
    if not stripped:
        return None
    if "*" in stripped:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Frontend URL cannot contain wildcards")
    parsed = urlparse(stripped)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Frontend URL must start with http:// or https://")
    return f"{parsed.scheme}://{parsed.netloc}"


def default_frontend_url() -> str:
    return _first_origin(app_settings.PUBLIC_FRONTEND_URL) or _first_origin(app_settings.CORS_ORIGINS) or "http://localhost:3000"


async def get_platform_settings(db: AsyncSession) -> PlatformSettings:
    settings = await db.get(PlatformSettings, 1)
    if settings:
        return settings
    settings = PlatformSettings(
        id=1,
        registration_mode=RegistrationMode.OPEN,
        frontend_url=default_frontend_url(),
    )
    db.add(settings)
    await db.flush()
    return settings


async def consume_invite_code(db: AsyncSession, code: str | None) -> None:
    if not code or not normalize_invite_code(code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invite code is required")

    invite = (
        await db.execute(
            select(InviteCode)
            .where(InviteCode.code_hash == hash_invite_code(code))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not invite or not invite.active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid invite code")

    now = datetime.utcnow()
    if invite.expires_at and invite.expires_at <= now:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invite code has expired")
    if invite.use_count >= invite.max_uses:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invite code has been fully used")

    invite.use_count += 1
    invite.last_used_at = now


async def enforce_registration_policy(db: AsyncSession, invite_code: str | None) -> None:
    settings = await get_platform_settings(db)
    if settings.registration_mode == RegistrationMode.CLOSED:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Registration is closed")
    if settings.registration_mode == RegistrationMode.INVITE_CODE:
        await consume_invite_code(db, invite_code)
