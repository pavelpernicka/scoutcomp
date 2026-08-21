from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..dependencies import get_current_active_user, get_db
from ..models import (
    InventoryCategory,
    InventoryLocation,
    InventoryFlag,
    InventoryHistoryAction,
    InventoryItem,
    InventoryItemLocation,
    InventoryItemStatus,
    InventoryLabelTemplate,
    InventoryLoan,
    InventoryPhoto,
    InventorySet,
    User,
)
from ..permissions import permission_scopes
from ..schemas import (
    InventoryCategoryCreate,
    InventoryCategoryPublic,
    InventoryCategoryUpdate,
    InventoryFlagCreate,
    InventoryFlagPublic,
    InventoryFlagUpdate,
    InventoryBulkUpdateRequest,
    InventoryBulkLoanRequest,
    InventoryLocationCreate,
    InventoryLocationPublic,
    InventoryLocationUpdate,
    InventoryItemCreate,
    InventoryItemPublic,
    InventoryItemUpdate,
    InventoryLabelTemplateCreate,
    InventoryLabelTemplatePublic,
    InventoryLabelTemplateUpdate,
    InventoryLoanCreate,
    InventoryLoanPublic,
    InventoryLoanReturn,
    InventoryOverviewResponse,
    InventoryPhotoCreate,
    InventorySetCreate,
    InventorySetItemsUpdate,
    InventorySetPublic,
    InventorySetUpdate,
)
from .service import (
    ensure_team_exists_and_allowed,
    generate_qr_identifier,
    get_available_quantity,
    get_available_quantity,
    get_allowed_team_ids,
    get_item_query,
    get_item_or_404,
    get_category_or_404,
    get_flag_or_404,
    get_location_or_404,
    get_scoped_categories,
    get_scoped_flags,
    get_scoped_items,
    get_scoped_locations,
    get_scoped_templates,
    get_scoped_sets,
    get_set_or_404,
    get_template_or_404,
    record_history,
    build_location_path,
    serialize_categories,
    serialize_flags,
    serialize_item,
    serialize_items,
    serialize_locations,
    serialize_template,
    serialize_templates,
    serialize_set,
    serialize_sets,
    touch_updated_location,
    update_item_status_history,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _normalized_locations(values) -> list[tuple[str, int]]:
    quantities: dict[str, int] = {}
    for value in values:
        location = value.location.strip()
        if not location:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Location must not be empty")
        if location in quantities:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Location may only be listed once")
        quantities[location] = value.quantity
    return list(quantities.items())


def _replace_item_locations(db: Session, item: InventoryItem, values, expected_quantity: int) -> None:
    locations = _normalized_locations(values)
    # Older items predate per-location quantities.  An ordinary edit must not
    # fail solely because the client has no allocation rows to send yet.
    if not locations and expected_quantity:
        locations = [(item.current_location or item.default_location or "Bez lokace", expected_quantity)]
    if sum(quantity for _, quantity in locations) != expected_quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Location quantities must equal the available item quantity")
    existing_by_location = {entry.location: entry for entry in item.locations}
    requested_locations = {location for location, _quantity in locations}
    for location, quantity in locations:
        existing = existing_by_location.get(location)
        if existing:
            existing.quantity = quantity
        else:
            item.locations.append(InventoryItemLocation(location=location, quantity=quantity))
    for location, existing in existing_by_location.items():
        if location not in requested_locations:
            db.delete(existing)
    if locations:
        item.current_location = locations[0][0]
        item.default_location = item.default_location or locations[0][0]


def require_inventory_access(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)
) -> User:
    if not (permission_scopes(db, current_user, "inventory.read") or permission_scopes(db, current_user, "inventory.manage")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing inventory permission")
    return current_user


# Existing handlers share this dependency name; bind it to the module policy so
# their signatures remain stable while legacy role checks are removed.
require_admin_or_group_admin = require_inventory_access


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
        label_templates=serialize_templates(get_scoped_templates(db, current_user, team_id)),
        locations=serialize_locations(get_scoped_locations(db, current_user, team_id)),
        categories=serialize_categories(get_scoped_categories(db, current_user, team_id)),
        flags=serialize_flags(get_scoped_flags(db, current_user, team_id)),
        sets=serialize_sets(get_scoped_sets(db, current_user, team_id)),
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
    # Fetch the selected items and their collections as one batch.  The former
    # per-ID loader repeated all relationship queries for every selected row.
    items_by_id = {
        item.id: item
        for item in get_item_query(db).filter(InventoryItem.id.in_(payload.item_ids)).all()
    }
    items = []
    allowed_team_ids = get_allowed_team_ids(current_user)
    for item_id in payload.item_ids:
        item = items_by_id.get(item_id)
        if not item:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
        if allowed_team_ids is not None and item.team_id not in allowed_team_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        items.append(item)
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
        db.add(item)

    db.commit()
    refreshed_items = get_item_query(db).filter(InventoryItem.id.in_(items_by_id)).all()
    refreshed_by_id = {item.id: item for item in refreshed_items}
    return [serialize_item(refreshed_by_id[item_id]) for item_id in payload.item_ids]


@router.post("/items/bulk/loans", response_model=list[InventoryItemPublic], status_code=status.HTTP_201_CREATED)
def bulk_create_loans(
    payload: InventoryBulkLoanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventoryItemPublic]:
    items = get_item_query(db).filter(InventoryItem.id.in_(payload.item_ids)).all()
    if len(items) != len(set(payload.item_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    allowed_team_ids = get_allowed_team_ids(current_user)
    if allowed_team_ids is not None and any(item.team_id not in allowed_team_ids for item in items):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inventory item outside managed scope")
    for item in items:
        available = get_available_quantity(item)
        if available <= 0:
            continue
        source_location = item.current_location or item.default_location
        db.add(InventoryLoan(item=item, borrower_name=payload.borrower_name, quantity=available, due_at=payload.due_at, source_location=source_location, note=payload.note))
    db.commit()
    refreshed = get_item_query(db).filter(InventoryItem.id.in_(payload.item_ids)).all()
    by_id = {item.id: item for item in refreshed}
    return [serialize_item(by_id[item_id]) for item_id in payload.item_ids]


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
    if payload.set_id is not None:
        inventory_set = get_set_or_404(db, current_user, payload.set_id)
    item = InventoryItem(
        team_id=payload.team_id,
        name=payload.name,
        description=payload.description,
        category=payload.category,
        flag_id=payload.flag_id,
        set_id=payload.set_id,
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
    if payload.locations:
        _replace_item_locations(db, item, payload.locations, payload.quantity)
    elif payload.quantity:
        location = payload.current_location or payload.default_location or "Bez lokace"
        db.add(InventoryItemLocation(item=item, location=location, quantity=payload.quantity))
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
    open_loan_quantity = sum(loan.quantity for loan in item.loans if loan.returned_at is None)
    if payload.quantity is not None and payload.quantity < open_loan_quantity:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Quantity cannot be lower than currently loaned quantity")
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

    next_team_id = payload.team_id if payload.team_id is not None else item.team_id
    if "set_id" in payload.model_fields_set:
        if payload.set_id is not None:
            get_set_or_404(db, current_user, payload.set_id)
        changes["set_id"] = {"from": item.set_id, "to": payload.set_id}
        item.set_id = payload.set_id
    elif item.set_id is not None and next_team_id != item.team_id:
        get_set_or_404(db, current_user, item.set_id)

    if payload.team_id is not None and payload.team_id != item.team_id:
        ensure_team_exists_and_allowed(db, current_user, payload.team_id)
        changes["team_id"] = {"from": item.team_id, "to": payload.team_id}
        item.team_id = payload.team_id
    for field in ["name", "description", "category", "quantity", "quantity_unit", "default_location", "current_location", "status", "notes"]:
        value = getattr(payload, field)
        if value is not None and value != getattr(item, field):
            changes[field] = {"from": getattr(item, field), "to": value}
            setattr(item, field, value)

    if payload.locations is not None:
        _replace_item_locations(db, item, payload.locations, item.quantity - open_loan_quantity)
    elif payload.quantity is not None and item.locations:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Send location quantities when changing item quantity")

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
    # The inventory UI exposes one primary photo. Replacing it must not append
    # a hidden second image while the old one remains the first preview.
    for existing_photo in list(item.photos):
        db.delete(existing_photo)
    db.flush()
    photo = InventoryPhoto(item=item, image_url=payload.image_url, caption=payload.caption, position=0)
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
    location_entry = None
    if item.locations:
        requested_location = payload.location or item.locations[0].location
        location_entry = next((entry for entry in item.locations if entry.location == requested_location), None)
        if not location_entry:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unknown item location")
        if payload.quantity > location_entry.quantity:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Not enough quantity at the selected location")
        location_entry.quantity -= payload.quantity
    loan = InventoryLoan(
        item=item,
        borrower_name=payload.borrower_name,
        borrowed_at=payload.borrowed_at or datetime.utcnow(),
        due_at=payload.due_at,
        quantity=payload.quantity,
        source_location=location_entry.location if location_entry else payload.location,
        note=payload.note,
    )
    db.add(loan)
    record_history(
        db,
        item=item,
        actor=current_user,
        action=InventoryHistoryAction.LOANED,
        payload={"borrower_name": loan.borrower_name, "quantity": loan.quantity, "location": loan.source_location, "due_at": loan.due_at.isoformat() if loan.due_at else None},
    )
    db.commit()
    return serialize_item(get_item_or_404(db, current_user, item.id))


@router.post("/loans/{loan_id}/return", response_model=InventoryItemPublic)
def return_loan(
    loan_id: int,
    payload: InventoryLoanReturn | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    payload = payload or InventoryLoanReturn()
    loan = db.get(InventoryLoan, loan_id)
    if not loan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Loan not found")
    item = get_item_or_404(db, current_user, loan.item_id)
    if loan.returned_at is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Loan already returned")
    loan.returned_at = payload.returned_at or datetime.utcnow()
    if payload.note:
        loan.note = payload.note
    if loan.source_location:
        location_entry = next((entry for entry in item.locations if entry.location == loan.source_location), None)
        if location_entry:
            location_entry.quantity += loan.quantity
        else:
            db.add(InventoryItemLocation(item=item, location=loan.source_location, quantity=loan.quantity))
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


@router.get("/qr/{qr_identifier}", response_model=InventoryItemPublic)
def get_item_by_qr(
    qr_identifier: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventoryItemPublic:
    # qr_identifier is unique and indexed.  Do not deserialize the complete
    # inventory merely to resolve one scanned code.
    query = get_item_query(db).filter(InventoryItem.qr_identifier == qr_identifier)
    allowed_team_ids = get_allowed_team_ids(current_user)
    if allowed_team_ids is not None:
        if not allowed_team_ids:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
        query = query.filter(InventoryItem.team_id.in_(allowed_team_ids))
    match = query.first()
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


@router.get("/sets", response_model=list[InventorySetPublic])
def list_sets(
    team_id: Optional[int] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> list[InventorySetPublic]:
    return serialize_sets(get_scoped_sets(db, current_user, team_id))


@router.post("/sets", response_model=InventorySetPublic, status_code=status.HTTP_201_CREATED)
def create_set(
    payload: InventorySetCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventorySetPublic:
    if payload.flag_id is not None:
        get_flag_or_404(db, current_user, payload.flag_id)
    inventory_set = InventorySet(**payload.model_dump())
    db.add(inventory_set)
    db.commit()
    db.refresh(inventory_set)
    return serialize_set(get_set_or_404(db, current_user, inventory_set.id))


@router.patch("/sets/{set_id}", response_model=InventorySetPublic)
def update_set(
    set_id: int,
    payload: InventorySetUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventorySetPublic:
    inventory_set = get_set_or_404(db, current_user, set_id)
    data = payload.model_dump(exclude_unset=True)
    if data.get("flag_id") is not None:
        get_flag_or_404(db, current_user, data["flag_id"])
    for key, value in data.items():
        setattr(inventory_set, key, value)
    db.add(inventory_set)
    db.commit()
    return serialize_set(get_set_or_404(db, current_user, inventory_set.id))


@router.post("/sets/{set_id}/items", response_model=InventorySetPublic)
def update_set_items(
    set_id: int,
    payload: InventorySetItemsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventorySetPublic:
    inventory_set = get_set_or_404(db, current_user, set_id)
    items = db.query(InventoryItem).filter(InventoryItem.id.in_(payload.item_ids)).all() if payload.item_ids else []
    if len(items) != len(set(payload.item_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    allowed_team_ids = get_allowed_team_ids(current_user)
    if allowed_team_ids is not None and any(item.team_id not in allowed_team_ids for item in items):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inventory item outside managed scope")
    db.query(InventoryItem).filter(InventoryItem.set_id == inventory_set.id).update({"set_id": None}, synchronize_session=False)
    if items:
        db.query(InventoryItem).filter(InventoryItem.id.in_([item.id for item in items])).update({"set_id": inventory_set.id}, synchronize_session=False)
    db.commit()
    return serialize_set(get_set_or_404(db, current_user, set_id))


@router.post("/sets/{set_id}/items/add", response_model=InventorySetPublic)
def add_set_items(
    set_id: int,
    payload: InventorySetItemsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> InventorySetPublic:
    inventory_set = get_set_or_404(db, current_user, set_id)
    items = db.query(InventoryItem).filter(InventoryItem.id.in_(payload.item_ids)).all() if payload.item_ids else []
    if len(items) != len(set(payload.item_ids)):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    allowed_team_ids = get_allowed_team_ids(current_user)
    if allowed_team_ids is not None and any(item.team_id not in allowed_team_ids for item in items):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Inventory item outside managed scope")
    if items:
        db.query(InventoryItem).filter(InventoryItem.id.in_([item.id for item in items])).update({"set_id": inventory_set.id}, synchronize_session=False)
    db.commit()
    return serialize_set(get_set_or_404(db, current_user, set_id))


@router.delete("/sets/{set_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_set(
    set_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    inventory_set = get_set_or_404(db, current_user, set_id)
    db.query(InventoryItem).filter(InventoryItem.set_id == inventory_set.id).update({"set_id": None})
    db.delete(inventory_set)
    db.commit()


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
