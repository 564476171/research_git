from datetime import datetime, timedelta, timezone
from typing import Any

import jwt

from app.config import settings


_ALGO = "HS256"


def _encode(payload: dict[str, Any]) -> str:
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=_ALGO)


def create_access_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    return _encode({
        "sub": sub,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    })


def create_refresh_token(sub: str) -> str:
    now = datetime.now(timezone.utc)
    return _encode({
        "sub": sub,
        "type": "refresh",
        "iat": now,
        "exp": now + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
    })


def decode_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[_ALGO])
