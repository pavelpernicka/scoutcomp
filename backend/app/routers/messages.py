from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session, joinedload

from ..dependencies import get_current_active_user, get_db, require_action
from ..models import DirectMessage, User
from ..permissions import permission_keys

router = APIRouter(prefix="/messages", tags=["messages"])

require_messaging = require_action("core.messages")


class MessageCreate(BaseModel):
    recipient_id: int
    body: str = Field(min_length=1, max_length=5000)


def _now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _can_override(db: Session, user: User) -> bool:
    return "core.messages.override" in permission_keys(db, user)


def _other_user_public(user: User) -> dict:
    return {
        "id": user.id,
        "name": user.real_name,
        "username": user.username,
        "team_name": user.team.name if getattr(user, "team", None) else None,
        "receive_messages": user.receive_messages,
        "avatar": user.avatar,
    }


def _to_message(message: DirectMessage, current_user: User) -> dict:
    return {
        "id": message.id,
        "sender_id": message.sender_id,
        "recipient_id": message.recipient_id,
        "body": message.body,
        "created_at": message.created_at,
        "read_at": message.read_at,
        "sender_name": message.sender.real_name if message.sender else None,
        "recipient_name": message.recipient.real_name if message.recipient else None,
        "from_me": message.sender_id == current_user.id,
    }


@router.get("/users/search")
def search_users(
    q: str = "",
    db: Session = Depends(get_db),
    current_user: User = Depends(require_messaging),
):
    query = db.query(User).filter(User.is_active.is_(True), User.id != current_user.id)
    if q.strip():
        like = f"%{q.strip()}%"
        query = query.filter(or_(User.real_name.ilike(like), User.username.ilike(like)))
    return [
        _other_user_public(user)
        for user in query.order_by(User.real_name, User.username).limit(20).all()
    ]


@router.get("/unread")
def unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_messaging),
):
    count = (
        db.query(DirectMessage)
        .filter(DirectMessage.recipient_id == current_user.id, DirectMessage.read_at.is_(None))
        .count()
    )
    return {"count": count}


@router.get("")
def conversations(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_messaging),
):
    messages = (
        db.query(DirectMessage)
        .options(joinedload(DirectMessage.sender), joinedload(DirectMessage.recipient))
        .filter(
            or_(
                DirectMessage.sender_id == current_user.id,
                DirectMessage.recipient_id == current_user.id,
            )
        )
        .order_by(DirectMessage.created_at.desc())
        .all()
    )
    latest: dict[int, DirectMessage] = {}
    unread: dict[int, int] = {}
    for message in messages:
        other_id = message.recipient_id if message.sender_id == current_user.id else message.sender_id
        if other_id not in latest:
            latest[other_id] = message
        if message.recipient_id == current_user.id and message.read_at is None:
            unread[other_id] = unread.get(other_id, 0) + 1
    result = []
    for other_id, last in latest.items():
        other = last.sender if last.sender_id != current_user.id else last.recipient
        result.append({
            "other_user": _other_user_public(other) if other else None,
            "last_message": _to_message(last, current_user),
            "last_message_at": last.created_at,
            "unread_count": unread.get(other_id, 0),
        })
    result.sort(key=lambda item: item["last_message_at"], reverse=True)
    return result


@router.get("/{user_id}")
def thread(
    user_id: int,
    before_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_messaging),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot open a conversation with yourself")
    other = db.get(User, user_id)
    if not other or not other.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    query = (
        db.query(DirectMessage)
        .options(joinedload(DirectMessage.sender), joinedload(DirectMessage.recipient))
        .filter(
            or_(
                and_(DirectMessage.sender_id == current_user.id, DirectMessage.recipient_id == user_id),
                and_(DirectMessage.sender_id == user_id, DirectMessage.recipient_id == current_user.id),
            )
        )
    )
    if before_id is not None:
        query = query.filter(DirectMessage.id < before_id)
    rows = query.order_by(DirectMessage.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    messages = rows[:limit]

    read_at = _now()
    for message in messages:
        if message.recipient_id == current_user.id and message.read_at is None:
            message.read_at = read_at
    db.commit()
    return {
        "messages": [_to_message(message, current_user) for message in reversed(messages)],
        "has_more": has_more,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def send(
    payload: MessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_messaging),
):
    if payload.recipient_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot message yourself")
    recipient = db.get(User, payload.recipient_id)
    if not recipient or not recipient.is_active:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")
    if not recipient.receive_messages and not _can_override(db, current_user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recipient has disabled receiving messages",
        )
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body cannot be empty")

    message = DirectMessage(sender_id=current_user.id, recipient_id=recipient.id, body=body)
    db.add(message)
    db.commit()
    db.refresh(message)
    return _to_message(message, current_user)


@router.post("/{message_id}/read")
def mark_read(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_messaging),
):
    message = db.get(DirectMessage, message_id)
    if not message or message.recipient_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")
    message.read_at = _now()
    db.commit()
    return {"id": message.id, "read_at": message.read_at}
