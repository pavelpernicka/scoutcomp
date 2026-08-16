from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from ..dependencies import (
    get_current_active_user,
    get_db,
    get_managed_team_ids,
    require_action,
)
from ..models import Notification, User
from ..permissions import permission_scopes
from ..schemas import NotificationCreate, NotificationPublic

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("/", response_model=List[NotificationPublic])
@router.get("", response_model=List[NotificationPublic], include_in_schema=False)
def list_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[Notification]:
    notifications = (
        db.query(Notification)
        .options(joinedload(Notification.sender))
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .all()
    )
    return [
        NotificationPublic(
            id=note.id,
            message=note.message,
            created_at=note.created_at,
            read_at=note.read_at,
            sender_id=note.sender_id,
            sender_username=note.sender.username if note.sender else None,
            sender_real_name=note.sender.real_name if note.sender else None,
        )
        for note in notifications
    ]


@router.post("/read", status_code=status.HTTP_200_OK)
def mark_all_notifications_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    read_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.query(Notification).filter(
        Notification.user_id == current_user.id,
        Notification.read_at.is_(None),
    ).update({Notification.read_at: read_at})
    db.commit()
    return {"ok": True}


@router.post(
    "/users/{user_id}",
    response_model=NotificationPublic,
    status_code=status.HTTP_201_CREATED,
)
def send_notification_to_user(
    user_id: int,
    payload: NotificationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.notifications.send")),
) -> Notification:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if "any" not in permission_scopes(db, current_user, "core.notifications.send"):
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids or user.team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside managed teams")

    notification = Notification(
        user_id=user.id,
        message=payload.message,
        sender_id=current_user.id,
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)

    return NotificationPublic(
        id=notification.id,
        message=notification.message,
        created_at=notification.created_at,
        read_at=notification.read_at,
        sender_id=notification.sender_id,
        sender_username=current_user.username,
        sender_real_name=current_user.real_name,
    )
