import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, Header, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy import desc, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.jwt import decode_token
from app.auth.permissions import require_project_access
from app.db import AsyncSessionLocal, get_db
from app.models import AiConversation, AiMessage, AiMessageRole, Commit, Project, ProjectBranch, User
from app.schemas.ai import (
    AiChatRequest,
    AiChatResponse,
    AiConversationResponse,
    AiMessageResponse,
)
from app.services import llm_router


router = APIRouter(prefix="/api", tags=["ai"])


def _message_response(message: AiMessage) -> AiMessageResponse:
    return AiMessageResponse(
        id=message.id,
        role=message.role.value,
        content=message.content,
        created_at=message.created_at,
    )


async def _get_conversation(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> AiConversation | None:
    return (
        await db.execute(
            select(AiConversation).where(
                AiConversation.project_id == project_id,
                AiConversation.user_id == user_id,
            )
        )
    ).scalar_one_or_none()


async def _ensure_conversation(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> AiConversation:
    conversation = await _get_conversation(db, project_id, user_id)
    if conversation:
        return conversation
    conversation = AiConversation(project_id=project_id, user_id=user_id)
    db.add(conversation)
    await db.flush()
    return conversation


async def _conversation_messages(db: AsyncSession, conversation_id: uuid.UUID) -> list[AiMessage]:
    return list(
        (
            await db.execute(
                select(AiMessage)
                .where(AiMessage.conversation_id == conversation_id)
                .order_by(AiMessage.created_at.asc())
            )
        ).scalars().all()
    )


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
    chain.reverse()
    return chain[-8:]


async def _project_context(
    db: AsyncSession,
    project: Project,
    branch_id: uuid.UUID | None,
) -> str:
    branch_name = ""
    if branch_id:
        branch = await db.get(ProjectBranch, branch_id)
        if branch and branch.project_id == project.id:
            branch_name = branch.name
            commits = await _branch_commit_chain(db, project.id, branch.head_commit_id)
        else:
            commits = []
    else:
        commits = (
            await db.execute(
                select(Commit)
                .where(Commit.project_id == project.id)
                .order_by(desc(Commit.created_at))
                .limit(8)
            )
        ).scalars().all()
        commits = list(reversed(commits))
    lines = [
        f"Project title: {project.title}",
        f"Project description: {project.description or ''}",
    ]
    if branch_name:
        lines.append(f"Current branch: {branch_name}")
    for commit in commits:
        lines.append(
            "\n".join(
                [
                    f"Version: {commit.message or commit.id}",
                    f"Summary: {commit.llm_summary or ''}",
                    f"Content excerpt: {commit.content[:1200]}",
                ]
            )
        )
    return "\n\n".join(lines)


async def _chat_messages(
    db: AsyncSession,
    project: Project,
    user_id: uuid.UUID,
    payload: AiChatRequest,
) -> list[dict]:
    conversation = await _get_conversation(db, project.id, user_id)
    history = await _conversation_messages(db, conversation.id) if conversation else []
    context = await _project_context(db, project, payload.branch_id)
    messages = [
        {
            "role": "system",
            "content": (
                "You are Research Git's project assistant. Answer questions about the user's research draft, "
                "version history, advisor feedback, and writing trajectory. Use the provided project context. "
                "Be concrete and concise, and reply in the user's language."
            ),
        },
        {"role": "user", "content": f"Project context:\n{context[:12000]}"},
    ]
    for message in history[-12:]:
        messages.append({"role": message.role.value, "content": message.content})
    messages.append({"role": "user", "content": payload.message})
    return messages


@router.get(
    "/projects/{project_id}/ai/conversation",
    response_model=AiConversationResponse,
)
async def get_ai_conversation(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(db, user.id, project_id)
    conversation = await _get_conversation(db, project.id, user.id)
    if not conversation:
        return AiConversationResponse(
            id=None,
            project_id=project.id,
            user_id=user.id,
            messages=[],
        )
    messages = await _conversation_messages(db, conversation.id)
    return AiConversationResponse(
        id=conversation.id,
        project_id=project.id,
        user_id=user.id,
        messages=[_message_response(message) for message in messages],
    )


@router.post("/projects/{project_id}/ai/chat", response_model=AiChatResponse)
async def chat_with_project_ai(
    project_id: uuid.UUID,
    payload: AiChatRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(db, user.id, project_id)
    cfg = await llm_router.resolve(db, user.id, project.workspace_id, payload.model_config_id)
    client = llm_router.to_client(cfg)
    messages = await _chat_messages(db, project, user.id, payload)

    content = (await client.chat(messages, max_tokens=700)).strip()
    conversation = await _ensure_conversation(db, project.id, user.id)
    user_message = AiMessage(
        conversation_id=conversation.id,
        role=AiMessageRole.USER,
        content=payload.message,
    )
    assistant_message = AiMessage(
        conversation_id=conversation.id,
        role=AiMessageRole.ASSISTANT,
        content=content,
    )
    conversation.updated_at = datetime.utcnow()
    db.add(user_message)
    db.add(assistant_message)
    await db.commit()
    await db.refresh(conversation)
    await db.refresh(user_message)
    await db.refresh(assistant_message)
    return AiChatResponse(
        conversation_id=conversation.id,
        user_message=_message_response(user_message),
        assistant_message=_message_response(assistant_message),
    )


@router.get("/projects/{project_id}/ai/chat/stream")
async def stream_project_ai_chat(
    project_id: uuid.UUID,
    message: str,
    branch_id: uuid.UUID | None = None,
    model_config_id: uuid.UUID | None = None,
    authorization: str | None = Header(default=None),
):
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing access token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_token(token)
        user_id = uuid.UUID(payload.get("sub", ""))
        if payload.get("type") != "access":
            raise ValueError
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid access token")

    request = AiChatRequest(
        message=message,
        branch_id=branch_id,
        model_config_id=model_config_id,
    )

    async def event_stream():
        content_parts: list[str] = []
        async with AsyncSessionLocal() as db:
            user = await db.get(User, user_id)
            if not user:
                yield "event: error\ndata: User not found\n\n"
                return
            try:
                project = await require_project_access(db, user.id, project_id)
                cfg = await llm_router.resolve(db, user.id, project.workspace_id, request.model_config_id)
                client = llm_router.to_client(cfg)
                messages = await _chat_messages(db, project, user.id, request)
                async for chunk in client.stream_chat(messages, max_tokens=700):
                    content_parts.append(chunk)
                    yield f"data: {json.dumps({'delta': chunk}, ensure_ascii=False)}\n\n"

                content = "".join(content_parts).strip()
                conversation = await _ensure_conversation(db, project.id, user.id)
                user_message = AiMessage(
                    conversation_id=conversation.id,
                    role=AiMessageRole.USER,
                    content=request.message,
                )
                assistant_message = AiMessage(
                    conversation_id=conversation.id,
                    role=AiMessageRole.ASSISTANT,
                    content=content,
                )
                conversation.updated_at = datetime.utcnow()
                db.add(user_message)
                db.add(assistant_message)
                await db.commit()
                await db.refresh(user_message)
                await db.refresh(assistant_message)
                yield f"event: user_message\ndata: {_message_response(user_message).model_dump_json()}\n\n"
                yield f"event: assistant_message\ndata: {_message_response(assistant_message).model_dump_json()}\n\n"
                yield "event: done\ndata: done\n\n"
            except Exception as exc:
                await db.rollback()
                yield f"event: error\ndata: {str(exc)}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/projects/{project_id}/ai/conversation", status_code=status.HTTP_204_NO_CONTENT)
async def clear_ai_conversation(
    project_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    project = await require_project_access(db, user.id, project_id)
    conversation = await _get_conversation(db, project.id, user.id)
    if conversation:
        await db.delete(conversation)
        await db.commit()
