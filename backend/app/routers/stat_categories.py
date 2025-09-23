from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..dependencies import get_db, require_admin
from ..models import StatCategory, StatCategoryComponent, StatMetricEnum, Task
from ..schemas import (
    StatCategoryComponentCreate,
    StatCategoryComponentPublic,
    StatCategoryComponentUpdate,
    StatCategoryCreate,
    StatCategoryManage,
    StatCategorySummary,
    StatCategoryUpdate,
)

router = APIRouter(prefix="/stats-categories", tags=["stats-categories"])

def _category_to_manage(category: StatCategory) -> StatCategoryManage:
    return StatCategoryManage(
        id=category.id,
        name=category.name,
        description=category.description,
        icon=category.icon,
        components=[_component_to_public(component) for component in category.components],
        created_at=category.created_at,
        updated_at=category.updated_at,
    )


def _component_to_public(component: StatCategoryComponent) -> StatCategoryComponentPublic:
    return StatCategoryComponentPublic(
        id=component.id,
        task_id=component.task_id,
        metric=component.metric,
        weight=component.weight,
        position=component.position,
        task_name=component.task.name if component.task else None,
    )


@router.get("/", response_model=List[StatCategorySummary])
@router.get("", response_model=List[StatCategorySummary], include_in_schema=False)
def list_stat_categories(db: Session = Depends(get_db)) -> List[StatCategorySummary]:
    rows = (
        db.query(
            StatCategory.id,
            StatCategory.name,
            StatCategory.description,
            StatCategory.icon,
            StatCategory.created_at,
            StatCategory.updated_at,
            func.count(StatCategoryComponent.id).label("component_count"),
        )
        .outerjoin(StatCategoryComponent)
        .group_by(StatCategory.id)
        .order_by(StatCategory.name.asc())
        .all()
    )

    return [
        StatCategorySummary(
            id=row.id,
            name=row.name,
            description=row.description,
            icon=row.icon,
            component_count=int(row.component_count or 0),
            created_at=row.created_at,
            updated_at=row.updated_at,
        )
        for row in rows
    ]


@router.get("/manage", response_model=List[StatCategoryManage])
def manage_stat_categories(
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> List[StatCategoryManage]:
    categories = (
        db.query(StatCategory)
        .options(joinedload(StatCategory.components).joinedload(StatCategoryComponent.task))
        .order_by(StatCategory.name.asc())
        .all()
    )
    return [_category_to_manage(category) for category in categories]


@router.post("/", response_model=StatCategoryManage, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=StatCategoryManage, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_stat_category(
    payload: StatCategoryCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> StatCategoryManage:
    category = StatCategory(name=payload.name, description=payload.description, icon=payload.icon)
    db.add(category)
    db.flush()

    if payload.components:
        for idx, component_payload in enumerate(payload.components):
            _add_component(category, component_payload, db, position_override=idx)

    db.commit()
    category = (
        db.query(StatCategory)
        .options(joinedload(StatCategory.components).joinedload(StatCategoryComponent.task))
        .filter(StatCategory.id == category.id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create category")
    return _category_to_manage(category)


@router.patch("/{category_id}", response_model=StatCategoryManage)
def update_stat_category(
    category_id: int,
    payload: StatCategoryUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> StatCategoryManage:
    category = (
        db.query(StatCategory)
        .options(joinedload(StatCategory.components).joinedload(StatCategoryComponent.task))
        .filter(StatCategory.id == category_id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    if "name" in payload.model_fields_set and payload.name is not None:
        category.name = payload.name
    if "description" in payload.model_fields_set:
        category.description = payload.description
    if "icon" in payload.model_fields_set:
        category.icon = payload.icon

    db.add(category)
    db.commit()
    category = (
        db.query(StatCategory)
        .options(joinedload(StatCategory.components).joinedload(StatCategoryComponent.task))
        .filter(StatCategory.id == category_id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update category")

    return _category_to_manage(category)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_stat_category(
    category_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> None:
    category = db.get(StatCategory, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    db.delete(category)
    db.commit()


def _add_component(
    category: StatCategory,
    component_payload: StatCategoryComponentCreate,
    db: Session,
    position_override: Optional[int] = None,
) -> StatCategoryComponent:
    task = db.get(Task, component_payload.task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    try:
        metric = StatMetricEnum(component_payload.metric)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid metric") from exc

    component = StatCategoryComponent(
        category=category,
        task_id=component_payload.task_id,
        metric=metric,
        weight=component_payload.weight,
        position=
        position_override
        if position_override is not None
        else (component_payload.position if component_payload.position is not None else len(category.components)),
    )
    db.add(component)
    return component


@router.post("/{category_id}/components", response_model=StatCategoryComponentPublic, status_code=status.HTTP_201_CREATED)
def create_component(
    category_id: int,
    payload: StatCategoryComponentCreate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> StatCategoryComponentPublic:
    category = db.get(StatCategory, category_id)
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    component = _add_component(category, payload, db)
    db.commit()
    component = (
        db.query(StatCategoryComponent)
        .options(joinedload(StatCategoryComponent.task))
        .filter(StatCategoryComponent.id == component.id)
        .first()
    )
    if not component:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to add component")
    return _component_to_public(component)


@router.patch("/components/{component_id}", response_model=StatCategoryComponentPublic)
def update_component(
    component_id: int,
    payload: StatCategoryComponentUpdate,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> StatCategoryComponentPublic:
    component = (
        db.query(StatCategoryComponent)
        .options(joinedload(StatCategoryComponent.task))
        .filter(StatCategoryComponent.id == component_id)
        .first()
    )
    if not component:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")

    if payload.task_id is not None and payload.task_id != component.task_id:
        task = db.get(Task, payload.task_id)
        if not task:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
        component.task_id = payload.task_id

    if payload.metric is not None:
        try:
            component.metric = StatMetricEnum(payload.metric)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid metric") from exc

    if payload.weight is not None:
        component.weight = payload.weight

    if payload.position is not None:
        component.position = payload.position

    db.add(component)
    db.commit()
    component = (
        db.query(StatCategoryComponent)
        .options(joinedload(StatCategoryComponent.task))
        .filter(StatCategoryComponent.id == component_id)
        .first()
    )
    if not component:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update component")
    return _component_to_public(component)


@router.delete("/components/{component_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_component(
    component_id: int,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
) -> None:
    component = db.get(StatCategoryComponent, component_id)
    if not component:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Component not found")
    db.delete(component)
    db.commit()
