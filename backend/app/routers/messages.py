from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, case, func, or_
from sqlalchemy.orm import Session, joinedload

from ..dependencies import get_current_active_user, get_db, require_action
from ..models import DirectMessage, User
from ..permissions import permission_keys
from ..services.web_push import (
    deliver_push_to_user_ids,
    notification_text,
    notification_timestamp,
)

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


def _to_message_preview(message: DirectMessage, current_user: User) -> dict:
    payload = _to_message(message, current_user)
    body = payload["body"]
    payload["body"] = body[:300]
    payload["body_truncated"] = len(body) > 300
    return payload


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
    participant_filter = or_(
        DirectMessage.sender_id == current_user.id,
        DirectMessage.recipient_id == current_user.id,
    )
    other_user_id = case(
        (DirectMessage.sender_id == current_user.id, DirectMessage.recipient_id),
        else_=DirectMessage.sender_id,
    )
    latest_messages = (
        db.query(
            other_user_id.label("other_user_id"),
            func.max(DirectMessage.id).label("last_message_id"),
        )
        .filter(participant_filter)
        .group_by(other_user_id)
        .subquery()
    )
    unread_messages = (
        db.query(
            DirectMessage.sender_id.label("other_user_id"),
            func.count(DirectMessage.id).label("unread_count"),
        )
        .filter(
            DirectMessage.recipient_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .group_by(DirectMessage.sender_id)
        .subquery()
    )
    rows = (
        db.query(DirectMessage, unread_messages.c.unread_count)
        .join(latest_messages, DirectMessage.id == latest_messages.c.last_message_id)
        .outerjoin(
            unread_messages,
            unread_messages.c.other_user_id == latest_messages.c.other_user_id,
        )
        .options(
            joinedload(DirectMessage.sender).joinedload(User.team),
            joinedload(DirectMessage.recipient).joinedload(User.team),
        )
        .order_by(DirectMessage.created_at.desc(), DirectMessage.id.desc())
        .all()
    )

    result = []
    for last, unread_count_value in rows:
        other = last.sender if last.sender_id != current_user.id else last.recipient
        result.append({
            "other_user": _other_user_public(other) if other else None,
            "last_message": _to_message_preview(last, current_user),
            "last_message_at": last.created_at,
            "unread_count": int(unread_count_value or 0),
        })
    return result


@router.get("/{user_id}")
def thread(
    user_id: int,
    before_id: int | None = None,
    after_id: int | None = None,
    known_read_id: int | None = None,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_messaging),
):
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot open a conversation with yourself")
    if before_id is not None and after_id is not None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="before_id and after_id cannot be combined",
        )
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
    if after_id is not None:
        query = query.filter(DirectMessage.id > after_id)
        rows = query.order_by(DirectMessage.id.asc()).limit(limit + 1).all()
    else:
        rows = query.order_by(DirectMessage.id.desc()).limit(limit + 1).all()
    has_more = len(rows) > limit
    messages = rows[:limit]

    read_at = _now()
    read_changed = False
    if before_id is None and after_id is None:
        read_changed = bool(
            db.query(DirectMessage)
            .filter(
                DirectMessage.sender_id == user_id,
                DirectMessage.recipient_id == current_user.id,
                DirectMessage.read_at.is_(None),
            )
            .update({DirectMessage.read_at: read_at}, synchronize_session=False)
        )
        if read_changed:
            for message in messages:
                if message.recipient_id == current_user.id and message.read_at is None:
                    message.read_at = read_at
    else:
        for message in messages:
            if message.recipient_id == current_user.id and message.read_at is None:
                message.read_at = read_at
                read_changed = True
    if read_changed:
        db.commit()

    unread_count_value = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.sender_id == user_id,
            DirectMessage.recipient_id == current_user.id,
            DirectMessage.read_at.is_(None),
        )
        .count()
    )
    read_through = (
        db.query(DirectMessage)
        .filter(
            DirectMessage.sender_id == current_user.id,
            DirectMessage.recipient_id == user_id,
            DirectMessage.read_at.is_not(None),
        )
        .order_by(DirectMessage.id.desc())
        .first()
    )
    ordered_messages = messages if after_id is not None else list(reversed(messages))
    read_receipt_changed = read_through is not None and (
        known_read_id is None or read_through.id > known_read_id
    )
    return {
        "messages": [_to_message(message, current_user) for message in ordered_messages],
        "has_more": has_more,
        "other_user": _other_user_public(other) if after_id is None else None,
        "unread_count": unread_count_value,
        "read_through_id": read_through.id if read_receipt_changed else None,
        "read_through_at": read_through.read_at if read_receipt_changed else None,
    }


@router.post("", status_code=status.HTTP_201_CREATED)
def send(
    payload: MessageCreate,
    background_tasks: BackgroundTasks,
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

    background_tasks.add_task(deliver_push_to_user_ids, {recipient.id}, {
        "title": "Nová zpráva",
        "body": "Máš novou soukromou zprávu.",
        "url": f"/messages?user={current_user.id}&message={message.id}",
        "kind": "message",
        "tag": f"message-thread-{current_user.id}",
        "timestamp": notification_timestamp(message.created_at),
        "actions": [
            {
                "action": "reply",
                "title": "Odpovědět",
                "url": f"/messages?user={current_user.id}&message={message.id}",
            },
            {"action": "overview", "title": "Zprávy", "url": "/messages"},
        ],
        "preview": {
            "title": notification_text(
                f"Zpráva od {current_user.real_name or current_user.username}",
                limit=100,
            ),
            "body": notification_text(body, limit=200),
        },
    })

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
