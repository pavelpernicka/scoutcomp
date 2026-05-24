from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..dependencies import get_db, require_admin_or_group_admin
from ..models import (
    InventoryCategory,
    InventoryEvent,
    InventoryEventItem,
    InventoryLocation,
    InventoryEventScan,
    InventoryFlag,
    InventoryHistoryAction,
    InventoryItem,
    InventoryEventStatus,
    InventoryItemStatus,
    InventoryLabelTemplate,
    InventoryLoan,
    InventoryPhoto,
    User,
)
from ..schemas import (
    InventoryEventCreate,
    InventoryEventDetail,
    InventoryEventItemAssign,
    InventoryEventItemReturn,
    InventoryCategoryCreate,
    InventoryCategoryPublic,
    InventoryCategoryUpdate,
    InventoryFlagCreate,
    InventoryFlagPublic,
    InventoryFlagUpdate,
    InventoryBulkUpdateRequest,
    InventoryLocationCreate,
    InventoryLocationPublic,
    InventoryLocationUpdate,
    InventoryEventPublic,
    InventoryEventScanRequest,
    InventoryEventUpdate,
    InventoryItemCreate,
    InventoryItemPublic,
    InventoryItemUpdate,
    InventoryLabelTemplateCreate,
    InventoryLabelTemplatePublic,
    InventoryLabelTemplateUpdate,
    InventoryLabelsPreviewRequest,
    InventoryLabelsPreviewResponse,
    InventoryLoanCreate,
    InventoryLoanPublic,
    InventoryLoanReturn,
    InventoryOverviewResponse,
    InventoryPhotoCreate,
)
from .service import (
    ACTIVE_EVENT_STATUSES,
    ensure_team_exists_and_allowed,
    generate_qr_identifier,
    get_available_quantity,
    get_event_or_404,
    get_item_or_404,
    get_category_or_404,
    get_flag_or_404,
    get_location_or_404,
    get_scoped_events,
    get_scoped_categories,
    get_scoped_flags,
    get_scoped_items,
    get_scoped_locations,
    get_scoped_templates,
    get_template_or_404,
    normalize_scan_condition,
    record_history,
    build_location_path,
    serialize_event,
    serialize_event_detail,
    serialize_categories,
    serialize_flags,
    serialize_item,
    serialize_items,
    serialize_locations,
    serialize_template,
    serialize_templates,
    touch_updated_location,
    update_item_status_history,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


def sync_system_quantity_flag(db: Session, item: InventoryItem) -> None:
    sold_out_flag = next(
        (
            flag for flag in db.query(InventoryFlag)
            .filter(InventoryFlag.team_id == item.team_id, InventoryFlag.is_system.is_(True))
            .all()
            if flag.name and flag.name.strip().lower() == "došlo"
        ),
        None,
    )
    if item.quantity <= 0:
        if sold_out_flag:
            item.flag_id = sold_out_flag.id
        item.status = InventoryItemStatus.MISSING
        return
    if sold_out_flag and item.flag_id == sold_out_flag.id:
        item.flag_id = None
    if item.status == InventoryItemStatus.MISSING:
        item.status = InventoryItemStatus.AVAILABLE


@router.get("/overview", response_model=InventoryOverviewResponse)
def get_overview(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryOverviewResponse:
    return InventoryOverviewResponse(
        items=serialize_items(get_scoped_items(db, current_user, team_id)),
        events=[serialize_event(event) for event in get_scoped_events(db, current_user, team_id)],
        label_templates=serialize_templates(get_scoped_templates(db, current_user, team_id)),
        locations=serialize_locations(get_scoped_locations(db, current_user, team_id)),
        categories=serialize_categories(get_scoped_categories(db, current_user, team_id)),
        flags=serialize_flags(get_scoped_flags(db, current_user, team_id)),
    )


@router.get("/items", response_model=list[InventoryItemPublic])
def list_items(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryItemPublic]:
    return serialize_items(get_scoped_items(db, current_user, team_id))


@router.post("/items/bulk", response_model=list[InventoryItemPublic])
def bulk_update_items(
    payload: InventoryBulkUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryItemPublic]:
    items = [get_item_or_404(db, current_user, item_id) for item_id in payload.item_ids]
    event = get_event_or_404(db, current_user, payload.assign_event_id) if payload.assign_event_id else None
    flag = get_flag_or_404(db, current_user, payload.set_flag_id) if payload.set_flag_id else None
    fields_set = payload.model_fields_set

    for item in items:
        if flag and item.team_id != flag.team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Flag must belong to the same team as the item")
        if payload.set_status is not None:
            previous_status = item.status
            item.status = payload.set_status
            update_item_status_history(db, item=item, actor=current_user, previous_status=previous_status)
        if "set_default_location" in fields_set:
            old_location = item.default_location
            item.default_location = payload.set_default_location
            record_history(
                db,
                item=item,
                actor=current_user,
                action=InventoryHistoryAction.LOCATION_CHANGED,
                payload={"from": old_location, "to": item.default_location, "scope": "default_location"},
            )
        if "set_current_location" in fields_set:
            old_location = item.current_location
            item.current_location = payload.set_current_location if payload.set_current_location is not None else item.default_location
            record_history(
                db,
                item=item,
                actor=current_user,
                action=InventoryHistoryAction.LOCATION_CHANGED,
                payload={"from": old_location, "to": item.current_location, "scope": "current_location"},
            )
        if "set_category" in fields_set:
            old_category = item.category
            item.category = payload.set_category
            record_history(
                db,
                item=item,
                actor=current_user,
                action=InventoryHistoryAction.UPDATED,
                payload={"category": {"from": old_category, "to": item.category}},
            )
        if "set_flag_id" in fields_set:
            old_flag = item.flag.name if item.flag else None
            item.flag_id = flag.id if flag else None
            db.flush()
            record_history(
                db,
                item=item,
                actor=current_user,
                action=InventoryHistoryAction.UPDATED,
                payload={"flag": {"from": old_flag, "to": item.flag.name if item.flag else None}},
            )
        if event:
            if item.team_id != event.team_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item and event must belong to the same team")
            existing = next((value for value in event.items if value.item_id == item.id), None)
            if existing:
                existing.planned_quantity = payload.assign_event_quantity
            else:
                db.add(InventoryEventItem(event=event, item=item, planned_quantity=payload.assign_event_quantity))
            item.current_location = f"Akce: {event.name}"
            record_history(
                db,
                item=item,
                actor=current_user,
                action=InventoryHistoryAction.EVENT_ASSIGNED,
                payload={"event_id": event.id, "event_name": event.name, "planned_quantity": payload.assign_event_quantity},
                event=event,
            )
        db.add(item)

    db.commit()
    return [serialize_item(get_item_or_404(db, current_user, item.id)) for item in items]


@router.post("/items", response_model=InventoryItemPublic, status_code=status.HTTP_201_CREATED)
def create_item(
    payload: InventoryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    ensure_team_exists_and_allowed(db, current_user, payload.team_id)
    if payload.flag_id is not None:
        flag = get_flag_or_404(db, current_user, payload.flag_id)
        if flag.team_id != payload.team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Flag must belong to the same team")
    item = InventoryItem(
        team_id=payload.team_id,
        name=payload.name,
        description=payload.description,
        category=payload.category,
        flag_id=payload.flag_id,
        quantity=payload.quantity,
        quantity_unit=payload.quantity_unit,
        default_location=payload.default_location,
        current_location=payload.current_location or payload.default_location,
        status=payload.status,
        notes=payload.notes,
        qr_identifier=generate_qr_identifier(db),
    )
    sync_system_quantity_flag(db, item)
    db.add(item)
    db.flush()
    for index, photo in enumerate(payload.photos):
        db.add(InventoryPhoto(item=item, image_url=photo.image_url, caption=photo.caption, position=index))
    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.CREATED,
        payload={"name": item.name, "quantity": item.quantity, "qr_identifier": item.qr_identifier},
    )
    db.commit()
    return serialize_item(get_item_or_404(db, current_user, item.id))


@router.get("/items/{item_id}", response_model=InventoryItemPublic)
def get_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    return serialize_item(get_item_or_404(db, current_user, item_id))


@router.patch("/items/{item_id}", response_model=InventoryItemPublic)
def update_item(
    item_id: int,
    payload: InventoryItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    item = get_item_or_404(db, current_user, item_id)
    previous_status = item.status
    previous_location = item.current_location
    changes = {}
    if "flag_id" in payload.model_fields_set:
        if payload.flag_id is not None:
            flag = get_flag_or_404(db, current_user, payload.flag_id)
            if flag.team_id != item.team_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Flag must belong to the same team")
        changes["flag_id"] = {"from": item.flag_id, "to": payload.flag_id}
        item.flag_id = payload.flag_id

    if payload.team_id is not None and payload.team_id != item.team_id:
        ensure_team_exists_and_allowed(db, current_user, payload.team_id)
        changes["team_id"] = {"from": item.team_id, "to": payload.team_id}
        item.team_id = payload.team_id
    for field in ["name", "description", "category", "quantity", "quantity_unit", "default_location", "current_location", "status", "notes"]:
        value = getattr(payload, field)
        if value is not None and value != getattr(item, field):
            changes[field] = {"from": getattr(item, field), "to": value}
            setattr(item, field, value)

    sync_system_quantity_flag(db, item)

    touch_updated_location(item)
    if changes:
        record_history(db, item=item, actor=current_user, action=InventoryHistoryAction.UPDATED, payload=changes)
    if previous_location != item.current_location:
        record_history(
            db,
            item=item,
            actor=current_user,
            action=InventoryHistoryAction.LOCATION_CHANGED,
            payload={"from": previous_location, "to": item.current_location},
        )
    update_item_status_history(db, item=item, actor=current_user, previous_status=previous_status)
    db.add(item)
    db.commit()
    return serialize_item(get_item_or_404(db, current_user, item.id))


@router.post("/items/{item_id}/photos", response_model=InventoryItemPublic)
def add_photo(
    item_id: int,
    payload: InventoryPhotoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    item = get_item_or_404(db, current_user, item_id)
    photo = InventoryPhoto(item=item, image_url=payload.image_url, caption=payload.caption, position=len(item.photos))
    db.add(photo)
    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.PHOTO_ADDED,
        payload={"image_url": payload.image_url, "caption": payload.caption},
    )
    db.commit()
    return serialize_item(get_item_or_404(db, current_user, item_id))


@router.delete("/photos/{photo_id}", response_model=InventoryItemPublic)
def delete_photo(
    photo_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    photo = db.get(InventoryPhoto, photo_id)
    if not photo:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Photo not found")
    item = get_item_or_404(db, current_user, photo.item_id)
    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.PHOTO_REMOVED,
        payload={"image_url": photo.image_url, "caption": photo.caption},
    )
    db.delete(photo)
    db.commit()
    return serialize_item(get_item_or_404(db, current_user, item.id))


@router.post("/items/{item_id}/loans", response_model=InventoryItemPublic, status_code=status.HTTP_201_CREATED)
def create_loan(
    item_id: int,
    payload: InventoryLoanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    item = get_item_or_404(db, current_user, item_id)
    if payload.quantity > get_available_quantity(item):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough available quantity")
    loan = InventoryLoan(
        item=item,
        borrower_name=payload.borrower_name,
        borrowed_at=payload.borrowed_at or datetime.utcnow(),
        due_at=payload.due_at,
        quantity=payload.quantity,
        note=payload.note,
    )
    db.add(loan)
    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.LOANED,
        payload={"borrower_name": loan.borrower_name, "quantity": loan.quantity, "due_at": loan.due_at.isoformat() if loan.due_at else None},
    )
    db.commit()
    return serialize_item(get_item_or_404(db, current_user, item.id))


@router.post("/loans/{loan_id}/return", response_model=InventoryItemPublic)
def return_loan(
    loan_id: int,
    payload: InventoryLoanReturn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    loan = db.get(InventoryLoan, loan_id)
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    item = get_item_or_404(db, current_user, loan.item_id)
    if loan.returned_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Loan already returned")
    loan.returned_at = payload.returned_at or datetime.utcnow()
    if payload.note:
        loan.note = payload.note
    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.RETURNED,
        payload={"loan_id": loan.id, "returned_at": loan.returned_at.isoformat(), "quantity": loan.quantity},
    )
    db.add(loan)
    db.commit()
    return serialize_item(get_item_or_404(db, current_user, item.id))


@router.get("/events", response_model=list[InventoryEventPublic])
def list_events(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryEventPublic]:
    return [serialize_event(event) for event in get_scoped_events(db, current_user, team_id)]


@router.post("/events", response_model=InventoryEventPublic, status_code=status.HTTP_201_CREATED)
def create_event(
    payload: InventoryEventCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryEventPublic:
    ensure_team_exists_and_allowed(db, current_user, payload.team_id)
    event = InventoryEvent(**payload.model_dump())
    db.add(event)
    db.commit()
    db.refresh(event)
    return serialize_event(get_event_or_404(db, current_user, event.id))


@router.patch("/events/{event_id}", response_model=InventoryEventPublic)
def update_event(
    event_id: int,
    payload: InventoryEventUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryEventPublic:
    event = get_event_or_404(db, current_user, event_id)
    data = payload.model_dump(exclude_unset=True)
    if "team_id" in data:
        ensure_team_exists_and_allowed(db, current_user, data["team_id"])
    for key, value in data.items():
        setattr(event, key, value)
    db.add(event)
    db.commit()
    return serialize_event(get_event_or_404(db, current_user, event.id))


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    event = get_event_or_404(db, current_user, event_id)

    # Check if there are any items that haven't been fully returned
    unreturned_items = [
        item for item in event.items
        if (item.planned_quantity or 0) > (item.returned_quantity or 0)
    ]

    if unreturned_items:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Event still contains unreturned items. Return or remove them first.",
        )
    db.delete(event)
    db.commit()


@router.get("/events/{event_id}", response_model=InventoryEventDetail)
def get_event_detail(
    event_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryEventDetail:
    return serialize_event_detail(get_event_or_404(db, current_user, event_id))


@router.post("/events/{event_id}/items", response_model=InventoryEventDetail)
def assign_item_to_event(
    event_id: int,
    payload: InventoryEventItemAssign,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryEventDetail:
    event = get_event_or_404(db, current_user, event_id)
    item = get_item_or_404(db, current_user, payload.item_id)
    if item.team_id != event.team_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Item and event must belong to the same team")
    existing = next((value for value in event.items if value.item_id == item.id), None)
    current_reserved_here = existing.planned_quantity if existing else 0
    if payload.planned_quantity > get_available_quantity(item) + current_reserved_here:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Planned quantity exceeds item quantity")

    if existing:
        existing.planned_quantity = payload.planned_quantity
        existing.note = payload.note
    else:
        existing = InventoryEventItem(event=event, item=item, planned_quantity=payload.planned_quantity, note=payload.note)
        db.add(existing)
    if event.status == InventoryEventStatus.PLANNED:
        event.status = InventoryEventStatus.ACTIVE
    item.current_location = f"Akce: {event.name}"
    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.EVENT_ASSIGNED,
        payload={"event_id": event.id, "event_name": event.name, "planned_quantity": payload.planned_quantity},
        event=event,
    )
    db.commit()
    return serialize_event_detail(get_event_or_404(db, current_user, event.id))


@router.delete("/events/{event_id}/items/{event_item_id}", response_model=InventoryEventDetail)
def remove_item_from_event(
    event_id: int,
    event_item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryEventDetail:
    event = get_event_or_404(db, current_user, event_id)
    assignment = next((value for value in event.items if value.id == event_item_id), None)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event assignment not found")
    item = assignment.item
    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.EVENT_RETURNED,
        payload={"event_id": event.id, "event_name": event.name, "returned_quantity": assignment.returned_quantity},
        event=event,
    )
    if item.current_location == f"Akce: {event.name}":
        item.current_location = item.default_location
    db.delete(assignment)
    db.commit()
    return serialize_event_detail(get_event_or_404(db, current_user, event.id))


@router.post("/events/{event_id}/items/{event_item_id}/return", response_model=InventoryEventDetail)
def return_event_item(
    event_id: int,
    event_item_id: int,
    payload: InventoryEventItemReturn,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryEventDetail:
    event = get_event_or_404(db, current_user, event_id)
    assignment = next((value for value in event.items if value.id == event_item_id), None)
    if not assignment:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Event assignment not found")

    remaining_quantity = max(assignment.planned_quantity - assignment.returned_quantity, 0)
    if payload.quantity > remaining_quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Returned quantity exceeds remaining quantity")

    item = assignment.item
    condition = normalize_scan_condition(payload.condition) or "ok"
    assignment.returned_quantity += payload.quantity
    if condition == "damaged":
        assignment.damaged_quantity += payload.quantity
        item.status = InventoryItemStatus.DAMAGED

    if payload.current_location:
        item.current_location = payload.current_location
    elif assignment.returned_quantity >= assignment.planned_quantity and item.current_location == f"Akce: {event.name}":
        item.current_location = item.default_location

    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.EVENT_RETURNED,
        payload={
            "event_id": event.id,
            "event_name": event.name,
            "returned_quantity": payload.quantity,
            "condition": condition,
            "current_location": item.current_location,
            "note": payload.note,
        },
        event=event,
    )
    db.add(assignment)
    db.add(item)
    db.commit()
    return serialize_event_detail(get_event_or_404(db, current_user, event.id))


@router.post("/events/{event_id}/scan-return", response_model=InventoryEventDetail)
def scan_return(
    event_id: int,
    payload: InventoryEventScanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryEventDetail:
    event = get_event_or_404(db, current_user, event_id)
    item = (
        db.query(InventoryItem)
        .filter(InventoryItem.qr_identifier == payload.qr_identifier)
        .first()
    )
    condition = normalize_scan_condition(payload.condition)
    if item and item.team_id != event.team_id:
        item = None

    assignment = None
    if item:
        assignment = next((value for value in event.items if value.item_id == item.id), None)

    if assignment:
        if assignment.returned_quantity < assignment.planned_quantity:
            assignment.returned_quantity += 1
        if condition == "damaged":
            assignment.damaged_quantity += 1
            item.status = InventoryItemStatus.DAMAGED
        if assignment.returned_quantity >= assignment.planned_quantity:
            item.current_location = item.default_location
        result = "returned"
        record_history(
            db,
            item=item,
            actor=current_user,
            action=InventoryHistoryAction.QR_SCANNED,
            payload={"mode": "event_return", "event_id": event.id, "result": result, "condition": condition},
            event=event,
        )
        record_history(
            db,
            item=item,
            actor=current_user,
            action=InventoryHistoryAction.EVENT_RETURNED,
            payload={"event_id": event.id, "event_name": event.name, "returned_quantity": assignment.returned_quantity},
            event=event,
        )
    else:
        result = "extra"

    scan = InventoryEventScan(
        event=event,
        item=item,
        actor=current_user,
        qr_identifier=payload.qr_identifier,
        result=result,
        condition=condition,
        note=payload.note,
    )
    db.add(scan)
    db.commit()
    return serialize_event_detail(get_event_or_404(db, current_user, event.id))


@router.get("/qr/{qr_identifier}", response_model=InventoryItemPublic)
def get_item_by_qr(
    qr_identifier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    item = (
        get_scoped_items(db, current_user)
    )
    match = next((value for value in item if value.qr_identifier == qr_identifier), None)
    if not match:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    record_history(
        db,
        item=match,
        actor=current_user,
        action=InventoryHistoryAction.QR_SCANNED,
        payload={"mode": "detail"},
    )
    db.commit()
    return serialize_item(get_item_or_404(db, current_user, match.id))


@router.get("/label-templates", response_model=list[InventoryLabelTemplatePublic])
def list_label_templates(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryLabelTemplatePublic]:
    return serialize_templates(get_scoped_templates(db, current_user, team_id))


@router.post("/label-templates", response_model=InventoryLabelTemplatePublic, status_code=status.HTTP_201_CREATED)
def create_label_template(
    payload: InventoryLabelTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryLabelTemplatePublic:
    ensure_team_exists_and_allowed(db, current_user, payload.team_id)
    template = InventoryLabelTemplate(**payload.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return serialize_template(get_template_or_404(db, current_user, template.id))


@router.patch("/label-templates/{template_id}", response_model=InventoryLabelTemplatePublic)
def update_label_template(
    template_id: int,
    payload: InventoryLabelTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryLabelTemplatePublic:
    template = get_template_or_404(db, current_user, template_id)
    data = payload.model_dump(exclude_unset=True)
    if "team_id" in data:
        ensure_team_exists_and_allowed(db, current_user, data["team_id"])
    for key, value in data.items():
        setattr(template, key, value)
    db.add(template)
    db.commit()
    return serialize_template(get_template_or_404(db, current_user, template.id))


@router.post("/labels/preview", response_model=InventoryLabelsPreviewResponse)
def preview_labels(
    payload: InventoryLabelsPreviewRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryLabelsPreviewResponse:
    template = get_template_or_404(db, current_user, payload.template_id)
    items = [get_item_or_404(db, current_user, item_id) for item_id in payload.item_ids]
    return InventoryLabelsPreviewResponse(template=serialize_template(template), items=serialize_items(items))


@router.get("/locations", response_model=list[InventoryLocationPublic])
def list_locations(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryLocationPublic]:
    return serialize_locations(get_scoped_locations(db, current_user, team_id))


@router.post("/locations", response_model=InventoryLocationPublic, status_code=status.HTTP_201_CREATED)
def create_location(
    payload: InventoryLocationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryLocationPublic:
    ensure_team_exists_and_allowed(db, current_user, payload.team_id)
    parent = None
    if payload.parent_id is not None:
        parent = get_location_or_404(db, current_user, payload.parent_id)
        if parent.team_id != payload.team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent location must belong to the same team")
    location = InventoryLocation(
        team_id=payload.team_id,
        parent_id=payload.parent_id,
        name=payload.name,
        description=payload.description,
        path=build_location_path(payload.name, parent),
        sort_order=payload.sort_order,
    )
    db.add(location)
    db.commit()
    return serialize_locations([get_location_or_404(db, current_user, location.id)])[0]


@router.patch("/locations/{location_id}", response_model=InventoryLocationPublic)
def update_location(
    location_id: int,
    payload: InventoryLocationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryLocationPublic:
    location = get_location_or_404(db, current_user, location_id)
    old_path = location.path
    data = payload.model_dump(exclude_unset=True)
    next_team_id = data.get("team_id", location.team_id)
    ensure_team_exists_and_allowed(db, current_user, next_team_id)

    parent = location.parent
    if "parent_id" in data:
        parent = get_location_or_404(db, current_user, data["parent_id"]) if data["parent_id"] is not None else None
        if parent and parent.id == location.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Location cannot be its own parent")
        if parent and parent.team_id != next_team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent location must belong to the same team")

    location.team_id = next_team_id
    if "parent_id" in data:
        location.parent_id = data["parent_id"]
    if "name" in data:
        location.name = data["name"]
    if "description" in data:
        location.description = data["description"]
    if "sort_order" in data:
        location.sort_order = data["sort_order"]
    location.path = build_location_path(location.name, parent)

    descendants = (
        db.query(InventoryLocation)
        .filter(InventoryLocation.path.like(f"{old_path} / %"))
        .all()
    )
    for descendant in descendants:
        suffix = descendant.path[len(old_path):]
        descendant.path = f"{location.path}{suffix}"
        db.add(descendant)

    db.add(location)
    db.commit()
    return serialize_locations([get_location_or_404(db, current_user, location.id)])[0]


@router.delete("/locations/{location_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    location_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    location = get_location_or_404(db, current_user, location_id)
    if location.children:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delete child locations first")
    db.delete(location)
    db.commit()


@router.get("/categories", response_model=list[InventoryCategoryPublic])
def list_categories(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryCategoryPublic]:
    return serialize_categories(get_scoped_categories(db, current_user, team_id))


@router.post("/categories", response_model=InventoryCategoryPublic, status_code=status.HTTP_201_CREATED)
def create_category(
    payload: InventoryCategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryCategoryPublic:
    ensure_team_exists_and_allowed(db, current_user, payload.team_id)
    parent = None
    if payload.parent_id is not None:
        parent = get_category_or_404(db, current_user, payload.parent_id)
        if parent.team_id != payload.team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent category must belong to the same team")
    category = InventoryCategory(
        team_id=payload.team_id,
        parent_id=payload.parent_id,
        name=payload.name,
        description=payload.description,
        path=build_location_path(payload.name, parent),
        color=payload.color,
        sort_order=payload.sort_order,
    )
    db.add(category)
    db.commit()
    return serialize_categories([get_category_or_404(db, current_user, category.id)])[0]


@router.patch("/categories/{category_id}", response_model=InventoryCategoryPublic)
def update_category(
    category_id: int,
    payload: InventoryCategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryCategoryPublic:
    category = get_category_or_404(db, current_user, category_id)
    old_path = category.path
    data = payload.model_dump(exclude_unset=True)
    next_team_id = data.get("team_id", category.team_id)
    ensure_team_exists_and_allowed(db, current_user, next_team_id)

    parent = category.parent
    if "parent_id" in data:
        parent = get_category_or_404(db, current_user, data["parent_id"]) if data["parent_id"] is not None else None
        if parent and parent.id == category.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Category cannot be its own parent")
        if parent and parent.team_id != next_team_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Parent category must belong to the same team")

    category.team_id = next_team_id
    if "parent_id" in data:
        category.parent_id = data["parent_id"]
    if "name" in data:
        category.name = data["name"]
    if "color" in data:
        category.color = data["color"]
    if "sort_order" in data:
        category.sort_order = data["sort_order"]
    category.path = build_location_path(category.name, parent)

    descendants = db.query(InventoryCategory).filter(InventoryCategory.path.like(f"{old_path} / %")).all()
    for descendant in descendants:
        suffix = descendant.path[len(old_path):]
        descendant.path = f"{category.path}{suffix}"
        db.add(descendant)

    db.add(category)
    db.commit()
    return serialize_categories([get_category_or_404(db, current_user, category.id)])[0]


@router.delete("/categories/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    category = get_category_or_404(db, current_user, category_id)
    if category.children:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delete child categories first")
    db.delete(category)
    db.commit()


@router.get("/flags", response_model=list[InventoryFlagPublic])
def list_flags(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryFlagPublic]:
    return serialize_flags(get_scoped_flags(db, current_user, team_id))


@router.post("/flags", response_model=InventoryFlagPublic, status_code=status.HTTP_201_CREATED)
def create_flag(
    payload: InventoryFlagCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryFlagPublic:
    ensure_team_exists_and_allowed(db, current_user, payload.team_id)
    flag = InventoryFlag(**payload.model_dump(), is_system=False)
    db.add(flag)
    db.commit()
    db.refresh(flag)
    return InventoryFlagPublic.model_validate(get_flag_or_404(db, current_user, flag.id))


@router.patch("/flags/{flag_id}", response_model=InventoryFlagPublic)
def update_flag(
    flag_id: int,
    payload: InventoryFlagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryFlagPublic:
    flag = get_flag_or_404(db, current_user, flag_id)
    if flag.is_system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System flag cannot be edited")
    data = payload.model_dump(exclude_unset=True)
    if "team_id" in data:
        ensure_team_exists_and_allowed(db, current_user, data["team_id"])
    for key, value in data.items():
        setattr(flag, key, value)
    db.add(flag)
    db.commit()
    return InventoryFlagPublic.model_validate(get_flag_or_404(db, current_user, flag.id))


@router.delete("/flags/{flag_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_flag(
    flag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    flag = get_flag_or_404(db, current_user, flag_id)
    if flag.is_system:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="System flag cannot be deleted")
    db.query(InventoryItem).filter(InventoryItem.flag_id == flag.id).update({"flag_id": None})
    db.delete(flag)
    db.commit()


# Label Template endpoints
@router.get("/label-templates", response_model=list[InventoryLabelTemplatePublic])
def list_label_templates(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryLabelTemplatePublic]:
    return serialize_templates(get_scoped_templates(db, current_user, team_id))


@router.post("/label-templates", response_model=InventoryLabelTemplatePublic, status_code=status.HTTP_201_CREATED)
def create_label_template(
    payload: InventoryLabelTemplateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryLabelTemplatePublic:
    ensure_team_exists_and_allowed(db, current_user, payload.team_id)
    template = InventoryLabelTemplate(**payload.model_dump())
    db.add(template)
    db.commit()
    db.refresh(template)
    return serialize_template(template)


@router.patch("/label-templates/{template_id}", response_model=InventoryLabelTemplatePublic)
def update_label_template(
    template_id: int,
    payload: InventoryLabelTemplateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryLabelTemplatePublic:
    template = get_template_or_404(db, current_user, template_id)
    data = payload.model_dump(exclude_unset=True)
    if "team_id" in data:
        ensure_team_exists_and_allowed(db, current_user, data["team_id"])
    for key, value in data.items():
        setattr(template, key, value)
    db.add(template)
    db.commit()
    return serialize_template(template)


@router.delete("/label-templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_label_template(
    template_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    template = get_template_or_404(db, current_user, template_id)
    db.delete(template)
    db.commit()


@router.post("/labels/preview")
def preview_labels(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
):
    try:
        template_id = payload.get("template_id")
        latex_template = payload.get("latex_template", "")

        # Use template from DB or provided LaTeX
        if template_id:
            template = get_template_or_404(db, current_user, template_id)
            latex_content = template.latex_template or latex_template
        else:
            latex_content = latex_template

        if not latex_content:
            raise HTTPException(status_code=400, detail="No LaTeX template provided")
    except Exception as e:
        print(f"Preview error: {e}")
        print(f"Payload: {payload}")
        raise HTTPException(status_code=400, detail=f"Error processing request: {str(e)}")

    # Sample data for preview
    sample_data = {
        'name': 'Turistický batoh Deuter Futura Pro 36',
        'category': 'Turistika » Batohy',
        'current_location': 'Sklad A » Regál 3',
        'default_location': 'Sklad A » Regál 3',
        'status': 'Dostupné',
        'qr_identifier': 'SCT-2024-001'
    }

    # LaTeX escape function
    def latex_escape(text):
        if not text:
            return ''
        replacements = {
            '&': '\\&', '%': '\\%', '$': '\\$', '#': '\\#',
            '^': '\\textasciicircum{}', '_': '\\_', '{': '\\{', '}': '\\}',
            '~': '\\textasciitilde{}', '\\': '\\textbackslash{}'
        }
        for char, escape in replacements.items():
            text = text.replace(char, escape)
        return text

    # Replace placeholders - fix double braces issue
    preview_latex = latex_content
    for field, value in sample_data.items():
        escaped_value = latex_escape(value)
        # Handle both {{field}} and {{{{field}}}} patterns
        preview_latex = preview_latex.replace('{{' + field + '}}', escaped_value)
        preview_latex = preview_latex.replace('{{{{' + field + '}}}}', escaped_value)

    return {"latex_code": preview_latex, "sample_data": sample_data}


@router.post("/labels/generate")
def generate_labels(
    payload: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
):
    template_id = payload.get("template_id")
    item_ids = payload.get("item_ids", [])

    template = get_template_or_404(db, current_user, template_id)
    items = db.query(InventoryItem).filter(InventoryItem.id.in_(item_ids)).all()

    import os
    import tempfile
    import subprocess
    from fastapi import Response

    # Get field value for item
    def get_field_value(item, field_name):
        if field_name == 'name':
            return item.name or ''
        elif field_name == 'category':
            return item.category or ''
        elif field_name == 'current_location':
            return item.current_location or ''
        elif field_name == 'default_location':
            return item.default_location or ''
        elif field_name == 'status':
            if item.current_location != item.default_location:
                return 'Navráceno jinam'
            return 'Dostupné'
        elif field_name == 'qr_identifier':
            return item.qr_identifier or ''
        else:
            return ''

    # LaTeX escape function
    def latex_escape(text):
        if not text:
            return ''
        # Escape special LaTeX characters
        replacements = {
            '&': '\\&',
            '%': '\\%',
            '$': '\\$',
            '#': '\\#',
            '^': '\\textasciicircum{}',
            '_': '\\_',
            '{': '\\{',
            '}': '\\}',
            '~': '\\textasciitilde{}',
            '\\': '\\textbackslash{}'
        }
        for char, escape in replacements.items():
            text = text.replace(char, escape)
        return text

    # Default LaTeX template if none in database
    width_mm = template.width_mm
    height_mm = template.height_mm
    qr_size_mm = template.qr_size_mm or 10

    default_latex_template = f"""\\documentclass[border=2pt]{{standalone}}
\\usepackage[utf8]{{inputenc}}
\\usepackage[T1]{{fontenc}}
\\usepackage{{qrcode}}
\\usepackage{{geometry}}
\\geometry{{paperwidth={width_mm}mm,paperheight={height_mm}mm,margin=0pt}}

\\begin{{document}}
\\pagestyle{{empty}}

\\begin{{minipage}}[t][{height_mm}mm][t]{{{width_mm}mm}}
\\vspace*{{3mm}}
\\hspace*{{3mm}}\\qrcode[height={qr_size_mm}mm]{{{{{{qr_identifier}}}}}}

\\vspace{{-{height_mm - 10}mm}}
\\hspace*{{{qr_size_mm + 6}mm}}
\\begin{{minipage}}{{{width_mm - qr_size_mm - 9}mm}}
\\textbf{{{{{{name}}}}}} \\\\
\\small {{{{{{category}}}}}} \\\\
\\tiny {{{{{{default_location}}}}}} \\\\
\\end{{minipage}}
\\end{{minipage}}

\\end{{document}}"""

    # Use template's LaTeX code or default
    latex_template = getattr(template, 'latex_template', None) or default_latex_template

    # Create temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        all_pdfs = []

        for i, item in enumerate(items):
            # Replace placeholders with actual values
            latex_content = latex_template

            # Replace all field placeholders - fix double braces issue
            field_names = ['name', 'category', 'current_location', 'default_location', 'status', 'qr_identifier']
            for field_name in field_names:
                field_value = get_field_value(item, field_name)
                escaped_value = latex_escape(field_value)
                # Handle both {{field}} and {{{{field}}}} patterns
                latex_content = latex_content.replace('{{' + field_name + '}}', escaped_value)
                latex_content = latex_content.replace('{{{{' + field_name + '}}}}', escaped_value)

            # Write LaTeX file
            tex_file = os.path.join(temp_dir, f"label_{i}.tex")
            with open(tex_file, 'w', encoding='utf-8') as f:
                f.write(latex_content)

            # Compile LaTeX to PDF
            try:
                result = subprocess.run([
                    'pdflatex', '-interaction=nonstopmode', '-output-directory', temp_dir, tex_file
                ], capture_output=True, text=True, timeout=30)

                pdf_file = os.path.join(temp_dir, f"label_{i}.pdf")
                if os.path.exists(pdf_file):
                    with open(pdf_file, 'rb') as f:
                        all_pdfs.append(f.read())
                else:
                    # Fallback to simple text if LaTeX compilation fails
                    raise Exception("LaTeX compilation failed")

            except Exception as e:
                # Return error or fallback
                return Response(
                    content=f"Chyba při generování štítků: {str(e)}".encode(),
                    media_type="text/plain",
                    status_code=500
                )

        if all_pdfs:
            # For now, return first PDF (could merge multiple PDFs later)
            return Response(
                content=all_pdfs[0],
                media_type="application/pdf",
                headers={"Content-Disposition": "attachment; filename=labels.pdf"}
            )
        else:
            return Response(
                content="Nepodařilo se vygenerovat žádné štítky".encode(),
                media_type="text/plain",
                status_code=500
            )
