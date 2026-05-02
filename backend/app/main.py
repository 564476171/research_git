from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.config import settings
from app.db import AsyncSessionLocal
from app.middleware.dynamic_cors import DynamicCORSMiddleware
from app.routers import admin, ai, auth, commits, members, models, profile, projects, reviews, workspaces
from app.services.registration import normalize_origin


Path(settings.MEDIA_ROOT).mkdir(parents=True, exist_ok=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Research Git API", version="0.2.0", lifespan=lifespan)

def fallback_origins() -> set[str]:
    origins: set[str] = set()
    for value in (settings.CORS_ORIGINS, settings.PUBLIC_FRONTEND_URL):
        for item in value.split(","):
            origin = normalize_origin(item)
            if origin:
                origins.add(origin)
    return origins


app.add_middleware(
    DynamicCORSMiddleware,
    sessionmaker=AsyncSessionLocal,
    fallback_origins=fallback_origins(),
)

app.mount(settings.MEDIA_URL, StaticFiles(directory=settings.MEDIA_ROOT), name="media")

app.include_router(auth.router)
app.include_router(workspaces.router)
app.include_router(projects.router)
app.include_router(models.router)
app.include_router(commits.router)
app.include_router(ai.router)
app.include_router(members.router)
app.include_router(reviews.router)
app.include_router(profile.router)
app.include_router(admin.router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
