import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Commit, Project
from app.services import llm_router

logger = logging.getLogger(__name__)

_DIFF_SYSTEM = (
    "You analyze drafts of a research document. Summarize what changed between two versions "
    "in one concise sentence (≤ 30 words), focusing on substantive content, argument, or structure. "
    "Ignore typo fixes and pure formatting unless that is the only change. Reply in the same language as the document."
)

_CUMULATIVE_SYSTEM = (
    "You analyze the evolution of a research document. Summarize the trajectory from the earliest provided "
    "version to the target version in 3-5 concise bullets. Focus on argument, structure, research intent, "
    "and important reversals. Reply in the same language as the document."
)


def _diff_prompt(prev_content: str | None, new_content: str) -> str:
    if not prev_content:
        return (
            "This is the first version of the document. Write one concise sentence summarizing "
            "the draft's main claim, focus, and direction. Do not ask for another version.\n\n"
            f"--- New version ---\n{new_content[:8000]}"
        )
    return (
        "Compare these two versions and write a one-sentence summary of what changed.\n\n"
        f"--- Previous version ---\n{prev_content[:6000]}\n\n"
        f"--- New version ---\n{new_content[:6000]}"
    )


def _cumulative_prompt(commits: list[Commit], target: Commit) -> str:
    versions = []
    for index, commit in enumerate(commits, start=1):
        label = commit.message or f"v{index}"
        versions.append(f"--- Version {index}: {label} ---\n{commit.content[:2500]}")
    return (
        "Summarize the research draft's evolution up to the target version. "
        "Mention the main direction, important changes, and any reversals or recurring ideas.\n\n"
        f"Target commit: {target.message or target.id}\n\n"
        + "\n\n".join(versions)
    )


async def ensure_commit_embedding(db: AsyncSession, commit: Commit, user_id: uuid.UUID) -> None:
    if commit.embedding is not None:
        return
    project = await db.get(Project, commit.project_id)
    if not project:
        return
    cfg = await llm_router.resolve(db, user_id, project.workspace_id)
    if not cfg.embedding_model:
        return
    client = llm_router.to_client(cfg)
    vectors = await client.embed([commit.content[:8000]])
    commit.embedding = vectors[0]
    await db.commit()


async def generate_diff_summary(db: AsyncSession, commit: Commit, user_id: uuid.UUID) -> tuple[str, uuid.UUID]:
    project = await db.get(Project, commit.project_id)
    if not project:
        raise ValueError("Project not found")
    cfg = await llm_router.resolve(db, user_id, project.workspace_id)
    client = llm_router.to_client(cfg)

    prev_content: str | None = None
    if commit.parent_id:
        parent = await db.get(Commit, commit.parent_id)
        if parent:
            prev_content = parent.content

    content = await client.chat(
        [
            {"role": "system", "content": _DIFF_SYSTEM},
            {"role": "user", "content": _diff_prompt(prev_content, commit.content)},
        ],
        max_tokens=180,
    )
    return content.strip(), cfg.id


async def generate_cumulative_summary(db: AsyncSession, commit: Commit, user_id: uuid.UUID) -> tuple[str, uuid.UUID]:
    project = await db.get(Project, commit.project_id)
    if not project:
        raise ValueError("Project not found")
    cfg = await llm_router.resolve(db, user_id, project.workspace_id)
    client = llm_router.to_client(cfg)

    rows = (
        await db.execute(
            select(Commit)
            .where(Commit.project_id == commit.project_id)
            .order_by(Commit.created_at.asc())
        )
    ).scalars().all()
    by_id = {row.id: row for row in rows}
    chain: list[Commit] = []
    cursor: Commit | None = commit
    while cursor:
        chain.append(cursor)
        cursor = by_id.get(cursor.parent_id) if cursor.parent_id else None
    chain.reverse()

    content = await client.chat(
        [
            {"role": "system", "content": _CUMULATIVE_SYSTEM},
            {"role": "user", "content": _cumulative_prompt(chain, commit)},
        ],
        max_tokens=420,
    )
    return content.strip(), cfg.id
