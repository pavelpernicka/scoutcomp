"""Member evidence (CRM) — part of the core module.

Turns the auth-only ``users`` table into a searchable member directory with
rich contact profiles, parent/guardian relationships, tags, internal notes and
CSV export.  Scoped by the ``core.members.*`` permissions (team scope restricted
to the caller's own/managed teams).
"""
from __future__ import annotations

import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..dependencies import get_current_active_user, get_db, require_action
from ..models import (
    Completion,
    CompletionStatus,
    MemberGender,
    MemberNote,
    MemberProfile,
    MemberRelationship,
    MemberRelationshipType,
    MemberStatus,
    MemberTag,
    ScoutAttendance,
    Team,
    User,
)
from ..permissions import scoped_team_ids

router = APIRouter(prefix="/members", tags=["members"])


# ---------------------------------------------------------------- helpers


def _member_summary(user: User, profile: MemberProfile | None) -> dict:
    return {
        "id": user.id,
        "username": user.username,
        "real_name": user.real_name,
        "email": user.email,
        "avatar": user.avatar,
        "is_active": user.is_active,
        "team_id": user.team_id,
        "team_name": user.team.name if user.team else None,
        "phone": profile.phone if profile else None,
        "birth_date": profile.birth_date.isoformat() if profile and profile.birth_date else None,
        "age": _age(profile.birth_date) if profile and profile.birth_date else None,
        "gender": profile.gender.value if profile and profile.gender else None,
        "member_status": (profile.member_status.value if profile and profile.member_status else MemberStatus.ACTIVE.value),
        "joined_at": profile.joined_at.isoformat() if profile and profile.joined_at else None,
        "uniform_size": profile.uniform_size if profile else None,
        "tags": [tag.tag for tag in user.member_tags],
    }


def _age(birth_date: date | None) -> int | None:
    if not birth_date:
        return None
    today = date.today()
    return today.year - birth_date.year - ((today.month, today.day) < (birth_date.month, birth_date.day))


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


@router.get("/stats")
def member_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.read")),
):
    query = _base_query(db, current_user, eager=False)
    rows = (
        query.outerjoin(MemberProfile, User.id == MemberProfile.user_id)
        .with_entities(MemberProfile.member_status, User.team_id)
        .all()
    )
    total = len(rows)
    by_status: dict[str, int] = {"active": 0, "inactive": 0, "alumni": 0}
    by_team: dict[int, dict] = {}
    for raw_status, team_id in rows:
        status_enum = raw_status if raw_status is not None else MemberStatus.ACTIVE
        key = status_enum.value if status_enum in MemberStatus else "active"
        by_status[key] = by_status.get(key, 0) + 1
        if team_id is not None:
            entry = by_team.setdefault(team_id, {"team_id": team_id, "team_name": None, "count": 0})
            entry["count"] += 1
    for team in db.query(Team).filter(Team.id.in_(by_team.keys()) if by_team else (Team.id == -1)).all():
        if team.id in by_team:
            by_team[team.id]["team_name"] = team.name
    return {
        "total": total,
        "by_status": by_status,
        "by_team": sorted(by_team.values(), key=lambda entry: -entry["count"]),
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
    header = [
        "jmeno", "email", "telefon", "druzina", "status", "datum_narozeni", "vek",
        "pohlavi", "adresa", "mesto", "psc", "rodic_kontakt", "rodic_telefon",
        "nouzovy_kontakt", "nouzovy_telefon", "nastup_od", "velikost_kroje",
        "registracni_cislo", "souhlas_osobni_udaje", "souhlas_foto", "znacky",
    ]
    writer.writerow(header)
    for user in rows:
        p = user.member_profile
        writer.writerow([
            user.real_name,
            user.email or "",
            p.phone if p else "",
            user.team.name if user.team else "",
            (p.member_status.value if p and p.member_status else MemberStatus.ACTIVE.value),
            (p.birth_date.isoformat() if p and p.birth_date else ""),
            _age(p.birth_date) if p and p.birth_date else "",
            (p.gender.value if p and p.gender else ""),
            (p.address if p else ""),
            (p.city if p else ""),
            (p.zip if p else ""),
            (p.parent_name if p else ""),
            (p.parent_phone if p else ""),
            (p.emergency_name if p else ""),
            (p.emergency_phone if p else ""),
            (p.joined_at.isoformat() if p and p.joined_at else ""),
            (p.uniform_size if p else ""),
            (p.scout_number if p else ""),
            (p.data_consent_at.isoformat() if p and p.data_consent_at else ""),
            (p.photo_consent_at.isoformat() if p and p.photo_consent_at else ""),
            ", ".join(tag.tag for tag in user.member_tags),
        ])
    csv_bytes = buffer.getvalue().encode("utf-8-sig")
    return Response(
        content=csv_bytes,
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="clenove.csv"'},
    )


# ---------------------------------------------------------------- detail


def _serialize_relationships(user: User, db: Session) -> list[dict]:
    rels = (
        db.query(MemberRelationship)
        .filter(MemberRelationship.user_id == user.id)
        .options(joinedload(MemberRelationship.related_user).joinedload(User.team))
        .all()
    )
    return [
        {
            "id": rel.id,
            "related_user": {
                "id": rel.related_user.id,
                "real_name": rel.related_user.real_name,
                "team_name": rel.related_user.team.name if rel.related_user.team else None,
            },
            "type": rel.type.value,
            "note": rel.note,
        }
        for rel in rels
    ]


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


def _activity_snapshot(user: User, db: Session) -> dict:
    attendance = (
        db.query(func.count(ScoutAttendance.id))
        .filter(ScoutAttendance.user_id == user.id, ScoutAttendance.mode == "real", ScoutAttendance.status == "present")
        .scalar()
        or 0
    )
    completion_count = (
        db.query(func.count(Completion.id)).filter(
            Completion.member_id == user.id, Completion.status == CompletionStatus.APPROVED
        ).scalar()
        or 0
    )
    total_points = (
        db.query(func.coalesce(func.sum(Completion.points_awarded), 0.0)).filter(
            Completion.member_id == user.id, Completion.status == CompletionStatus.APPROVED
        ).scalar()
        or 0.0
    )
    return {
        "attendance_count": attendance,
        "completion_count": completion_count,
        "total_points": round(total_points, 2),
    }


def _serialize_profile(user: User) -> dict | None:
    p = user.member_profile
    if not p:
        return None
    return {
        "user_id": p.user_id,
        "phone": p.phone,
        "birth_date": p.birth_date.isoformat() if p.birth_date else None,
        "gender": p.gender.value if p.gender else None,
        "address": p.address,
        "city": p.city,
        "zip": p.zip,
        "parent_name": p.parent_name,
        "parent_phone": p.parent_phone,
        "parent_email": p.parent_email,
        "emergency_name": p.emergency_name,
        "emergency_phone": p.emergency_phone,
        "joined_at": p.joined_at.isoformat() if p.joined_at else None,
        "member_status": p.member_status.value,
        "medical_note": p.medical_note,
        "uniform_size": p.uniform_size,
        "scout_number": p.scout_number,
        "data_consent_at": p.data_consent_at.isoformat() if p.data_consent_at else None,
        "photo_consent_at": p.photo_consent_at.isoformat() if p.photo_consent_at else None,
        "notes": p.notes,
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
        "relationships": _serialize_relationships(user, db),
        "notes": _serialize_notes(user, db),
        "activity": _activity_snapshot(user, db),
    }


# ---------------------------------------------------------------- profile


class ProfilePayload(BaseModel):
    phone: str | None = None
    birth_date: date | None = None
    gender: MemberGender | None = None
    address: str | None = None
    city: str | None = None
    zip: str | None = None
    parent_name: str | None = None
    parent_phone: str | None = None
    parent_email: str | None = None
    emergency_name: str | None = None
    emergency_phone: str | None = None
    joined_at: date | None = None
    member_status: MemberStatus | None = None
    medical_note: str | None = None
    uniform_size: str | None = None
    scout_number: str | None = None
    data_consent_at: date | None = None
    photo_consent_at: date | None = None
    notes: str | None = None


def _normalize(payload: ProfilePayload) -> dict:
    values = payload.model_dump(exclude_unset=True)
    for field in ("phone", "parent_phone", "emergency_phone", "address", "city", "zip", "parent_name",
                  "parent_email", "emergency_name", "medical_note", "uniform_size", "scout_number", "notes"):
        if values.get(field) == "":
            values[field] = None
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


# ---------------------------------------------------------------- relationships


class RelationshipPayload(BaseModel):
    related_user_id: int
    type: MemberRelationshipType = MemberRelationshipType.OTHER
    note: str | None = None


@router.post("/{user_id}/relationships")
def add_member_relationship(
    user_id: int,
    payload: RelationshipPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.edit")),
):
    user = _get_user_or_404(db, user_id)
    related = _get_user_or_404(db, payload.related_user_id)
    if related.id == user.id:
        raise HTTPException(422, "Cannot relate a member to themselves")
    team_ids = scoped_team_ids(db, current_user, "core.members.edit")
    if team_ids is not None:
        involved = {user.team_id, related.team_id}
        if involved - team_ids:
            raise HTTPException(404, "Member not found")
    rel = MemberRelationship(user_id=user.id, related_user_id=related.id, type=payload.type, note=payload.note)
    db.add(rel)
    db.commit()
    return {"relationships": _serialize_relationships(user, db)}


@router.delete("/{user_id}/relationships/{rel_id}")
def remove_member_relationship(
    user_id: int,
    rel_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.members.edit")),
):
    user = _get_user_or_404(db, user_id)
    rel = db.query(MemberRelationship).filter(MemberRelationship.id == rel_id, MemberRelationship.user_id == user_id).one_or_none()
    if not rel:
        raise HTTPException(404, "Relationship not found")
    db.delete(rel)
    db.commit()
    return {"relationships": _serialize_relationships(user, db)}


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
