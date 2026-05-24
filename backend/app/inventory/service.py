from __future__ import annotations

import secrets
from datetime import datetime
from typing import Iterable, Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session, joinedload

from ..dependencies import get_managed_team_ids
from ..models import (
    InventoryCategory,
    InventoryEvent,
    InventoryEventItem,
    InventoryLocation,
    InventoryEventScan,
    InventoryEventStatus,
    InventoryFlag,
    InventoryHistory,
    InventoryHistoryAction,
    InventoryItem,
    InventoryItemStatus,
    InventoryLabelTemplate,
    InventoryLoan,
    InventoryPhoto,
    RoleEnum,
    Team,
    User,
)
from ..schemas import (
    InventoryEventDetail,
    InventoryCategoryPublic,
    InventoryEventPublic,
    InventoryEventScanPublic,
    InventoryEventItemPublic,
    InventoryItemEventAssignmentPublic,
    InventoryFlagPublic,
    InventoryHistoryPublic,
    InventoryItemPublic,
    InventoryLabelTemplatePublic,
    InventoryLocationPublic,
    InventoryLoanPublic,
    InventoryPhotoPublic,
)


ACTIVE_EVENT_STATUSES = {InventoryEventStatus.PLANNED, InventoryEventStatus.ACTIVE}


def require_team_scope(user: User, team_id: int) -> None:
    if user.role == RoleEnum.ADMIN:
        return
    managed_ids = get_managed_team_ids(user)
    if team_id not in managed_ids:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")


def get_allowed_team_ids(user: User) -> Optional[set[int]]:
    if user.role == RoleEnum.ADMIN:
        return None
    managed_ids = get_managed_team_ids(user)
    return managed_ids


def ensure_team_exists_and_allowed(db: Session, user: User, team_id: int) -> Team:
    require_team_scope(user, team_id)
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


def generate_qr_identifier(db: Session) -> str:
    while True:
        candidate = f"INV-{secrets.token_hex(5).upper()}"
        if not db.query(InventoryItem).filter(InventoryItem.qr_identifier == candidate).first():
            return candidate


def get_item_query(db: Session):
    return db.query(InventoryItem).options(
        joinedload(InventoryItem.team),
        joinedload(InventoryItem.flag),
        joinedload(InventoryItem.photos),
        joinedload(InventoryItem.loans),
        joinedload(InventoryItem.history_entries),
        joinedload(InventoryItem.event_assignments).joinedload(InventoryEventItem.event),
    )


def get_event_query(db: Session):
    return db.query(InventoryEvent).options(
        joinedload(InventoryEvent.team),
        joinedload(InventoryEvent.items).joinedload(InventoryEventItem.item),
        joinedload(InventoryEvent.scans),
    )


def get_template_query(db: Session):
    return db.query(InventoryLabelTemplate).options(joinedload(InventoryLabelTemplate.team))


def get_location_query(db: Session):
    return db.query(InventoryLocation).options(joinedload(InventoryLocation.children))


def get_category_query(db: Session):
    return db.query(InventoryCategory).options(joinedload(InventoryCategory.children))


def get_flag_query(db: Session):
    return db.query(InventoryFlag).options(joinedload(InventoryFlag.team))


def get_scoped_items(db: Session, user: User, team_id: Optional[int] = None) -> list[InventoryItem]:
    query = get_item_query(db)
    allowed_team_ids = get_allowed_team_ids(user)
    if allowed_team_ids is not None:
        if not allowed_team_ids:
            return []
        query = query.filter(InventoryItem.team_id.in_(allowed_team_ids))
    if team_id is not None:
        if allowed_team_ids is not None and team_id not in allowed_team_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        query = query.filter(InventoryItem.team_id == team_id)
    return query.order_by(InventoryItem.name.asc()).all()


def get_scoped_events(db: Session, user: User, team_id: Optional[int] = None) -> list[InventoryEvent]:
    query = get_event_query(db)
    allowed_team_ids = get_allowed_team_ids(user)
    if allowed_team_ids is not None:
        if not allowed_team_ids:
            return []
        query = query.filter(InventoryEvent.team_id.in_(allowed_team_ids))
    if team_id is not None:
        if allowed_team_ids is not None and team_id not in allowed_team_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        query = query.filter(InventoryEvent.team_id == team_id)
    return query.order_by(InventoryEvent.start_date.desc(), InventoryEvent.name.asc()).all()


def get_scoped_templates(db: Session, user: User, team_id: Optional[int] = None) -> list[InventoryLabelTemplate]:
    query = get_template_query(db)
    allowed_team_ids = get_allowed_team_ids(user)
    if allowed_team_ids is not None:
        if not allowed_team_ids:
            return []
        query = query.filter(InventoryLabelTemplate.team_id.in_(allowed_team_ids))
    if team_id is not None:
        if allowed_team_ids is not None and team_id not in allowed_team_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        query = query.filter(InventoryLabelTemplate.team_id == team_id)
    return query.order_by(InventoryLabelTemplate.name.asc()).all()


def get_scoped_locations(db: Session, user: User, team_id: Optional[int] = None) -> list[InventoryLocation]:
    query = get_location_query(db)
    allowed_team_ids = get_allowed_team_ids(user)
    if allowed_team_ids is not None:
        if not allowed_team_ids:
            return []
        query = query.filter(InventoryLocation.team_id.in_(allowed_team_ids))
    if team_id is not None:
        if allowed_team_ids is not None and team_id not in allowed_team_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        query = query.filter(InventoryLocation.team_id == team_id)
    return query.order_by(InventoryLocation.team_id.asc(), InventoryLocation.path.asc(), InventoryLocation.sort_order.asc()).all()


def get_scoped_categories(db: Session, user: User, team_id: Optional[int] = None) -> list[InventoryCategory]:
    query = get_category_query(db)
    allowed_team_ids = get_allowed_team_ids(user)
    if allowed_team_ids is not None:
        if not allowed_team_ids:
            return []
        query = query.filter(InventoryCategory.team_id.in_(allowed_team_ids))
    if team_id is not None:
        if allowed_team_ids is not None and team_id not in allowed_team_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        query = query.filter(InventoryCategory.team_id == team_id)
    return query.order_by(InventoryCategory.team_id.asc(), InventoryCategory.path.asc(), InventoryCategory.sort_order.asc()).all()


def get_scoped_flags(db: Session, user: User, team_id: Optional[int] = None) -> list[InventoryFlag]:
    query = get_flag_query(db)
    allowed_team_ids = get_allowed_team_ids(user)
    if allowed_team_ids is not None:
        if not allowed_team_ids:
            return []
        query = query.filter(InventoryFlag.team_id.in_(allowed_team_ids))
    if team_id is not None:
        if allowed_team_ids is not None and team_id not in allowed_team_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        query = query.filter(InventoryFlag.team_id == team_id)
    return query.order_by(InventoryFlag.team_id.asc(), InventoryFlag.sort_order.asc(), InventoryFlag.name.asc()).all()


def get_item_or_404(db: Session, user: User, item_id: int) -> InventoryItem:
    item = get_item_query(db).filter(InventoryItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory item not found")
    require_team_scope(user, item.team_id)
    return item


def get_event_or_404(db: Session, user: User, event_id: int) -> InventoryEvent:
    event = get_event_query(db).filter(InventoryEvent.id == event_id).first()
    if not event:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Inventory event not found")
    require_team_scope(user, event.team_id)
    return event


def get_template_or_404(db: Session, user: User, template_id: int) -> InventoryLabelTemplate:
    template = get_template_query(db).filter(InventoryLabelTemplate.id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Label template not found")
    require_team_scope(user, template.team_id)
    return template


def get_location_or_404(db: Session, user: User, location_id: int) -> InventoryLocation:
    location = db.get(InventoryLocation, location_id)
    if not location:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Location not found")
    require_team_scope(user, location.team_id)
    return location


def get_category_or_404(db: Session, user: User, category_id: int) -> InventoryCategory:
    category = db.get(InventoryCategory, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    require_team_scope(user, category.team_id)
    return category


def get_flag_or_404(db: Session, user: User, flag_id: int) -> InventoryFlag:
    flag = db.get(InventoryFlag, flag_id)
    if not flag:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Flag not found")
    require_team_scope(user, flag.team_id)
    return flag


def record_history(
    db: Session,
    *,
    item: InventoryItem,
    actor: User,
    action: InventoryHistoryAction,
    payload: Optional[dict] = None,
    event: Optional[InventoryEvent] = None,
) -> InventoryHistory:
    entry = InventoryHistory(
        item=item,
        actor=actor,
        action=action,
        payload=payload or {},
        event=event,
    )
    db.add(entry)
    return entry


def get_open_loan_quantity(item: InventoryItem) -> int:
    return sum(loan.quantity for loan in item.loans if loan.returned_at is None)


def get_active_event_quantity(item: InventoryItem) -> int:
    total = 0
    for assignment in item.event_assignments:
        if assignment.event and assignment.event.status in ACTIVE_EVENT_STATUSES:
            total += max(assignment.planned_quantity - assignment.returned_quantity, 0)
    return total


def get_current_event_assignment(item: InventoryItem) -> Optional[InventoryEventItem]:
    for assignment in sorted(item.event_assignments, key=lambda value: value.id, reverse=True):
        if assignment.event and assignment.event.status in ACTIVE_EVENT_STATUSES:
            if assignment.returned_quantity < assignment.planned_quantity:
                return assignment
    return None


def get_available_quantity(item: InventoryItem) -> int:
    return max(item.quantity - get_open_loan_quantity(item) - get_active_event_quantity(item), 0)


def serialize_item(item: InventoryItem) -> InventoryItemPublic:
    active_assignment = get_current_event_assignment(item)
    return InventoryItemPublic(
        id=item.id,
        team_id=item.team_id,
        name=item.name,
        description=item.description,
        category=item.category,
        flag_id=item.flag_id,
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
        team_name=item.team.name if item.team else None,
        available_quantity=get_available_quantity(item),
        open_loan_quantity=get_open_loan_quantity(item),
        active_event_quantity=get_active_event_quantity(item),
        current_event_name=active_assignment.event.name if active_assignment and active_assignment.event else None,
        event_assignments=[
            InventoryItemEventAssignmentPublic(
                id=assignment.id,
                event_id=assignment.event_id,
                event_name=assignment.event.name if assignment.event else None,
                event_status=assignment.event.status if assignment.event else None,
                planned_quantity=assignment.planned_quantity,
                returned_quantity=assignment.returned_quantity,
                damaged_quantity=assignment.damaged_quantity,
                note=assignment.note,
                created_at=assignment.created_at,
                updated_at=assignment.updated_at,
            )
            for assignment in item.event_assignments
            if assignment.event and assignment.returned_quantity < assignment.planned_quantity
        ],
        photos=[InventoryPhotoPublic.model_validate(photo) for photo in item.photos],
        loans=[InventoryLoanPublic.model_validate(loan) for loan in item.loans],
        history_entries=[InventoryHistoryPublic.model_validate(entry) for entry in item.history_entries],
    )


def serialize_event(event: InventoryEvent) -> InventoryEventPublic:
    return InventoryEventPublic.model_validate(event)


def serialize_template(template: InventoryLabelTemplate) -> InventoryLabelTemplatePublic:
    import json

    # Convert old format fields to new format if needed
    fields = template.fields
    if isinstance(fields, list):
        # Convert old list format to new JSON format
        default_positions = {
            "name": {"x": 15, "y": 8, "fontSize": 12, "align": "left"},
            "category": {"x": 15, "y": 18, "fontSize": 8, "align": "left"},
            "current_location": {"x": 15, "y": 25, "fontSize": 6, "align": "left"},
            "default_location": {"x": 15, "y": 25, "fontSize": 6, "align": "left"},
            "status": {"x": 15, "y": 25, "fontSize": 6, "align": "left"},
            "qr_identifier": {"x": 15, "y": 25, "fontSize": 6, "align": "left"}
        }

        converted_fields = []
        for i, field_name in enumerate(fields):
            pos = default_positions.get(field_name, {"x": 15, "y": 8 + i * 7, "fontSize": 8, "align": "left"})
            converted_fields.append({
                "id": field_name,
                "enabled": True,
                **pos
            })

        fields = json.dumps(converted_fields)
    elif not isinstance(fields, str):
        # Fallback for any other format
        fields = '[{"id":"name","x":15,"y":8,"fontSize":12,"align":"left","enabled":true}]'

    # Create dict with converted fields
    template_data = {
        "id": template.id,
        "team_id": template.team_id,
        "name": template.name,
        "width_mm": template.width_mm,
        "height_mm": template.height_mm,
        "qr_x_mm": template.qr_x_mm,
        "qr_y_mm": template.qr_y_mm,
        "qr_size_mm": template.qr_size_mm,
        "title_font_size": template.title_font_size,
        "meta_font_size": template.meta_font_size,
        "fields": fields,
        "created_at": template.created_at,
        "updated_at": template.updated_at
    }

    return InventoryLabelTemplatePublic.model_validate(template_data)


def build_location_path(name: str, parent: Optional[InventoryLocation]) -> str:
    return f"{parent.path} / {name}" if parent else name


def serialize_location_tree(locations: Iterable[InventoryLocation]) -> list[InventoryLocationPublic]:
    sorted_locations = list(locations)
    node_map = {
        location.id: InventoryLocationPublic(
            id=location.id,
            team_id=location.team_id,
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
            team_id=category.team_id,
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


def build_event_summary(event: InventoryEvent) -> dict:
    returned = []
    missing = []
    damaged = []
    for assignment in event.items:
        pending = max(assignment.planned_quantity - assignment.returned_quantity, 0)
        if assignment.returned_quantity > 0:
            returned.append(
                {
                    "item_id": assignment.item_id,
                    "name": assignment.item.name if assignment.item else None,
                    "returned_quantity": assignment.returned_quantity,
                }
            )
        if pending > 0:
            missing.append(
                {
                    "item_id": assignment.item_id,
                    "name": assignment.item.name if assignment.item else None,
                    "missing_quantity": pending,
                }
            )
        if assignment.damaged_quantity > 0:
            damaged.append(
                {
                    "item_id": assignment.item_id,
                    "name": assignment.item.name if assignment.item else None,
                    "damaged_quantity": assignment.damaged_quantity,
                }
            )

    extra = [
        {
            "scan_id": scan.id,
            "qr_identifier": scan.qr_identifier,
            "item_id": scan.item_id,
            "name": scan.item.name if scan.item else None,
        }
        for scan in event.scans
        if scan.result == "extra"
    ]
    return {
        "returned": returned,
        "missing": missing,
        "extra": extra,
        "damaged": damaged,
    }


def serialize_event_detail(event: InventoryEvent) -> InventoryEventDetail:
    return InventoryEventDetail(
        event=serialize_event(event),
        items=[InventoryEventItemPublic.model_validate(item) for item in event.items],
        scans=[InventoryEventScanPublic.model_validate(scan) for scan in event.scans],
        summary=build_event_summary(event),
    )


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


def normalize_scan_condition(condition: Optional[str]) -> Optional[str]:
    if not condition:
        return None
    value = condition.strip().lower()
    return value or None


def touch_updated_location(item: InventoryItem) -> None:
    if not item.current_location and item.default_location:
        item.current_location = item.default_location


def serialize_items(items: Iterable[InventoryItem]) -> list[InventoryItemPublic]:
    return [serialize_item(item) for item in items]


def serialize_events(events: Iterable[InventoryEvent]) -> list[InventoryEventPublic]:
    return [serialize_event(event) for event in events]


def serialize_templates(templates: Iterable[InventoryLabelTemplate]) -> list[InventoryLabelTemplatePublic]:
    return [serialize_template(template) for template in templates]


def serialize_locations(locations: Iterable[InventoryLocation]) -> list[InventoryLocationPublic]:
    return serialize_location_tree(locations)


def serialize_categories(categories: Iterable[InventoryCategory]) -> list[InventoryCategoryPublic]:
    return serialize_category_tree(categories)


def serialize_flags(flags: Iterable[InventoryFlag]) -> list[InventoryFlagPublic]:
    return [InventoryFlagPublic.model_validate(flag) for flag in flags]
