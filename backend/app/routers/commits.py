import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.permissions import require_project_access
from app.db import get_db
from app.models import AiOutput, AiOutputKind, Commit, CommitStatus, ProjectBranch, User
from app.schemas.commit import (
    AiOutputResponse,
    AiSummaryRequest,
    BranchResponse,
    CommitCreate,
    CommitResponse,
    CommitSummary,
    CommitUpdate,
    ForkRequest,
    GraphCommit,
    ProjectGraphResponse,
    SimilarCommit,
)
from app.services.processing import (
    ensure_commit_embedding,
    generate_cumulative_summary,
    generate_diff_summary,
)


router = APIRouter(tags=["commits"])


def _commit_response(commit: Commit) -> CommitResponse:
    return CommitResponse(
        id=commit.id,
        project_id=commit.project_id,
        parent_id=commit.parent_id,
        branch_id=commit.branch_id,
        author_id=commit.author_id,
        message=commit.message,
        content=commit.content,
        llm_summary=commit.llm_summary,
        status=commit.status.value,
        created_at=commit.created_at,
    )


def _branch_response(branch: ProjectBranch) -> BranchResponse:
    return BranchResponse(
        id=branch.id,
        project_id=branch.project_id,
        name=branch.name,
        head_commit_id=branch.head_commit_id,
        created_from_commit_id=branch.created_from_commit_id,
        created_by_id=branch.created_by_id,
        is_default=branch.is_default,
        created_at=branch.created_at,
    )


def _ai_output_response(output: AiOutput) -> AiOutputResponse:
    return AiOutputResponse(
        id=output.id,
        project_id=output.project_id,
        commit_id=output.commit_id,
        user_id=output.user_id,
        kind=output.kind.value,
        content=output.content,
        model_config_id=output.model_config_id,
        created_at=output.created_at,
    )


async def _find_default_branch(db: AsyncSession, project_id: uuid.UUID) -> ProjectBranch | None:
    return (
        await db.execute(
            select(ProjectBranch).where(
                ProjectBranch.project_id == project_id,
                ProjectBranch.is_default.is_(True),
            )
        )
    ).scalar_one_or_none()


async def _ensure_default_branch(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> ProjectBranch:
    branch = await _find_default_branch(db, project_id)
    if branch:
        return branch

    latest = (
        await db.execute(
            select(Commit.id)
            .where(Commit.project_id == project_id)
            .order_by(desc(Commit.created_at))
            .limit(1)
        )
    ).scalar_one_or_none()
    branch = ProjectBranch(
        project_id=project_id,
        name="main",
        head_commit_id=latest,
        created_from_commit_id=None,
        created_by_id=user_id,
        is_default=True,
    )
    db.add(branch)
    try:
        await db.flush()
    except IntegrityError:
        await db.rollback()
        branch = await _find_default_branch(db, project_id)
        if branch:
            return branch
        raise
    if latest:
        await db.execute(
            Commit.__table__.update()
            .where(Commit.project_id == project_id, Commit.branch_id.is_(None))
            .values(branch_id=branch.id)
        )
    await db.commit()
    await db.refresh(branch)
    return branch


async def _get_branch_or_default(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID, branch_id: uuid.UUID | None
) -> ProjectBranch:
    if not branch_id:
        return await _ensure_default_branch(db, project_id, user_id)
    branch = await db.get(ProjectBranch, branch_id)
    if not branch or branch.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
    return branch


async def _get_commit_for_user(
    db: AsyncSession, user_id: uuid.UUID, commit_id: uuid.UUID
) -> Commit:
    commit = await db.get(Commit, commit_id)
    if not commit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Commit not found")
    await require_project_access(db, user_id, commit.project_id)
    return commit


async def _branch_commit_chain(
    db: AsyncSession, project_id: uuid.UUID, head_commit_id: uuid.UUID | None
) -> list[Commit]:
    if not head_commit_id:
        return []
    rows = (
        await db.execute(select(Commit).where(Commit.project_id == project_id))
    ).scalars().all()
    by_id = {row.id: row for row in rows}
    chain: list[Commit] = []
    cursor = by_id.get(head_commit_id)
    while cursor:
        chain.append(cursor)
        cursor = by_id.get(cursor.parent_id) if cursor.parent_id else None
    return chain


@router.get(
    "/api/projects/{project_id}/commits",
    response_model=list[CommitSummary],
)
async def list_commits(
    project_id: uuid.UUID,
    branch_id: uuid.UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(db, user.id, project_id)
    if branch_id:
        branch = await _get_branch_or_default(db, project_id, user.id, branch_id)
        rows = await _branch_commit_chain(db, project_id, branch.head_commit_id)
        return [
            CommitSummary(
                id=commit.id,
                parent_id=commit.parent_id,
                branch_id=commit.branch_id,
                author_id=commit.author_id,
                message=commit.message,
                llm_summary=commit.llm_summary,
                status=commit.status.value,
                created_at=commit.created_at,
            )
            for commit in rows
        ]

    query = (
        select(
            Commit.id,
            Commit.parent_id,
            Commit.branch_id,
            Commit.author_id,
            Commit.message,
            Commit.llm_summary,
            Commit.status,
            Commit.created_at,
        )
        .where(Commit.project_id == project_id)
        .order_by(desc(Commit.created_at))
    )
    rows = (await db.execute(query)).all()
    return [
        CommitSummary(
            id=r.id,
            parent_id=r.parent_id,
            branch_id=r.branch_id,
            author_id=r.author_id,
            message=r.message,
            llm_summary=r.llm_summary,
            status=r.status.value,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post(
    "/api/projects/{project_id}/commits",
    status_code=status.HTTP_201_CREATED,
    response_model=CommitResponse,
)
async def create_commit(
    project_id: uuid.UUID,
    payload: CommitCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(db, user.id, project_id)
    branch = await _get_branch_or_default(db, project_id, user.id, payload.branch_id)

    commit = Commit(
        project_id=project_id,
        parent_id=branch.head_commit_id or branch.created_from_commit_id,
        branch_id=branch.id,
        author_id=user.id,
        message=payload.message,
        content=payload.content,
        status=CommitStatus.READY,
    )
    db.add(commit)
    await db.flush()
    branch.head_commit_id = commit.id
    await db.commit()
    await db.refresh(commit)

    return _commit_response(commit)


@router.get("/api/commits/{commit_id}", response_model=CommitResponse)
async def get_commit(
    commit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await _get_commit_for_user(db, user.id, commit_id)
    return _commit_response(commit)


@router.patch("/api/commits/{commit_id}", response_model=CommitResponse)
async def update_commit(
    commit_id: uuid.UUID,
    payload: CommitUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await _get_commit_for_user(db, user.id, commit_id)
    commit.content = payload.content
    commit.message = payload.message
    commit.llm_summary = None
    commit.embedding = None
    commit.status = CommitStatus.READY
    await db.commit()
    await db.refresh(commit)
    return _commit_response(commit)


@router.delete("/api/commits/{commit_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_commit(
    commit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await _get_commit_for_user(db, user.id, commit_id)
    child_count = (
        await db.execute(select(func.count()).select_from(Commit).where(Commit.parent_id == commit.id))
    ).scalar_one()
    if child_count:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Only leaf commits can be deleted. Fork or delete child commits first.",
        )

    branches = (
        await db.execute(select(ProjectBranch).where(ProjectBranch.head_commit_id == commit.id))
    ).scalars().all()
    for branch in branches:
        branch.head_commit_id = commit.parent_id

    await db.delete(commit)
    await db.commit()


@router.get(
    "/api/commits/{commit_id}/similar",
    response_model=list[SimilarCommit],
)
async def list_similar(
    commit_id: uuid.UUID,
    limit: int = 5,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await _get_commit_for_user(db, user.id, commit_id)

    if commit.embedding is None:
        try:
            await ensure_commit_embedding(db, commit, user.id)
            await db.refresh(commit)
        except Exception:
            return []
    if commit.embedding is None:
        return []

    rows = (
        await db.execute(
            select(
                Commit.id,
                Commit.message,
                Commit.created_at,
                (1 - Commit.embedding.cosine_distance(commit.embedding)).label("similarity"),
            )
            .where(
                Commit.project_id == commit.project_id,
                Commit.id != commit.id,
                Commit.embedding.isnot(None),
            )
            .order_by(Commit.embedding.cosine_distance(commit.embedding).asc())
            .limit(limit)
        )
    ).all()

    return [
        SimilarCommit(
            id=r.id,
            message=r.message,
            created_at=r.created_at,
            similarity=float(r.similarity),
        )
        for r in rows
    ]


@router.post("/api/commits/{commit_id}/ai", response_model=AiOutputResponse)
async def generate_commit_ai(
    commit_id: uuid.UUID,
    payload: AiSummaryRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await _get_commit_for_user(db, user.id, commit_id)
    kind = AiOutputKind(payload.kind)
    if kind == AiOutputKind.DIFF_SUMMARY:
        content, model_config_id = await generate_diff_summary(db, commit, user.id)
        commit.llm_summary = content
    else:
        content, model_config_id = await generate_cumulative_summary(db, commit, user.id)
    output = AiOutput(
        project_id=commit.project_id,
        commit_id=commit.id,
        user_id=user.id,
        kind=kind,
        content=content,
        model_config_id=model_config_id,
    )
    db.add(output)
    await db.commit()
    await db.refresh(output)
    return _ai_output_response(output)


@router.get("/api/commits/{commit_id}/ai", response_model=list[AiOutputResponse])
async def list_commit_ai_outputs(
    commit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await _get_commit_for_user(db, user.id, commit_id)
    rows = (
        await db.execute(
            select(AiOutput)
            .where(AiOutput.commit_id == commit.id, AiOutput.user_id == user.id)
            .order_by(desc(AiOutput.created_at))
        )
    ).scalars().all()
    return [_ai_output_response(row) for row in rows]


@router.get("/api/projects/{project_id}/branches", response_model=list[BranchResponse])
async def list_branches(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(db, user.id, project_id)
    await _ensure_default_branch(db, project_id, user.id)
    rows = (
        await db.execute(
            select(ProjectBranch)
            .where(ProjectBranch.project_id == project_id)
            .order_by(ProjectBranch.is_default.desc(), ProjectBranch.created_at.asc())
        )
    ).scalars().all()
    return [_branch_response(row) for row in rows]


@router.post("/api/commits/{commit_id}/fork", response_model=BranchResponse)
async def fork_commit(
    commit_id: uuid.UUID,
    payload: ForkRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await _get_commit_for_user(db, user.id, commit_id)
    branch = ProjectBranch(
        project_id=commit.project_id,
        name=payload.name.strip(),
        head_commit_id=commit.id,
        created_from_commit_id=commit.id,
        created_by_id=user.id,
        is_default=False,
    )
    db.add(branch)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Branch name already exists")
    await db.refresh(branch)
    return _branch_response(branch)


@router.delete("/api/projects/{project_id}/branches/{branch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_branch(
    project_id: uuid.UUID,
    branch_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await require_project_access(db, user.id, project_id)
    branch = await db.get(ProjectBranch, branch_id)
    if not branch or branch.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Branch not found")
    if branch.is_default:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Default branch cannot be deleted")

    await db.execute(
        Commit.__table__.update()
        .where(Commit.project_id == project_id, Commit.branch_id == branch.id)
        .values(branch_id=None)
    )
    await db.delete(branch)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/projects/{project_id}/graph", response_model=ProjectGraphResponse)
async def get_project_graph(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await require_project_access(db, user.id, project_id)
    await _ensure_default_branch(db, project_id, user.id)
    branches = (
        await db.execute(
            select(ProjectBranch)
            .where(ProjectBranch.project_id == project_id)
            .order_by(ProjectBranch.is_default.desc(), ProjectBranch.created_at.asc())
        )
    ).scalars().all()
    head_ids = {branch.head_commit_id for branch in branches if branch.head_commit_id}
    commits = (
        await db.execute(
            select(Commit)
            .where(Commit.project_id == project_id)
            .order_by(Commit.created_at.asc())
        )
    ).scalars().all()
    return ProjectGraphResponse(
        branches=[_branch_response(branch) for branch in branches],
        commits=[
            GraphCommit(
                id=commit.id,
                parent_id=commit.parent_id,
                branch_id=commit.branch_id,
                message=commit.message,
                created_at=commit.created_at,
                is_head=commit.id in head_ids,
            )
            for commit in commits
        ],
    )
