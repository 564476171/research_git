import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.permissions import get_membership, is_global_admin, require_project_access
from app.db import get_db
from app.models import Commit, MembershipRole, Project, Review, ReviewStatus, User
from app.schemas.review import ReviewCreate, ReviewResponse, ReviewUpdate


router = APIRouter(tags=["reviews"])


async def _can_review(
    db: AsyncSession, reviewer_id: uuid.UUID, commit: Commit
) -> bool:
    """Reviewer must be an advisor bound to commit's author, or admin/self in the workspace."""
    if await is_global_admin(db, reviewer_id):
        return True
    project = await db.get(Project, commit.project_id)
    if not project:
        return False
    m = await get_membership(db, reviewer_id, project.workspace_id)
    if not m:
        return False
    if m.role in (MembershipRole.ADMIN, MembershipRole.SELF):
        return True
    if m.role == MembershipRole.ADVISOR:
        if str(commit.author_id) in (m.advisor_of or []):
            return True
    return False


@router.get(
    "/api/commits/{commit_id}/reviews",
    response_model=list[ReviewResponse],
)
async def list_reviews(
    commit_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await db.get(Commit, commit_id)
    if not commit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Commit not found")
    await require_project_access(db, user.id, commit.project_id)

    rows = (
        await db.execute(
            select(Review, User)
            .join(User, User.id == Review.reviewer_id)
            .where(Review.commit_id == commit_id)
            .order_by(Review.created_at.asc())
        )
    ).all()
    return [
        ReviewResponse(
            id=r.id,
            commit_id=r.commit_id,
            reviewer_id=r.reviewer_id,
            reviewer_display=u.display_name or u.email,
            content=r.content,
            anchor_paragraph_ord=r.anchor_paragraph_ord,
            status=r.status.value,
            created_at=r.created_at,
            resolved_at=r.resolved_at,
        )
        for r, u in rows
    ]


@router.post(
    "/api/commits/{commit_id}/reviews",
    status_code=status.HTTP_201_CREATED,
    response_model=ReviewResponse,
)
async def create_review(
    commit_id: uuid.UUID,
    payload: ReviewCreate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    commit = await db.get(Commit, commit_id)
    if not commit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Commit not found")

    if not await _can_review(db, user.id, commit):
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Only an advisor bound to the author (or workspace admin) can review",
        )

    review = Review(
        commit_id=commit_id,
        reviewer_id=user.id,
        content=payload.content,
        anchor_paragraph_ord=payload.anchor_paragraph_ord,
        status=ReviewStatus.OPEN,
    )
    db.add(review)
    await db.commit()
    await db.refresh(review)
    return ReviewResponse(
        id=review.id,
        commit_id=review.commit_id,
        reviewer_id=review.reviewer_id,
        reviewer_display=user.display_name or user.email,
        content=review.content,
        anchor_paragraph_ord=review.anchor_paragraph_ord,
        status=review.status.value,
        created_at=review.created_at,
        resolved_at=review.resolved_at,
    )


@router.patch("/api/reviews/{review_id}", response_model=ReviewResponse)
async def update_review(
    review_id: uuid.UUID,
    payload: ReviewUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    review = await db.get(Review, review_id)
    if not review:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Review not found")

    commit = await db.get(Commit, review.commit_id)
    if not commit:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Commit gone")
    await require_project_access(db, user.id, commit.project_id)

    can_resolve = (
        user.is_global_admin or review.reviewer_id == user.id or commit.author_id == user.id
    )
    if not can_resolve:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only reviewer or author may update")

    if payload.status is not None:
        new_status = ReviewStatus(payload.status)
        review.status = new_status
        review.resolved_at = (
            datetime.now(timezone.utc).replace(tzinfo=None)
            if new_status == ReviewStatus.RESOLVED
            else None
        )

    await db.commit()
    await db.refresh(review)

    reviewer = await db.get(User, review.reviewer_id)
    return ReviewResponse(
        id=review.id,
        commit_id=review.commit_id,
        reviewer_id=review.reviewer_id,
        reviewer_display=(reviewer.display_name or reviewer.email) if reviewer else None,
        content=review.content,
        anchor_paragraph_ord=review.anchor_paragraph_ord,
        status=review.status.value,
        created_at=review.created_at,
        resolved_at=review.resolved_at,
    )
