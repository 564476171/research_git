import time

from fastapi import Request, Response
from sqlalchemy.ext.asyncio import async_sessionmaker
from starlette.types import ASGIApp

from app.models import PlatformSettings
from app.services.registration import normalize_origin


class DynamicCORSMiddleware:
    def __init__(
        self,
        app: ASGIApp,
        sessionmaker: async_sessionmaker,
        fallback_origins: set[str],
        ttl_seconds: int = 30,
    ):
        self.app = app
        self.sessionmaker = sessionmaker
        self.fallback_origins = fallback_origins
        self.ttl_seconds = ttl_seconds
        self._cached_frontend_url: str | None = None
        self._cache_expires_at = 0.0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive=receive)
        origin = request.headers.get("origin")
        allowed_origin = await self._allowed_origin(origin)
        allow_headers = request.headers.get("access-control-request-headers") or "Authorization, Content-Type"
        if request.method == "OPTIONS" and origin and "access-control-request-method" in request.headers:
            response = Response(status_code=204)
            if allowed_origin:
                self._set_headers(response, allowed_origin, allow_headers)
            await response(scope, receive, send)
            return

        async def send_wrapper(message):
            if message["type"] == "http.response.start" and allowed_origin:
                headers = message.setdefault("headers", [])
                for key, value in self._headers(allowed_origin, allow_headers).items():
                    headers.append((key.lower().encode("latin-1"), value.encode("latin-1")))
            await send(message)

        await self.app(scope, receive, send_wrapper)

    async def _allowed_origin(self, origin: str | None) -> str | None:
        if not origin:
            return None
        try:
            normalized = normalize_origin(origin)
        except Exception:
            return None
        if not normalized:
            return None
        if normalized in self.fallback_origins:
            return normalized
        frontend_url = await self._frontend_url()
        return normalized if frontend_url == normalized else None

    async def _frontend_url(self) -> str | None:
        now = time.monotonic()
        if now < self._cache_expires_at:
            return self._cached_frontend_url
        async with self.sessionmaker() as db:
            settings = await db.get(PlatformSettings, 1)
            self._cached_frontend_url = settings.frontend_url if settings else None
            self._cache_expires_at = now + self.ttl_seconds
        return self._cached_frontend_url

    def _set_headers(self, response: Response, allowed_origin: str, allow_headers: str) -> None:
        for key, value in self._headers(allowed_origin, allow_headers).items():
            response.headers[key] = value

    def _headers(self, allowed_origin: str, allow_headers: str) -> dict[str, str]:
        return {
            "Access-Control-Allow-Origin": allowed_origin,
            "Access-Control-Allow-Credentials": "true",
            "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": allow_headers,
            "Vary": "Origin",
        }
