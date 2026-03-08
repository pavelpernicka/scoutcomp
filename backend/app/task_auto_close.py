from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from .models import Completion, CompletionStatus, Task, TaskAutoCloseScope, TaskTeamClosure, User


def _team_filter(query, team_id: Optional[int]):
    if team_id is None:
        return query.filter(User.team_id.is_(None))
    return query.filter(User.team_id == team_id)


def _closure_for_team_exists(db: Session, task_id: int, team_id: Optional[int]) -> bool:
    query = db.query(TaskTeamClosure.id).filter(TaskTeamClosure.task_id == task_id)
    if team_id is None:
        query = query.filter(TaskTeamClosure.team_id.is_(None))
    else:
        query = query.filter(TaskTeamClosure.team_id == team_id)
    return query.first() is not None


def is_task_closed_for_user(db: Session, task: Task, user: User) -> bool:
    if task.is_archived:
        return True
    if task.auto_closed_at is not None:
        return True
    if task.auto_close_scope != TaskAutoCloseScope.TEAM:
        return False
    if task.auto_close_after_completions is None:
        return False
    return _closure_for_team_exists(db, task.id, user.team_id)


def reset_task_auto_close_state(db: Session, task: Task) -> None:
    task.auto_closed_at = None
    db.query(TaskTeamClosure).filter(TaskTeamClosure.task_id == task.id).delete()
    db.add(task)


def reset_task_auto_close_counters(db: Session, task: Task) -> None:
    reset_task_auto_close_state(db, task)
    task.auto_close_reset_at = datetime.now(timezone.utc).replace(tzinfo=None)
    db.add(task)


def _approved_completion_sum_query(db: Session, task: Task):
    query = db.query(func.coalesce(func.sum(Completion.count), 0)).filter(
        Completion.task_id == task.id,
        Completion.status == CompletionStatus.APPROVED,
    )
    if task.auto_close_reset_at is not None:
        counted_at = func.coalesce(Completion.reviewed_at, Completion.submitted_at)
        query = query.filter(counted_at >= task.auto_close_reset_at)
    return query


def _approved_completion_count_for_scope(db: Session, task: Task, member: User) -> int:
    query = _approved_completion_sum_query(db, task)
    if task.auto_close_scope == TaskAutoCloseScope.TEAM:
        query = _team_filter(query.join(User, User.id == Completion.member_id), member.team_id)
    return int(query.scalar() or 0)


def get_auto_close_current_count_for_user(db: Session, task: Task, user: User) -> Optional[int]:
    if task.auto_close_after_completions is None or task.auto_close_scope is None:
        return None
    return _approved_completion_count_for_scope(db, task, user)


def would_exceed_auto_close_limit(
    db: Session,
    task: Task,
    member: User,
    *,
    new_status: CompletionStatus,
    new_count: int,
    old_status: Optional[CompletionStatus] = None,
    old_count: int = 0,
) -> bool:
    limit = task.auto_close_after_completions
    scope = task.auto_close_scope
    if limit is None or scope is None:
        return False

    current_total = _approved_completion_count_for_scope(db, task, member)
    old_contribution = old_count if old_status == CompletionStatus.APPROVED else 0
    new_contribution = new_count if new_status == CompletionStatus.APPROVED else 0
    projected_total = current_total - old_contribution + new_contribution
    return projected_total > limit


def maybe_auto_close_task_for_member(db: Session, task: Task, member: User) -> None:
    limit = task.auto_close_after_completions
    scope = task.auto_close_scope
    if limit is None or scope is None or task.is_archived:
        return

    # Session is configured with autoflush=False in this project.
    # Flush pending completion/status changes so counting uses current state.
    db.flush()

    now = datetime.now(timezone.utc).replace(tzinfo=None)

    if scope == TaskAutoCloseScope.GLOBAL:
        if task.auto_closed_at is not None:
            return
        completions_total = _approved_completion_count_for_scope(db, task, member)
        if completions_total >= limit:
            task.auto_closed_at = now
            db.add(task)
        return

    if _closure_for_team_exists(db, task.id, member.team_id):
        return

    completions_total = _approved_completion_count_for_scope(db, task, member)
    if completions_total >= limit:
        db.add(
            TaskTeamClosure(
                task_id=task.id,
                team_id=member.team_id,
                closed_at=now,
            )
        )
