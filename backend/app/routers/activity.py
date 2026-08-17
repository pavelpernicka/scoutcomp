import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import text, func, or_
from sqlalchemy.orm import Session, joinedload, selectinload

from ..dependencies import get_current_active_user, get_db
from ..models import (
    Config,
    DirectMessage,
    DirectUserPermission,
    DirectUserPermissionDeny,
    PermissionDefinition,
    PermissionGroupPermission,
    ScoutAttendance,
    ScoutEvent,
    Team,
    User,
    UserPermissionGroup,
)
from ..permissions import allows, managed_team_ids, permission_keys, permission_scopes

router = APIRouter(prefix="/activity", tags=["scout activity"])
admin_router = APIRouter(prefix="/admin/core/attendance", tags=["admin attendance"])

EVENT_PRESETS_KEY = "event_presets"


def _refresh_public_web_artifacts(db: Session, event: ScoutEvent | None) -> None:
    """Keep static public event/team listings coherent before commit."""
    if event is not None and event.is_public:
        from ..web.pages import rebuild_published_page_artifacts
        rebuild_published_page_artifacts(db)

class EventPayload(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    kind: str = "meeting"
    starts_at: datetime
    ends_at: datetime | None = None
    location: str | None = None
    color: str | None = Field(default=None, min_length=4, max_length=16)
    team_id: int | None = None
    audience: str = "members"  # members | leaders
    requires_planned: bool = False
    planned_deadline: datetime | None = None
    is_public: bool = True

class AttendancePayload(BaseModel):
    user_id: int
    mode: str = "real"  # planned | real
    status: str = "present"
    note: str | None = None

class EventMessagePayload(BaseModel):
    message: str = Field(min_length=1, max_length=5000)

class SelfPlannedPayload(BaseModel):
    status: str = "attending"
    note: str | None = None

class EventPresetPayload(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    name: str = Field(min_length=1, max_length=200)
    kind: str = "meeting"  # meeting | trip | other
    weekday: int = Field(default=4, ge=0, le=6)  # 0=Monday ... 6=Sunday
    start_time: str = Field(default="18:00", pattern=r"^\d{2}:\d{2}$")
    duration_hours: float = Field(default=1.5, gt=0, le=48)
    deadline_days_before: int | None = Field(default=None, ge=0, le=90)
    deadline_time: str = Field(default="20:00", pattern=r"^\d{2}:\d{2}$")
    audience: str = "members"  # members | leaders
    location: str | None = None

def _get_event_presets(db: Session) -> list:
    record = db.query(Config).filter(Config.key == EVENT_PRESETS_KEY).first()
    if not record or not record.value:
        return []
    try:
        data = json.loads(record.value)
        return data if isinstance(data, list) else []
    except (TypeError, ValueError):
        return []

def _set_event_presets(db: Session, presets: list) -> None:
    record = db.query(Config).filter(Config.key == EVENT_PRESETS_KEY).first()
    value = json.dumps(presets, ensure_ascii=False)
    if record:
        record.value = value
    else:
        db.add(Config(key=EVENT_PRESETS_KEY, value=value))
    db.commit()

def _is_leader(db: Session, user: User) -> bool:
    return "core.is_leader" in permission_keys(db, user)


def _leader_user_ids(db: Session, user_ids: list[int]) -> set[int]:
    """Resolve the leader permission for many users without per-user queries."""
    if not user_ids:
        return set()
    permission_id = (
        db.query(PermissionDefinition.id)
        .filter_by(module_code="core", code="is_leader")
        .scalar()
    )
    if permission_id is None:
        return set()

    group_ids = {
        user_id
        for (user_id,) in (
            db.query(UserPermissionGroup.user_id)
            .join(PermissionGroupPermission, PermissionGroupPermission.group_id == UserPermissionGroup.group_id)
            .filter(
                UserPermissionGroup.user_id.in_(user_ids),
                PermissionGroupPermission.permission_id == permission_id,
            )
            .distinct()
            .all()
        )
    }
    direct_ids = {
        user_id
        for (user_id,) in db.query(DirectUserPermission.user_id).filter(
            DirectUserPermission.user_id.in_(user_ids),
            DirectUserPermission.permission_id == permission_id,
        )
    }
    denied_ids = {
        user_id
        for (user_id,) in db.query(DirectUserPermissionDeny.user_id).filter(
            DirectUserPermissionDeny.user_id.in_(user_ids),
            DirectUserPermissionDeny.permission_id == permission_id,
        )
    }
    return (group_ids | direct_ids) - denied_ids

def serialize(event):
    return {"id": event.id, "team_id": event.team_id, "title": event.title, "description": event.description,
            "kind": event.kind, "starts_at": event.starts_at, "ends_at": event.ends_at, "location": event.location,
            "color": event.color, "audience": event.audience, "requires_planned": event.requires_planned,
            "planned_deadline": event.planned_deadline, "is_public": event.is_public,
            "created_by_id": event.created_by_id,
            "team_name": event.team.name if getattr(event, "team", None) else None,
            "attendance": [{"user_id": a.user_id,
                            "user_name": a.user.real_name if a.user else None,
                            "user_group": a.user.permission_groups[0].name if a.user and a.user.permission_groups else None,
                            "mode": a.mode, "status": a.status, "note": a.note, "created_at": a.created_at, "updated_at": a.marked_at} for a in event.attendances]}

@router.get("/events")
def list_events(team_id: int | None = Query(None), db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if not allows(db, current_user, "core.events.read"): raise HTTPException(403, "Missing permission")
    query = db.query(ScoutEvent).options(
        joinedload(ScoutEvent.team),
        selectinload(ScoutEvent.attendances).selectinload(ScoutAttendance.user).selectinload(User.permission_groups),
    )
    if team_id is not None: query = query.filter(ScoutEvent.team_id == team_id)
    elif current_user.team_id: query = query.filter((ScoutEvent.team_id == current_user.team_id) | (ScoutEvent.team_id.is_(None)))
    if not _is_leader(db, current_user):
        query = query.filter(ScoutEvent.audience == "members")
    return [serialize(e) for e in query.order_by(ScoutEvent.starts_at.desc()).all()]


@router.get("/events/options")
def list_event_options(
    q: str = Query("", max_length=120),
    limit: int = Query(20, ge=1, le=50),
    include_id: int | None = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Lightweight event browser for pickers; newest events are returned first."""
    if not allows(db, current_user, "core.events.read"):
        raise HTTPException(403, "Missing permission")
    visible = db.query(ScoutEvent).options(joinedload(ScoutEvent.team))
    if current_user.team_id:
        visible = visible.filter((ScoutEvent.team_id == current_user.team_id) | (ScoutEvent.team_id.is_(None)))
    if not _is_leader(db, current_user):
        visible = visible.filter(ScoutEvent.audience == "members")

    search = q.strip()
    filtered = visible
    if search:
        pattern = f"%{search}%"
        filtered = filtered.filter(or_(ScoutEvent.title.ilike(pattern), ScoutEvent.location.ilike(pattern)))
    events = filtered.order_by(ScoutEvent.starts_at.desc(), ScoutEvent.id.desc()).limit(limit).all()

    if include_id is not None and not any(event.id == include_id for event in events):
        selected = visible.filter(ScoutEvent.id == include_id).one_or_none()
        if selected is not None:
            events.append(selected)

    return {"items": [
        {
            "id": event.id,
            "title": event.title,
            "starts_at": event.starts_at,
            "location": event.location,
        }
        for event in events
    ]}


@router.get("/event-presets")
def list_event_presets(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if not allows(db, current_user, "core.events.read"):
        raise HTTPException(403, "Missing permission")
    return _get_event_presets(db)


@router.put("/event-presets")
def update_event_presets(payload: list[EventPresetPayload], db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    keys = permission_keys(db, current_user)
    if "core.modules.manage" not in keys and "core.events.edit" not in keys:
        raise HTTPException(403, "Missing permission")
    valid_kinds = {"meeting", "trip", "other"}
    valid_audiences = {"members", "leaders"}
    for preset in payload:
        if preset.kind not in valid_kinds:
            raise HTTPException(422, f"Invalid kind: {preset.kind}")
        if preset.audience not in valid_audiences:
            raise HTTPException(422, f"Invalid audience: {preset.audience}")
    _set_event_presets(db, [p.model_dump() for p in payload])
    return _get_event_presets(db)


@router.get("/members")
def list_activity_members(team_id: int | None = Query(None), audience: str = Query("members"), db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if not allows(db, current_user, "core.attendance.manage", team_id=current_user.team_id):
        raise HTTPException(403, "Missing permission")
    query = db.query(User).filter(User.is_active.is_(True))
    if "any" in permission_scopes(db, current_user, "core.attendance.manage"):
        if team_id is not None:
            query = query.filter(User.team_id == team_id)
    else:
        managed_ids = managed_team_ids(current_user)
        if team_id is not None:
            if team_id not in managed_ids:
                raise HTTPException(403, "Team outside managed scope")
            query = query.filter(User.team_id == team_id)
        else:
            query = query.filter(User.team_id.in_(managed_ids)) if managed_ids else query.filter(text("0 = 1"))
    users = query.order_by(User.real_name).all()
    if audience == "leaders":
        users = [user for user in users if _is_leader(db, user)]
    elif team_id is not None:
        users = [user for user in users if not _is_leader(db, user)]
    leader_ids = {user.id for user in users if _is_leader(db, user)}
    return [{"id": user.id, "name": user.real_name, "team_id": user.team_id,
             "is_leader": user.id in leader_ids} for user in users]

@router.post("/events", status_code=status.HTTP_201_CREATED)
def create_event(payload: EventPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if not allows(db, current_user, "core.events.create", team_id=payload.team_id): raise HTTPException(403, "Missing permission")
    if payload.audience == "leaders" and not _is_leader(db, current_user):
        raise HTTPException(403, "Only leaders can create council events")
    event = ScoutEvent(**payload.model_dump(), created_by_id=current_user.id); db.add(event); db.flush(); _refresh_public_web_artifacts(db, event); db.commit(); db.refresh(event); return serialize(event)

@router.put("/events/{event_id}")
def update_event(event_id: int, payload: EventPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    event = db.get(ScoutEvent, event_id)
    if not event: raise HTTPException(404, "Event not found")
    if not allows(db, current_user, "core.events.edit", owner_id=event.created_by_id, team_id=event.team_id): raise HTTPException(403, "Missing permission")
    if payload.audience == "leaders" and not _is_leader(db, current_user):
        raise HTTPException(403, "Only leaders can set council audience")
    was_public = event.is_public
    for key, value in payload.model_dump().items(): setattr(event, key, value)
    if was_public or event.is_public:
        from ..web.pages import rebuild_published_page_artifacts
        rebuild_published_page_artifacts(db)
    db.commit(); return serialize(event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    event = db.get(ScoutEvent, event_id)
    if not event: raise HTTPException(404, "Event not found")
    if not allows(db, current_user, "core.events.delete", owner_id=event.created_by_id, team_id=event.team_id):
        raise HTTPException(403, "Missing permission")
    was_public = event.is_public
    db.delete(event)
    if was_public:
        from ..web.pages import rebuild_published_page_artifacts
        rebuild_published_page_artifacts(db)
    db.commit()

@router.post("/events/{event_id}/attendance")
def set_attendance(event_id: int, payload: AttendancePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    event = db.get(ScoutEvent, event_id)
    if not event or not db.get(User, payload.user_id): raise HTTPException(404, "Event or user not found")
    if not allows(db, current_user, "core.attendance.manage", team_id=event.team_id): raise HTTPException(403, "Missing permission")
    if payload.mode not in ("planned", "real"):
        raise HTTPException(422, "mode must be 'planned' or 'real'")
    entry = db.query(ScoutAttendance).filter_by(event_id=event_id, user_id=payload.user_id, mode=payload.mode).one_or_none()
    if not entry: entry = ScoutAttendance(event_id=event_id, user_id=payload.user_id, mode=payload.mode); db.add(entry)
    entry.status, entry.note, entry.marked_by_id = payload.status, payload.note, current_user.id
    db.commit(); return {"event_id": event_id, "user_id": payload.user_id, "mode": entry.mode, "status": entry.status}

@router.post("/events/{event_id}/planned")
def set_own_planned_attendance(event_id: int, payload: SelfPlannedPayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Members declare their own planned attendance for an event (self sign-up)."""
    event = db.get(ScoutEvent, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if not allows(db, current_user, "core.events.read"):
        raise HTTPException(403, "Missing permission")
    if payload.status not in ("present", "absent", "excused", "attending", "not_attending", "unknown"):
        raise HTTPException(422, "status must be 'present', 'absent', 'excused', 'attending', 'not_attending' or 'unknown'")
    if event.requires_planned and event.planned_deadline:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if now > event.planned_deadline:
            raise HTTPException(400, "Planned attendance deadline has passed")
    entry = db.query(ScoutAttendance).filter_by(event_id=event_id, user_id=current_user.id, mode="planned").one_or_none()
    # "Nevím" is the default, not a second kind of registration or attendance.
    if payload.status == "unknown":
        if entry:
            db.delete(entry)
            db.commit()
        return {"event_id": event_id, "user_id": current_user.id, "mode": "planned", "status": "unknown", "created_at": None, "updated_at": None}
    if not entry:
        entry = ScoutAttendance(event_id=event_id, user_id=current_user.id, mode="planned")
        db.add(entry)
    entry.status, entry.note, entry.marked_by_id = payload.status, payload.note, current_user.id
    db.commit(); db.refresh(entry)
    return {"event_id": event_id, "user_id": current_user.id, "mode": "planned", "status": entry.status, "created_at": entry.created_at, "updated_at": entry.marked_at}

@router.delete("/events/{event_id}/planned")
def unregister_from_planned(event_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    """Members unregister their own planned attendance for an event."""
    event = db.get(ScoutEvent, event_id)
    if not event:
        raise HTTPException(404, "Event not found")
    if not allows(db, current_user, "core.events.read"):
        raise HTTPException(403, "Missing permission")
    entry = db.query(ScoutAttendance).filter_by(event_id=event_id, user_id=current_user.id, mode="planned").one_or_none()
    if not entry:
        raise HTTPException(404, "Planned attendance not found")
    if event.requires_planned and event.planned_deadline:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        if now > event.planned_deadline:
            raise HTTPException(400, "Planned attendance deadline has passed")
    db.delete(entry); db.commit()
    return {"event_id": event_id, "user_id": current_user.id, "unregistered": True}

@router.post("/events/{event_id}/message")
def message_attendees(event_id: int, payload: EventMessagePayload, db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    event = db.get(ScoutEvent, event_id)
    if not event: raise HTTPException(404, "Event not found")
    if not allows(db, current_user, "core.attendance.manage", team_id=event.team_id): raise HTTPException(403, "Missing permission")
    rows = (
        db.query(User, ScoutAttendance.status)
        .join(ScoutAttendance, ScoutAttendance.user_id == User.id)
        .filter(ScoutAttendance.event_id == event_id, ScoutAttendance.mode == "real")
        .all()
    )
    present_users = [user for user, status in rows if status == "present"]
    override = "core.messages.override" in permission_keys(db, current_user)
    body = payload.message.strip()
    if not body:
        raise HTTPException(422, "Message cannot be empty")
    sent = 0
    for user in present_users:
        if not user.is_active:
            continue
        if not user.receive_messages and not override:
            continue
        db.add(DirectMessage(sender_id=current_user.id, recipient_id=user.id, body=body))
        sent += 1
    db.commit()
    return {"sent": sent, "total": len(rows)}


def require_attendance_manage(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)) -> User:
    if not allows(db, current_user, "core.attendance.manage"):
        raise HTTPException(403, "Missing core.attendance.manage")
    return current_user


def serialize_admin_event(event, include_members=False):
    real_count = sum(1 for a in event.attendances if a.mode == "real" and a.status == "present")
    planned_count = sum(1 for a in event.attendances if a.mode == "planned")
    data = {
        "id": event.id,
        "team_id": event.team_id,
        "title": event.title,
        "description": event.description,
        "kind": event.kind,
        "starts_at": event.starts_at,
        "ends_at": event.ends_at,
        "location": event.location,
        "color": event.color,
        "audience": event.audience,
        "requires_planned": event.requires_planned,
        "planned_deadline": event.planned_deadline,
        "created_by_id": event.created_by_id,
        "team_name": event.team.name if getattr(event, "team", None) else None,
        "real_count": real_count,
        "planned_count": planned_count,
        "attendance": [
            {"user_id": a.user_id, "mode": a.mode, "status": a.status, "note": a.note, "created_at": a.created_at, "updated_at": a.marked_at}
            for a in event.attendances
        ],
    }
    if include_members:
        # Include member info for the detail view
        member_ids = [a.user_id for a in event.attendances]
        members = db.query(User).options(joinedload(User.team)).filter(User.id.in_(member_ids)).all() if member_ids else []
        data["members"] = [
            {
                "id": m.id,
                "real_name": m.real_name,
                "team_id": m.team_id,
                "team_name": m.team.name if m.team else None,
                "permission_group": {
                    "name": m.permission_groups[0].name if m.permission_groups else None
                } if m.permission_groups else None,
            }
            for m in members
        ]
    return data


@admin_router.get("/events")
def admin_list_events(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    team_id: int | None = Query(None),
    kind: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    export: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_attendance_manage),
):
    query = db.query(ScoutEvent).options(
        joinedload(ScoutEvent.team),
        joinedload(ScoutEvent.attendances),
    )
    if date_from:
        query = query.filter(ScoutEvent.starts_at >= date_from)
    if date_to:
        query = query.filter(ScoutEvent.starts_at <= date_to)
    if team_id:
        query = query.filter(ScoutEvent.team_id == team_id)
    if kind:
        query = query.filter(ScoutEvent.kind == kind)
    total = query.count()
    events = query.order_by(ScoutEvent.starts_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    if export == "csv":
        import csv
        import io
        from fastapi.responses import StreamingResponse
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Event ID", "Title", "Kind", "Starts At", "Ends At", "Location", "Team", "Real Present", "Planned"])
        for event in events:
            real_count = sum(1 for attendance in event.attendances if attendance.mode == "real" and attendance.status == "present")
            planned_count = sum(1 for attendance in event.attendances if attendance.mode == "planned")
            writer.writerow([
                event.id, event.title, event.kind, event.starts_at, event.ends_at or "",
                event.location or "", event.team.name if event.team else "", real_count, planned_count
            ])
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=attendance.csv"}
        )
    return {"total": total, "events": [serialize_admin_event(e) for e in events]}


@admin_router.get("/events/{event_id}")
def admin_get_event(
    event_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_attendance_manage),
):
    event = db.query(ScoutEvent).options(
        joinedload(ScoutEvent.team),
        joinedload(ScoutEvent.attendances),
    ).filter(ScoutEvent.id == event_id).one_or_none()
    if not event:
        raise HTTPException(404, "Event not found")
    return serialize_admin_event(event, include_members=True)


@admin_router.get("/members/search")
def admin_search_members(
    q: str = Query("", max_length=100),
    db: Session = Depends(get_db),
    _: User = Depends(require_attendance_manage),
):
    """Search active members by name for the attendance member overview."""
    query = db.query(User).options(joinedload(User.team)).filter(User.is_active == True)  # noqa: E712
    if q.strip():
        term = f"%{q.strip()}%"
        query = query.filter(User.real_name.ilike(term))
    users = query.order_by(User.real_name).limit(20).all()
    return [
        {
            "id": u.id,
            "real_name": u.real_name,
            "team_name": u.team.name if u.team else None,
        }
        for u in users
    ]


@admin_router.get("/members/{user_id}")
def admin_member_attendance(
    user_id: int,
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(require_attendance_manage),
):
    """Overview of one member's attendance across events in a date range."""
    user = db.query(User).options(joinedload(User.team)).filter(User.id == user_id).one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    query = (
        db.query(ScoutEvent)
        .options(joinedload(ScoutEvent.team))
        .join(ScoutAttendance, ScoutAttendance.event_id == ScoutEvent.id)
        .filter(ScoutAttendance.user_id == user_id)
        .distinct()
    )
    if date_from:
        query = query.filter(ScoutEvent.starts_at >= date_from)
    if date_to:
        query = query.filter(ScoutEvent.starts_at <= date_to)
    events = query.order_by(ScoutEvent.starts_at.desc()).all()
    attendance_by_event: dict[int, dict[str, ScoutAttendance]] = {}
    if events:
        for attendance in db.query(ScoutAttendance).filter(
            ScoutAttendance.user_id == user_id,
            ScoutAttendance.event_id.in_([event.id for event in events]),
        ):
            attendance_by_event.setdefault(attendance.event_id, {})[attendance.mode] = attendance

    kinds = ("meeting", "trip", "other")
    summary = {k: {"events": 0, "present": 0, "absent": 0, "excused": 0, "attending": 0, "not_attending": 0, "unknown": 0} for k in kinds}
    rows = []
    for event in events:
        atts = attendance_by_event.get(event.id, {})
        real = atts.get("real")
        planned = atts.get("planned")
        row = {
            "event_id": event.id,
            "title": event.title,
            "kind": event.kind,
            "starts_at": event.starts_at,
            "team_name": event.team.name if event.team else None,
            "real_status": real.status if real else None,
            "planned_status": planned.status if planned else None,
            "registered_on": planned.created_at if planned else (real.created_at if real else None),
        }
        rows.append(row)
        kind = event.kind if event.kind in summary else "other"
        summary[kind]["events"] += 1
        if real and real.status in ("present", "absent", "excused"):
            summary[kind][real.status] += 1
        if planned and planned.status in ("attending", "not_attending", "unknown"):
            summary[kind][planned.status] += 1

    return {
        "member": {"id": user.id, "real_name": user.real_name, "team_name": user.team.name if user.team else None},
        "summary": summary,
        "events": rows,
    }


@admin_router.get("/matrix")
def admin_attendance_matrix(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    kind: str | None = Query(None),
    offset: int = Query(0, ge=0),
    limit: int = Query(40, ge=1, le=80),
    db: Session = Depends(get_db),
    _: User = Depends(require_attendance_manage),
):
    """Attendance matrix: events as columns, members grouped by team with per-event real status."""
    event_query = db.query(ScoutEvent)
    if date_from:
        event_query = event_query.filter(ScoutEvent.starts_at >= date_from)
    if date_to:
        event_query = event_query.filter(ScoutEvent.starts_at <= date_to)
    if kind:
        event_query = event_query.filter(ScoutEvent.kind == kind)
    total_events = event_query.count()
    events = event_query.order_by(ScoutEvent.starts_at.desc()).offset(offset).limit(limit).all()

    by_member: dict[int, dict[int, str]] = {}
    if events:
        for user_id, event_id, status in db.query(
            ScoutAttendance.user_id,
            ScoutAttendance.event_id,
            ScoutAttendance.status,
        ).filter(
            ScoutAttendance.event_id.in_([event.id for event in events]),
            ScoutAttendance.mode == "real",
        ):
            by_member.setdefault(user_id, {})[event_id] = status

    users = (
        db.query(User)
        .options(joinedload(User.team))
        .filter(User.is_active.is_(True))
        .order_by(User.real_name)
        .all()
    )
    leader_ids = _leader_user_ids(db, [user.id for user in users])
    users = [user for user in users if user.id not in leader_ids]

    groups: list[dict] = []
    grouped: dict[int | None, list[dict]] = {}
    for user in users:
        key = user.team_id
        grouped.setdefault(key, []).append({
            "id": user.id,
            "real_name": user.real_name,
            "attendance": {str(event_id): status for event_id, status in by_member.get(user.id, {}).items()},
        })
    for key in sorted(grouped, key=lambda k: (k is None, k)):
        team = next((user.team for user in users if user.team_id == key and user.team), None)
        groups.append({
            "team_id": key,
            "name": team.name if team else None,
            "members": grouped[key],
        })

    return {
        "events": [{"id": event.id, "title": event.title, "starts_at": event.starts_at, "kind": event.kind} for event in events],
        "groups": groups,
        "total_events": total_events,
        "has_more": offset + len(events) < total_events,
    }
