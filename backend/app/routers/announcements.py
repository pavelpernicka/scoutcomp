from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..dependencies import (
    get_current_active_user,
    get_db,
    get_managed_team_ids,
    require_action,
)
from ..models import Announcement, Team, User
from ..permissions import permission_scopes
from ..schemas import (
    AnnouncementCreate,
    AnnouncementPublic,
    AnnouncementUpdate,
)

router = APIRouter(prefix="/announcements", tags=["announcements"])


require_admin_or_group_admin = require_action("competitions.announcements.manage")


def _to_public(announcement: Announcement) -> AnnouncementPublic:
    return AnnouncementPublic(
        id=announcement.id,
        title=announcement.title,
        body=announcement.body,
        team_id=announcement.team_id,
        team_name=announcement.team.name if announcement.team else None,
        created_at=announcement.created_at,
        created_by_id=announcement.created_by_id,
        created_by_username=announcement.creator.username if announcement.creator else None,
    )


def _validate_target_team(db: Session, current_user: User, team_id: Optional[int]) -> Optional[int]:
    if "any" not in permission_scopes(db, current_user, "competitions.announcements.manage"):
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No managed teams configured")
        if team_id is None or team_id not in managed_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Announcements must target one of your teams",
            )

    if team_id is not None:
        team = db.get(Team, team_id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team_id


def _get_manageable_announcement(
    db: Session,
    announcement_id: int,
    current_user: User,
) -> Announcement:
    announcement = (
        db.query(Announcement)
        .options(joinedload(Announcement.team), joinedload(Announcement.creator))
        .filter(Announcement.id == announcement_id)
        .first()
    )
    if not announcement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Announcement not found")

    if "any" not in permission_scopes(db, current_user, "competitions.announcements.manage"):
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids or announcement.team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Announcement outside managed teams")
    return announcement


@router.get("", response_model=List[AnnouncementPublic])
def list_announcements(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[AnnouncementPublic]:
    query = (
        db.query(Announcement)
        .options(joinedload(Announcement.team), joinedload(Announcement.creator))
        .order_by(Announcement.created_at.desc())
    )

    filters = [Announcement.team_id.is_(None)]
    if current_user.team_id is not None:
        filters.append(Announcement.team_id == current_user.team_id)

    announcements = query.filter(or_(*filters)).all()
    return [_to_public(announcement) for announcement in announcements]


@router.get("/manage", response_model=List[AnnouncementPublic])
def list_manageable_announcements(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> List[AnnouncementPublic]:
    query = (
        db.query(Announcement)
        .options(joinedload(Announcement.team), joinedload(Announcement.creator))
        .order_by(Announcement.created_at.desc())
    )

    if "any" not in permission_scopes(db, current_user, "competitions.announcements.manage"):
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids:
            return []
        announcements = query.filter(Announcement.team_id.in_(managed_ids)).all()
    else:
        announcements = query.all()
    return [_to_public(announcement) for announcement in announcements]


@router.post("", response_model=AnnouncementPublic, status_code=status.HTTP_201_CREATED)
def create_announcement(
    payload: AnnouncementCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> AnnouncementPublic:
    body = payload.body.strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Announcement body cannot be empty")

    team_id = _validate_target_team(db, current_user, payload.team_id)

    announcement = Announcement(
        title=payload.title.strip() if payload.title else None,
        body=body,
        team_id=team_id,
        created_by_id=current_user.id,
    )
    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return _to_public(announcement)


@router.delete("/{announcement_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    announcement = _get_manageable_announcement(db, announcement_id, current_user)

    db.delete(announcement)
    db.commit()


@router.patch("/{announcement_id}", response_model=AnnouncementPublic)
def update_announcement(
    announcement_id: int,
    payload: AnnouncementUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> AnnouncementPublic:
    announcement = _get_manageable_announcement(db, announcement_id, current_user)

    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nothing to update")

    if "body" in updates:
        raw_body = updates["body"]
        if raw_body is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Announcement body cannot be empty")
        body = raw_body.strip()
        if not body:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Announcement body cannot be empty")
        announcement.body = body

    if "title" in updates:
        raw_title = updates["title"]
        if raw_title is None:
            announcement.title = None
        else:
            stripped_title = raw_title.strip()
            announcement.title = stripped_title or None

    if "team_id" in updates:
        announcement.team_id = _validate_target_team(db, current_user, updates["team_id"])

    db.add(announcement)
    db.commit()
    db.refresh(announcement)
    return _to_public(announcement)
