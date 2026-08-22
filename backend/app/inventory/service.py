from __future__ import annotations

import secrets
from datetime import datetime
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from ..models import (
    InventoryCategory,
    InventoryLocation,
    InventoryFlag,
    InventoryHistory,
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
from ..schemas import (
    InventoryCategoryPublic,
    InventoryFlagPublic,
    InventoryItemPublic,
    InventoryItemLocationPublic,
    InventoryLabelTemplatePublic,
    InventoryLocationPublic,
    InventoryLoanPublic,
    InventoryPhotoPublic,
    InventorySetPublic,
)

MAX_INVENTORY_HISTORY_ENTRIES_PER_ITEM = 200


def generate_qr_identifier(db: Session) -> str:
    while True:
        candidate = f"INV-{secrets.token_hex(5).upper()}"
        if not db.query(InventoryItem).filter(InventoryItem.qr_identifier == candidate).first():
            return candidate


def get_item_query(db: Session):
    # An item has several independent collection relationships.  Loading all
    # of them with JOINs multiplies rows (photos × loans × locations)
    # and made even a small update slow once an item had an audit trail.
    # Keep scalar relations in the main query and load each collection in a
    # separate batched query instead.
    # Audit history is persisted but is not rendered by the inventory client;
    # loading it into every list and mutation response made payloads grow with
    # the lifetime of each item.
    return db.query(InventoryItem).options(
        joinedload(InventoryItem.flag),
        selectinload(InventoryItem.photos),
        selectinload(InventoryItem.loans),
        selectinload(InventoryItem.locations),
    )


def get_template_query(db: Session):
    return db.query(InventoryLabelTemplate)


def get_location_query(db: Session):
    return db.query(InventoryLocation).options(joinedload(InventoryLocation.children))


def get_category_query(db: Session):
    return db.query(InventoryCategory).options(joinedload(InventoryCategory.children))


def get_flag_query(db: Session):
    return db.query(InventoryFlag)


def get_set_query(db: Session):
    return db.query(InventorySet).options(selectinload(InventorySet.items))


def get_inventory_items(db: Session) -> list[InventoryItem]:
    return get_item_query(db).order_by(InventoryItem.name.asc()).all()


def get_inventory_templates(db: Session) -> list[InventoryLabelTemplate]:
    return get_template_query(db).order_by(InventoryLabelTemplate.name.asc()).all()


def get_inventory_locations(db: Session) -> list[InventoryLocation]:
    return get_location_query(db).order_by(InventoryLocation.path.asc(), InventoryLocation.sort_order.asc()).all()


def get_inventory_categories(db: Session) -> list[InventoryCategory]:
    return get_category_query(db).order_by(InventoryCategory.path.asc(), InventoryCategory.sort_order.asc()).all()


def get_inventory_flags(db: Session) -> list[InventoryFlag]:
    return get_flag_query(db).order_by(InventoryFlag.sort_order.asc(), InventoryFlag.name.asc()).all()


def get_inventory_sets(db: Session) -> list[InventorySet]:
    return get_set_query(db).order_by(InventorySet.name.asc()).all()


def get_item_or_404(db: Session, item_id: int) -> InventoryItem:
    item = get_item_query(db).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    return item


def get_template_or_404(db: Session, template_id: int) -> InventoryLabelTemplate:
    template = get_template_query(db).filter(InventoryLabelTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label template not found")
    return template


def get_location_or_404(db: Session, location_id: int) -> InventoryLocation:
    location = db.get(InventoryLocation, location_id)
    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    return location


def get_category_or_404(db: Session, category_id: int) -> InventoryCategory:
    category = db.get(InventoryCategory, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    return category


def get_flag_or_404(db: Session, flag_id: int) -> InventoryFlag:
    flag = db.get(InventoryFlag, flag_id)
    if not flag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flag not found")
    return flag


def get_set_or_404(db: Session, set_id: int) -> InventorySet:
    inventory_set = db.get(InventorySet, set_id)
    if not inventory_set:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory set not found")
    return inventory_set


def record_history(
    db: Session,
    *,
    item: InventoryItem,
    actor: User,
    action: InventoryHistoryAction,
    payload: Optional[dict] = None,
) -> InventoryHistory:
    entry = InventoryHistory(
        item=item,
        actor=actor,
        action=action,
        payload=payload or {},
    )
    db.add(entry)
    # Audit records are useful operational context, not an unbounded event
    # store. Keep the most recent records per item so long-lived inventories
    # do not grow indefinitely.
    db.flush()
    stale_entry_ids = (
        db.query(InventoryHistory.id)
        .filter(InventoryHistory.item_id == item.id)
        .order_by(InventoryHistory.created_at.desc(), InventoryHistory.id.desc())
        .offset(MAX_INVENTORY_HISTORY_ENTRIES_PER_ITEM)
        .subquery()
    )
    db.query(InventoryHistory).filter(
        InventoryHistory.id.in_(select(stale_entry_ids.c.id))
    ).delete(synchronize_session=False)
    return entry


def get_open_loan_quantity(item: InventoryItem) -> int:
    return sum(loan.quantity for loan in item.loans if loan.returned_at is None)


def get_available_quantity(item: InventoryItem) -> int:
    if item.locations:
        return sum(location.quantity for location in item.locations)
    return max(item.quantity - get_open_loan_quantity(item), 0)


def serialize_item(item: InventoryItem) -> InventoryItemPublic:
    return InventoryItemPublic(
        id=item.id,
        name=item.name,
        description=item.description,
        category=item.category,
        flag_id=item.flag_id,
        set_id=item.set_id,
        flag=InventoryFlagPublic.model_validate(item.flag) if item.flag else None,
        quantity=item.quantity,
        quantity_unit=item.quantity_unit,
        default_location=item.default_location,
        current_location=item.current_location,
        status=item.status,
        notes=item.notes,
        qr_identifier=item.qr_identifier,
        created_at=item.created_at,
        updated_at=item.updated_at,
        available_quantity=get_available_quantity(item),
        open_loan_quantity=get_open_loan_quantity(item),
        photos=[InventoryPhotoPublic.model_validate(photo) for photo in item.photos],
        locations=[InventoryItemLocationPublic.model_validate(location) for location in item.locations],
        loans=[InventoryLoanPublic.model_validate(loan) for loan in item.loans],
    )


def serialize_template(template: InventoryLabelTemplate) -> InventoryLabelTemplatePublic:
    import json

    # Old custom-position definitions are collapsed into the supported simple
    # configuration: chosen metadata and sheet arrangement.
    fields = template.fields
    if isinstance(fields, list):
        fields = json.dumps({"visibleFields": [field for field in fields if field not in {"name", "qr_identifier"}], "columns": 3, "gapMm": 2})
    elif not isinstance(fields, str):
        fields = '{"visibleFields":["category","current_location"],"columns":3,"gapMm":2}'

    # Create dict with converted fields
    template_data = {
        "id": template.id,
        "name": template.name,
        "width_mm": template.width_mm,
        "height_mm": template.height_mm,
        "qr_size_mm": template.qr_size_mm,
        "fields": fields,
        "created_at": template.created_at,
        "updated_at": template.updated_at
    }

    return InventoryLabelTemplatePublic.model_validate(template_data)


def serialize_set(inventory_set: InventorySet) -> InventorySetPublic:
    return InventorySetPublic.model_validate(inventory_set)


def serialize_sets(sets: Iterable[InventorySet]) -> list[InventorySetPublic]:
    return [serialize_set(inventory_set) for inventory_set in sets]


def build_location_path(name: str, parent: Optional[InventoryLocation]) -> str:
    return f"{parent.path} / {name}" if parent else name


def serialize_location_tree(locations: Iterable[InventoryLocation]) -> list[InventoryLocationPublic]:
    sorted_locations = list(locations)
    node_map = {
        location.id: InventoryLocationPublic(
            id=location.id,
            parent_id=location.parent_id,
            name=location.name,
            description=location.description,
            path=location.path,
            sort_order=location.sort_order,
            created_at=location.created_at,
            updated_at=location.updated_at,
            children=[],
        )
        for location in sorted_locations
    }
    roots: list[InventoryLocationPublic] = []
    for location in sorted_locations:
        node = node_map[location.id]
        if location.parent_id and location.parent_id in node_map:
            node_map[location.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


def serialize_category_tree(categories: Iterable[InventoryCategory]) -> list[InventoryCategoryPublic]:
    sorted_categories = list(categories)
    node_map = {
        category.id: InventoryCategoryPublic(
            id=category.id,
            parent_id=category.parent_id,
            name=category.name,
            description=category.description,
            path=category.path,
            color=category.color,
            sort_order=category.sort_order,
            created_at=category.created_at,
            updated_at=category.updated_at,
            children=[],
        )
        for category in sorted_categories
    }
    roots: list[InventoryCategoryPublic] = []
    for category in sorted_categories:
        node = node_map[category.id]
        if category.parent_id and category.parent_id in node_map:
            node_map[category.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


def update_item_status_history(
    db: Session,
    *,
    item: InventoryItem,
    actor: User,
    previous_status: InventoryItemStatus,
) -> None:
    if item.status == previous_status:
        return
    action = InventoryHistoryAction.UPDATED
    if item.status == InventoryItemStatus.MISSING:
        action = InventoryHistoryAction.MARKED_MISSING
    elif item.status == InventoryItemStatus.DAMAGED:
        action = InventoryHistoryAction.MARKED_DAMAGED
    record_history(
        db,
        item=item,
        actor=actor,
        action=action,
        payload={"from": previous_status.value, "to": item.status.value},
    )


def touch_updated_location(item: InventoryItem) -> None:
    if not item.current_location and item.default_location:
        item.current_location = item.default_location


def serialize_items(items: Iterable[InventoryItem]) -> list[InventoryItemPublic]:
    return [serialize_item(item) for item in items]


def serialize_templates(templates: Iterable[InventoryLabelTemplate]) -> list[InventoryLabelTemplatePublic]:
    return [serialize_template(template) for template in templates]


def serialize_locations(locations: Iterable[InventoryLocation]) -> list[InventoryLocationPublic]:
    return serialize_location_tree(locations)


def serialize_categories(categories: Iterable[InventoryCategory]) -> list[InventoryCategoryPublic]:
    return serialize_category_tree(categories)


def serialize_flags(flags: Iterable[InventoryFlag]) -> list[InventoryFlagPublic]:
    return [InventoryFlagPublic.model_validate(flag) for flag in flags]
