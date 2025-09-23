from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..dependencies import (
    get_current_active_user,
    get_db,
    get_managed_team_ids,
    require_admin_or_group_admin,
)
from ..models import DashboardMessage, RoleEnum, Team, User
from ..schemas import (
    DashboardMessageCreate,
    DashboardMessagePublic,
    DashboardMessageUpdate,
)

router = APIRouter(prefix="/dashboard-messages", tags=["dashboard-messages"])


def _to_public(message: DashboardMessage) -> DashboardMessagePublic:
    return DashboardMessagePublic(
        id=message.id,
        title=message.title,
        body=message.body,
        team_id=message.team_id,
        team_name=message.team.name if message.team else None,
        created_at=message.created_at,
        created_by_id=message.created_by_id,
        created_by_username=message.creator.username if message.creator else None,
    )


def _validate_target_team(db: Session, current_user: User, team_id: Optional[int]) -> Optional[int]:
    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No managed teams configured")
        if team_id is None or team_id not in managed_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Group admins must target one of their teams",
            )

    if team_id is not None:
        team = db.get(Team, team_id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team_id


def _get_manageable_message(
    db: Session,
    message_id: int,
    current_user: User,
) -> DashboardMessage:
    message = (
        db.query(DashboardMessage)
        .options(joinedload(DashboardMessage.team), joinedload(DashboardMessage.creator))
        .filter(DashboardMessage.id == message_id)
        .first()
    )
    if not message:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Message not found")

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids or message.team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Message outside managed teams")
    return message


@router.get("", response_model=List[DashboardMessagePublic])
def list_dashboard_messages(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[DashboardMessagePublic]:
    query = (
        db.query(DashboardMessage)
        .options(joinedload(DashboardMessage.team), joinedload(DashboardMessage.creator))
        .order_by(DashboardMessage.created_at.desc())
    )

    filters = [DashboardMessage.team_id.is_(None)]
    if current_user.team_id is not None:
        filters.append(DashboardMessage.team_id == current_user.team_id)

    messages = query.filter(or_(*filters)).all()
    return [_to_public(message) for message in messages]


@router.get("/manage", response_model=List[DashboardMessagePublic])
def list_manageable_dashboard_messages(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> List[DashboardMessagePublic]:
    query = (
        db.query(DashboardMessage)
        .options(joinedload(DashboardMessage.team), joinedload(DashboardMessage.creator))
        .order_by(DashboardMessage.created_at.desc())
    )

    if current_user.role == RoleEnum.ADMIN:
        messages = query.all()
    else:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids:
            return []
        messages = query.filter(DashboardMessage.team_id.in_(managed_ids)).all()
    return [_to_public(message) for message in messages]


@router.post("", response_model=DashboardMessagePublic, status_code=status.HTTP_201_CREATED)
def create_dashboard_message(
    payload: DashboardMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> DashboardMessagePublic:
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body cannot be empty")

    team_id = _validate_target_team(db, current_user, payload.team_id)

    message = DashboardMessage(
        title=payload.title.strip() if payload.title else None,
        body=body,
        team_id=team_id,
        created_by_id=current_user.id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return _to_public(message)


@router.delete("/{message_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dashboard_message(
    message_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    message = _get_manageable_message(db, message_id, current_user)

    db.delete(message)
    db.commit()


@router.patch("/{message_id}", response_model=DashboardMessagePublic)
def update_dashboard_message(
    message_id: int,
    payload: DashboardMessageUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> DashboardMessagePublic:
    message = _get_manageable_message(db, message_id, current_user)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    if "body" in updates:
        raw_body = updates["body"]
        if raw_body is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body cannot be empty")
        body = raw_body.strip()
        if not body:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Message body cannot be empty")
        message.body = body

    if "title" in updates:
        raw_title = updates["title"]
        if raw_title is None:
            message.title = None
        else:
            stripped_title = raw_title.strip()
            message.title = stripped_title or None

    if "team_id" in updates:
        message.team_id = _validate_target_team(db, current_user, updates["team_id"])

    db.add(message)
    db.commit()
    db.refresh(message)
    return _to_public(message)
