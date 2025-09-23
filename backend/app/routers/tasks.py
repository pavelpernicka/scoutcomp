from datetime import datetime, timedelta
from typing import List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..dependencies import get_current_active_user, get_db, require_admin
from ..models import (
    Completion,
    CompletionStatus,
    RoleEnum,
    Task,
    TaskPeriodUnit,
    Team,
    User,
)
from ..schemas import (
    CompletionPublic,
    CompletionSubmission,
    TaskCreate,
    TaskProgress,
    TaskPublic,
    TaskUpdate,
)

router = APIRouter(prefix="/tasks", tags=["tasks"])


def _apply_status_filter(query, status_filter: Optional[str]):
    now = datetime.utcnow()
    if status_filter == "active":
        query = query.filter(Task.start_time <= now)
        query = query.filter((Task.end_time.is_(None)) | (Task.end_time >= now))
        query = query.filter(Task.is_archived.is_(False))
    elif status_filter == "future":
        query = query.filter(Task.start_time > now)
    elif status_filter == "expired":
        query = query.filter(Task.end_time.isnot(None), Task.end_time < now)
    return query


def _validate_period_fields(max_per_period: Optional[int], period_unit: Optional[TaskPeriodUnit], period_count: Optional[int]) -> None:
    if max_per_period is None:
        return
    if period_unit is None or period_count is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="period_unit and period_count are required when max_per_period is set",
        )


def _ensure_team_exists(db: Session, team_id: Optional[int]) -> None:
    if team_id is None:
        return
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")


def _assert_task_access(task: Task, user: User) -> None:
    if task.team_id and user.role != RoleEnum.ADMIN and task.team_id != user.team_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task restricted to another team")
    if task.is_archived:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail="Task archived")


def _assert_task_window(task: Task) -> None:
    now = datetime.utcnow()
    if task.start_time and task.start_time > now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task not yet active")
    if task.end_time and task.end_time < now:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Task has expired")


def _window_delta(task: Task) -> Optional[timedelta]:
    if task.max_per_period is None or task.period_unit is None or task.period_count is None:
        return None
    delta_map = {
        TaskPeriodUnit.HOUR: timedelta(hours=task.period_count),
        TaskPeriodUnit.DAY: timedelta(days=task.period_count),
        TaskPeriodUnit.WEEK: timedelta(weeks=task.period_count),
        TaskPeriodUnit.MONTH: timedelta(days=30 * task.period_count),
    }
    return delta_map.get(task.period_unit)


def _window_bounds(task: Task, now: datetime) -> Tuple[Optional[datetime], Optional[datetime]]:
    delta = _window_delta(task)
    if not delta:
        return None, None
    start = now - delta
    end = start + delta
    return start, end


def _current_window_stats(
    db: Session,
    task: Task,
    member: User,
    now: datetime,
) -> Tuple[int, Optional[datetime], Optional[datetime]]:
    delta = _window_delta(task)
    if not delta:
        return 0, None, None

    start = task.start_time or now
    if now < start:
        window_start = start
    else:
        elapsed = now - start
        periods = elapsed // delta
        window_start = start + periods * delta
    window_end = window_start + delta

    total = int(
        db.query(func.coalesce(func.sum(Completion.count), 0))
        .filter(
            Completion.task_id == task.id,
            Completion.member_id == member.id,
            Completion.status != CompletionStatus.REJECTED,
            Completion.submitted_at >= window_start,
            Completion.submitted_at < window_end,
        )
        .scalar()
        or 0
    )

    return total, window_start, window_end


def _calculate_progress(db: Session, task: Task, member: User) -> TaskProgress:
    now = datetime.utcnow()
    total_all = int(
        db.query(func.coalesce(func.sum(Completion.count), 0))
        .filter(
            Completion.task_id == task.id,
            Completion.member_id == member.id,
            Completion.status != CompletionStatus.REJECTED,
        )
        .scalar()
        or 0
    )

    current_count, window_start, window_end = _current_window_stats(db, task, member, now)
    if task.max_per_period is None:
        return TaskProgress(
            current=total_all,
            remaining=None,
            limit=None,
            period_start=None,
            period_end=None,
            lifetime=total_all,
        )

    remaining = max(task.max_per_period - current_count, 0)
    return TaskProgress(
        current=current_count,
        remaining=remaining,
        limit=task.max_per_period,
        period_start=window_start,
        period_end=window_end,
        lifetime=total_all,
    )


@router.get("/", response_model=List[TaskPublic])
@router.get("", response_model=List[TaskPublic], include_in_schema=False)
def list_tasks(
    status: Optional[str] = Query(default=None, pattern="^(active|future|expired)$"),
    include_archived: bool = Query(default=False),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[Task]:
    query = db.query(Task)
    if status:
        query = _apply_status_filter(query, status)
    if not include_archived:
        query = query.filter(Task.is_archived.is_(False))
    if current_user.role != RoleEnum.ADMIN:
        if current_user.team_id is not None:
            query = query.filter((Task.team_id == current_user.team_id) | (Task.team_id.is_(None)))
        else:
            query = query.filter(Task.team_id.is_(None))
    tasks = query.order_by(Task.start_time.desc()).all()

    for task in tasks:
        task.progress = _calculate_progress(db, task, current_user)
    return tasks


@router.post("/", response_model=TaskPublic, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=TaskPublic, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_task(
    payload: TaskCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Task:
    _validate_period_fields(payload.max_per_period, payload.period_unit, payload.period_count)
    _ensure_team_exists(db, payload.team_id)
    task = Task(
        name=payload.name,
        description=payload.description,
        start_time=payload.start_time or datetime.utcnow(),
        end_time=payload.end_time,
        points_per_completion=payload.points_per_completion,
        max_per_period=payload.max_per_period,
        period_unit=payload.period_unit,
        period_count=payload.period_count,
        requires_approval=payload.requires_approval,
        team_id=payload.team_id,
    )
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.get("/{task_id}", response_model=TaskPublic)
def get_task(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    _assert_task_access(task, current_user)
    return task


@router.patch("/{task_id}", response_model=TaskPublic)
def update_task(
    task_id: int,
    payload: TaskUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    patch_data = payload.dict(exclude_unset=True)
    if {"max_per_period", "period_unit", "period_count"} & patch_data.keys():
        max_per_period = patch_data.get("max_per_period", task.max_per_period)
        period_unit = patch_data.get("period_unit", task.period_unit)
        period_count = patch_data.get("period_count", task.period_count)
        _validate_period_fields(max_per_period, period_unit, period_count)
    if "team_id" in patch_data:
        _ensure_team_exists(db, patch_data["team_id"])

    for field, value in patch_data.items():
        setattr(task, field, value)

    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def archive_task(
    task_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    task.is_archived = True
    db.add(task)
    db.commit()


@router.post("/{task_id}/submissions", response_model=CompletionPublic, status_code=status.HTTP_201_CREATED)
def submit_completion(
    task_id: int,
    payload: CompletionSubmission,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Completion:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    _assert_task_access(task, current_user)
    _assert_task_window(task)
    count = payload.count or 1

    progress = _calculate_progress(db, task, current_user)
    if progress.remaining is not None and count > progress.remaining:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Submission limit reached")

    status_target = CompletionStatus.PENDING if task.requires_approval else CompletionStatus.APPROVED
    now = datetime.utcnow()
    completion = Completion(
        task_id=task.id,
        member_id=current_user.id,
        status=status_target,
        member_note=payload.member_note,
        points_awarded=(task.points_per_completion * count)
        if status_target == CompletionStatus.APPROVED
        else 0,
        count=count,
    )
    if status_target == CompletionStatus.APPROVED:
        completion.reviewed_at = now

    db.add(completion)
    db.commit()
    db.refresh(completion)

    return completion


@router.post("/{task_id}/unarchive", response_model=TaskPublic)
def unarchive_task(
    task_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Task:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    task.is_archived = False
    db.add(task)
    db.commit()
    db.refresh(task)
    return task


@router.delete("/{task_id}/force", status_code=status.HTTP_204_NO_CONTENT)
def delete_task_permanently(
    task_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    db.query(Completion).filter(Completion.task_id == task_id).delete()

    db.delete(task)
    db.commit()


@router.get("/{task_id}/submissions", response_model=List[CompletionPublic])
def list_task_submissions(
    task_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[Completion]:
    task = db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")
    _assert_task_access(task, current_user)

    query = db.query(Completion).filter(Completion.task_id == task.id)
    if current_user.role != RoleEnum.ADMIN:
        query = query.filter(Completion.member_id == current_user.id)
    return query.order_by(Completion.submitted_at.desc()).all()
