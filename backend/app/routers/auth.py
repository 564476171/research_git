from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.password import hash_password, verify_password
from app.config import settings
from app.db import get_db
from app.models import Membership, MembershipRole, User, Workspace, WorkspaceMode
from app.schemas.auth import (
    RefreshRequest,
    RegistrationPolicyResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
)
from app.services.registration import enforce_registration_policy, get_platform_settings


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _bootstrap_admin_emails() -> set[str]:
    return {
        email.strip().lower()
        for email in settings.ADMIN_BOOTSTRAP_EMAILS.split(",")
        if email.strip()
    }


def _is_bootstrap_admin(email: str) -> bool:
    return _normalize_email(email) in _bootstrap_admin_emails()


@router.get("/registration-policy", response_model=RegistrationPolicyResponse)
async def registration_policy(
    db: AsyncSession = Depends(get_db),
) -> RegistrationPolicyResponse:
    settings = await get_platform_settings(db)
    return RegistrationPolicyResponse(registration_mode=settings.registration_mode.value)


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    response_model=TokenResponse,
)
async def register(
    payload: UserRegister, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    email = _normalize_email(str(payload.email))
    existing = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    await enforce_registration_policy(db, payload.invite_code)

    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        display_name=payload.display_name,
        is_global_admin=_is_bootstrap_admin(email),
    )
    db.add(user)
    await db.flush()

    ws_name_owner = payload.display_name or email.split("@", 1)[0]
    ws = Workspace(
        name=f"{ws_name_owner}'s Workspace",
        mode=WorkspaceMode.PERSONAL,
        owner_id=user.id,
    )
    db.add(ws)
    await db.flush()

    membership = Membership(
        user_id=user.id,
        workspace_id=ws.id,
        role=MembershipRole.SELF,
    )
    db.add(membership)

    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: UserLogin, db: AsyncSession = Depends(get_db)
) -> TokenResponse:
    email = _normalize_email(str(payload.email))
    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")

    if _is_bootstrap_admin(email) and not user.is_global_admin:
        user.is_global_admin = True
        await db.commit()

    return TokenResponse(
        access_token=create_access_token(str(user.id)),
        refresh_token=create_refresh_token(str(user.id)),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest) -> TokenResponse:
    try:
        decoded = decode_token(payload.refresh_token)
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid refresh token")

    if decoded.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong token type")

    sub = decoded.get("sub")
    if not sub:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token payload")

    return TokenResponse(
        access_token=create_access_token(sub),
        refresh_token=create_refresh_token(sub),
    )
