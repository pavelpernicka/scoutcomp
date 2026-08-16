"""Member evidence (CRM) — part of the core module.

Turns the auth-only ``users`` table into a compact searchable member directory
with membership date/status, tags, internal notes and CSV export. Scoped by the
``core.members.*`` permissions (team scope restricted to the caller's own or
managed teams).
"""
from __future__ import annotations

import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, aliased, joinedload

from ..dependencies import get_current_active_user, get_db, require_action
from ..models import (
    MemberNote,
    MemberProfile,
    MemberStatus,
    MemberTag,
    ScoutAttendance,
    ScoutEvent,
    User,
)
from ..permissions import scoped_team_ids

router = APIRouter(prefix="/members", tags=["members"])


# ---------------------------------------------------------------- helpers


def _member_summary(user: User, profile: MemberProfile | None) -> dict:
    joined_at = profile.joined_at if profile else None
    return {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "team_id": user.team_id,
        "team_name": user.team.name if user.team else None,
        "member_status": (profile.member_status.value if profile and profile.member_status else MemberStatus.ACTIVE.value),
        "joined_at": joined_at.isoformat() if joined_at else None,
        "years_in_group": _years_in_group(joined_at),
        "tags": [tag.tag for tag in user.member_tags],
    }


def _years_in_group(joined_at: date | None) -> int | None:
    if not joined_at:
        return None
    today = date.today()
    return max(0, today.year - joined_at.year - ((today.month, today.day) < (joined_at.month, joined_at.day)))


def _base_query(db: Session, current_user: User, *, eager: bool = True):
    """Users the caller may see (respects team scope for members.read)."""
    query = db.query(User)
    if eager:
        query = query.options(
            joinedload(User.team),
            joinedload(User.member_profile),
            joinedload(User.member_tags),
        )
    team_ids = scoped_team_ids(db, current_user, "core.members.read")
    if team_ids is not None:
        query = query.filter(User.team_id.in_(team_ids) if team_ids else (User.id == -1))
    return query


def _apply_filters(
    query,
    *,
    search: str | None = None,
    team_id: int | None = None,
    status: str | None = None,
    tag: str | None = None,
):
    if search:
        like = f"%{search}%"
        query = query.filter(
            (User.real_name.ilike(like)) | (User.email.ilike(like)) | (User.username.ilike(like))
        )
    if team_id:
        query = query.filter(User.team_id == team_id)
    if status:
        try:
            status_enum = MemberStatus(status)
        except ValueError:
            raise HTTPException(422, "Invalid member status")
        query = query.outerjoin(MemberProfile, User.id == MemberProfile.user_id).filter(
            func.coalesce(MemberProfile.member_status, MemberStatus.ACTIVE) == status_enum
        )
    if tag:
        query = query.filter(User.member_tags.any(MemberTag.tag == tag.lower()))
    return query


def _get_user_or_404(db: Session, user_id: int) -> User:
    user = db.query(User).filter(User.id == user_id).one_or_none()
    if not user:
        raise HTTPException(404, "Member not found")
    return user


# ---------------------------------------------------------------- directory


@router.get("")
@router.get("/")
def list_members(
    search: str | None = None,
    team_id: int | None = None,
    status: str | None = None,
    tag: str | None = None,
    limit: int = Query(200, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.read")),
):
    query = _base_query(db, current_user)
    query = _apply_filters(query, search=search, team_id=team_id, status=status, tag=tag)
    total = query.count()
    items = query.order_by(User.real_name.asc(), User.id.asc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "offset": offset,
        "limit": limit,
        "items": [_member_summary(user, user.member_profile) for user in items],
    }


@router.get("/export.csv")
def export_members_csv(
    search: str | None = None,
    team_id: int | None = None,
    status: str | None = None,
    tag: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.export")),
):
    query = _base_query(db, current_user)
    query = _apply_filters(query, search=search, team_id=team_id, status=status, tag=tag)
    rows = query.order_by(User.real_name.asc()).all()

    buffer = io.StringIO()
    writer = csv.writer(buffer, delimiter=";")
    header = ["jmeno", "email", "druzina", "status", "nastup_od", "let_v_oddile", "znacky"]
    writer.writerow(header)
    for user in rows:
        p = user.member_profile
        writer.writerow([
            user.real_name,
            user.email or "",
            user.team.name if user.team else "",
            (p.member_status.value if p and p.member_status else MemberStatus.ACTIVE.value),
            (p.joined_at.isoformat() if p and p.joined_at else ""),
            _years_in_group(p.joined_at) if p else "",
            ", ".join(tag.tag for tag in user.member_tags),
        ])
    csv_bytes = buffer.getvalue().encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="clenove.csv"'},
    )


# ---------------------------------------------------------------- detail


def _serialize_notes(user: User, db: Session) -> list[dict]:
    notes = db.query(MemberNote).filter(MemberNote.user_id == user.id).order_by(MemberNote.created_at.desc()).all()
    return [
        {
            "id": note.id,
            "content": note.content,
            "author_name": note.author.real_name if note.author else None,
            "created_at": note.created_at.isoformat() if note.created_at else None,
        }
        for note in notes
    ]


def _serialize_profile(user: User) -> dict | None:
    p = user.member_profile
    if not p:
        return None
    return {
        "user_id": p.user_id,
        "joined_at": p.joined_at.isoformat() if p.joined_at else None,
        "member_status": p.member_status.value,
    }


@router.get("/{user_id}")
def get_member_detail(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.read")),
):
    user = db.query(User).options(joinedload(User.team)).filter(User.id == user_id).one_or_none()
    if not user:
        raise HTTPException(404, "Member not found")
    team_ids = scoped_team_ids(db, current_user, "core.members.read")
    if team_ids is not None and (user.team_id is None or user.team_id not in team_ids):
        raise HTTPException(404, "Member not found")
    return {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "team_id": user.team_id,
        "team_name": user.team.name if user.team else None,
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "profile": _serialize_profile(user),
        "tags": [tag.tag for tag in user.member_tags],
        "notes": _serialize_notes(user, db),
    }


@router.get("/{user_id}/attendance")
def list_member_attendance(
    user_id: int,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.read")),
):
    """Paginated real attendance for the compact member detail."""
    user = _get_user_or_404(db, user_id)
    team_ids = scoped_team_ids(db, current_user, "core.members.read")
    if team_ids is not None and (user.team_id is None or user.team_id not in team_ids):
        raise HTTPException(404, "Member not found")
    real = aliased(ScoutAttendance)
    planned = aliased(ScoutAttendance)
    intended_for_member = ScoutEvent.team_id.is_(None)
    if user.team_id is not None:
        intended_for_member = or_(intended_for_member, ScoutEvent.team_id == user.team_id)
    query = (
        db.query(ScoutEvent, real.status.label("real_status"), planned.status.label("planned_status"))
        .outerjoin(real, and_(real.event_id == ScoutEvent.id, real.user_id == user_id, real.mode == "real"))
        .outerjoin(planned, and_(planned.event_id == ScoutEvent.id, planned.user_id == user_id, planned.mode == "planned"))
        .filter(intended_for_member, ScoutEvent.audience == "members")
    )
    total = query.count()
    rows = query.order_by(ScoutEvent.starts_at.desc(), ScoutEvent.id.desc()).offset(offset).limit(limit).all()
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "items": [{
            "event_id": event.id,
            "title": event.title,
            "starts_at": event.starts_at.isoformat() if event.starts_at else None,
            "status": real_status or planned_status or "not_recorded",
            "mode": "real" if real_status else "planned" if planned_status else None,
            "kind": event.kind,
        } for event, real_status, planned_status in rows],
    }


# ---------------------------------------------------------------- profile


class ProfilePayload(BaseModel):
    joined_at: date | None = None
    member_status: MemberStatus | None = None


def _normalize(payload: ProfilePayload) -> dict:
    values = payload.model_dump(exclude_unset=True)
    if "member_status" in values and values.get("member_status") is None:
        values["member_status"] = MemberStatus.ACTIVE
    return values


@router.put("/{user_id}")
def update_member_profile(
    user_id: int,
    payload: ProfilePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.edit")),
):
    user = _get_user_or_404(db, user_id)
    team_ids = scoped_team_ids(db, current_user, "core.members.edit")
    if team_ids is not None and (user.team_id is None or user.team_id not in team_ids):
        raise HTTPException(404, "Member not found")
    profile = db.query(MemberProfile).filter(MemberProfile.user_id == user_id).one_or_none()
    if not profile:
        profile = MemberProfile(user_id=user_id)
        db.add(profile)
    for key, value in _normalize(payload).items():
        setattr(profile, key, value)
    db.commit()
    db.refresh(profile)
    return {"profile": _serialize_profile(user)}


# ---------------------------------------------------------------- tags


class TagPayload(BaseModel):
    tag: str


@router.post("/{user_id}/tags")
def add_member_tag(
    user_id: int,
    payload: TagPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.edit")),
):
    user = _get_user_or_404(db, user_id)
    team_ids = scoped_team_ids(db, current_user, "core.members.edit")
    if team_ids is not None and (user.team_id is None or user.team_id not in team_ids):
        raise HTTPException(404, "Member not found")
    tag = payload.tag.strip().lower()
    if not tag:
        raise HTTPException(422, "Tag must not be empty")
    if len(tag) > 50:
        raise HTTPException(422, "Tag is too long")
    existing = db.query(MemberTag).filter(MemberTag.user_id == user_id, MemberTag.tag == tag).one_or_none()
    if not existing:
        db.add(MemberTag(user_id=user_id, tag=tag))
        db.commit()
    tags = [row.tag for row in db.query(MemberTag).filter(MemberTag.user_id == user_id).order_by(MemberTag.tag).all()]
    return {"tags": tags}


@router.delete("/{user_id}/tags/{tag}")
def remove_member_tag(
    user_id: int,
    tag: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.edit")),
):
    user = _get_user_or_404(db, user_id)
    team_ids = scoped_team_ids(db, current_user, "core.members.edit")
    if team_ids is not None and (user.team_id is None or user.team_id not in team_ids):
        raise HTTPException(404, "Member not found")
    row = db.query(MemberTag).filter(MemberTag.user_id == user_id, MemberTag.tag == tag.lower()).one_or_none()
    if row:
        db.delete(row)
        db.commit()
    tags = [row.tag for row in db.query(MemberTag).filter(MemberTag.user_id == user_id).order_by(MemberTag.tag).all()]
    return {"tags": tags}


# ---------------------------------------------------------------- notes


class NotePayload(BaseModel):
    content: str


@router.post("/{user_id}/notes")
def add_member_note(
    user_id: int,
    payload: NotePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.notes.manage")),
):
    user = _get_user_or_404(db, user_id)
    team_ids = scoped_team_ids(db, current_user, "core.members.notes.manage")
    if team_ids is not None and (user.team_id is None or user.team_id not in team_ids):
        raise HTTPException(404, "Member not found")
    content = (payload.content or "").strip()
    if not content:
        raise HTTPException(422, "Note must not be empty")
    note = MemberNote(user_id=user.id, author_id=current_user.id, content=content)
    db.add(note)
    db.commit()
    return {"notes": _serialize_notes(user, db)}


@router.delete("/{user_id}/notes/{note_id}")
def remove_member_note(
    user_id: int,
    note_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.notes.manage")),
):
    user = _get_user_or_404(db, user_id)
    note = db.query(MemberNote).filter(MemberNote.id == note_id, MemberNote.user_id == user_id).one_or_none()
    if not note:
        raise HTTPException(404, "Note not found")
    if note.author_id != current_user.id and "any" not in scoped_team_ids(db, current_user, "core.members.notes.manage"):
        raise HTTPException(403, "Only the author or a global manager may delete this note")
    db.delete(note)
    db.commit()
    return {"notes": _serialize_notes(user, db)}
