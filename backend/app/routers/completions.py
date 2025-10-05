from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload

from ..dependencies import (
    get_current_active_user,
    get_db,
    get_managed_team_ids,
    require_admin_or_group_admin,
)
from ..models import Completion, CompletionStatus, Notification, RoleEnum, Task, User
from ..schemas import (
    CompletionAdminCreate,
    CompletionAdminUpdate,
    CompletionPublic,
    CompletionReview,
)


def _populate_member_info(completion: Completion) -> Completion:
    """Populate member team_name for display"""
    if completion.member:
        if hasattr(completion.member, 'team') and completion.member.team:
            setattr(completion.member, 'team_name', completion.member.team.name)
        else:
            setattr(completion.member, 'team_name', None)
    return completion

router = APIRouter(prefix="/completions", tags=["completions"])


@router.get("/pending", response_model=List[CompletionPublic])
def list_pending(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> List[Completion]:
    query = (
        db.query(Completion)
        .options(joinedload(Completion.task), joinedload(Completion.member).joinedload(User.team))
        .filter(Completion.status == CompletionStatus.PENDING)
        .order_by(Completion.submitted_at.asc())
    )
    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids:
            return []
        query = query.join(User, Completion.member_id == User.id).filter(User.team_id.in_(managed_ids))

    completions = query.all()
    return [_populate_member_info(completion) for completion in completions]


@router.patch("/{completion_id}", response_model=CompletionPublic)
def review_completion(
    completion_id: int,
    payload: CompletionReview,
    db: Session = Depends(get_db),
    reviewer: User = Depends(require_admin_or_group_admin),
) -> Completion:
    completion = (
        db.query(Completion)
        .options(joinedload(Completion.task), joinedload(Completion.member).joinedload(User.team))
        .filter(Completion.id == completion_id)
        .first()
    )
    if not completion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Completion not found")
    if payload.status == CompletionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot revert to pending")

    if completion.task is None or completion.member is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Completion is missing related task or member",
        )

    if reviewer.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(reviewer)
        if not managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No managed teams configured")
        if completion.member.team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Completion outside managed teams")

    completion.status = payload.status
    completion.admin_note = payload.admin_note
    completion.reviewer_id = reviewer.id
    completion.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)

    message = None
    if payload.status == CompletionStatus.APPROVED:
        completion.points_awarded = completion.task.points_per_completion * completion.count
        message = (
            f"Your completion of '{completion.task.name}' ({completion.count}x) "
            f"was approved. +{completion.points_awarded:g} points."
        )
    else:
        completion.points_awarded = 0
        reason = payload.admin_note or "No reason provided."
        message = (
            f"Your completion of '{completion.task.name}' was rejected. Reason: {reason}"
        )

    notification = Notification(
        user_id=completion.member_id,
        message=message,
        sender_id=reviewer.id,
    )

    db.add(completion)
    db.add(notification)
    db.commit()
    db.refresh(completion)
    return _populate_member_info(completion)


@router.get("/me", response_model=List[CompletionPublic])
def list_my_completions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[Completion]:
    completions = (
        db.query(Completion)
        .options(joinedload(Completion.task), joinedload(Completion.member).joinedload(User.team))
        .filter(Completion.member_id == current_user.id)
        .order_by(Completion.submitted_at.desc())
        .all()
    )
    return [_populate_member_info(completion) for completion in completions]


@router.get("/users/{user_id}", response_model=List[CompletionPublic])
def list_user_completions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> List[Completion]:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids or (user.team_id not in managed_ids and user.team_id is not None):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside managed teams")

    completions = (
        db.query(Completion)
        .options(joinedload(Completion.task), joinedload(Completion.member).joinedload(User.team))
        .filter(Completion.member_id == user_id)
        .order_by(Completion.submitted_at.desc())
        .all()
    )
    return [_populate_member_info(completion) for completion in completions]


@router.post("/users/{user_id}", response_model=CompletionPublic, status_code=status.HTTP_201_CREATED)
def create_user_completion(
    user_id: int,
    payload: CompletionAdminCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> Completion:
    member = db.get(User, user_id)
    if not member:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids or (member.team_id not in managed_ids and member.team_id is not None):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside managed teams")

    task = db.get(Task, payload.task_id)
    if not task:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Task not found")

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if task.team_id is not None and task.team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Task outside managed teams")

    status_value = payload.status or CompletionStatus.APPROVED
    if status_value == CompletionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status cannot be pending")

    submitted_at = datetime.now(timezone.utc).replace(tzinfo=None)
    completion = Completion(
        task_id=task.id,
        member_id=member.id,
        member_note=payload.member_note,
        admin_note=payload.admin_note,
        count=payload.count,
        status=status_value,
        submitted_at=submitted_at,
        reviewer_id=current_user.id,
        reviewed_at=submitted_at,
    )

    if status_value == CompletionStatus.APPROVED:
        completion.points_awarded = task.points_per_completion * payload.count
        message = (
            f"An admin recorded a completion of '{task.name}' ({payload.count}x). "
            f"+{completion.points_awarded:g} points."
        )
    else:
        completion.points_awarded = 0
        reason = payload.admin_note or "Marked as rejected"
        message = f"An admin added a completion of '{task.name}' but marked it rejected. Reason: {reason}"

    notification = Notification(
        user_id=member.id,
        message=message,
        sender_id=current_user.id,
    )

    db.add(completion)
    db.add(notification)
    db.commit()
    db.refresh(completion)

    # Load the completion with member and team info for response
    completion = (
        db.query(Completion)
        .options(joinedload(Completion.task), joinedload(Completion.member).joinedload(User.team))
        .filter(Completion.id == completion.id)
        .first()
    )
    return _populate_member_info(completion)


@router.patch("/users/{user_id}/{completion_id}", response_model=CompletionPublic)
def update_user_completion(
    user_id: int,
    completion_id: int,
    payload: CompletionAdminUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> Completion:
    completion = (
        db.query(Completion)
        .options(joinedload(Completion.task), joinedload(Completion.member).joinedload(User.team))
        .filter(Completion.id == completion_id, Completion.member_id == user_id)
        .first()
    )
    if not completion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Completion not found")

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids or completion.member.team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Completion outside managed teams")

    if payload.count is None and payload.status is None and payload.admin_note is None:
        return completion

    if payload.status == CompletionStatus.PENDING:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Status cannot be set to pending")

    if payload.count is not None:
        completion.count = payload.count

    status_changed = False
    if payload.status is not None and completion.status != payload.status:
        completion.status = payload.status
        completion.reviewed_at = datetime.now(timezone.utc).replace(tzinfo=None)
        completion.reviewer_id = current_user.id
        status_changed = True

    if payload.admin_note is not None:
        completion.admin_note = payload.admin_note

    if payload.count is not None or status_changed:
        if completion.status == CompletionStatus.APPROVED and completion.task:
            completion.points_awarded = completion.task.points_per_completion * completion.count
        else:
            completion.points_awarded = 0

    db.add(completion)
    db.commit()
    db.refresh(completion)
    return _populate_member_info(completion)


@router.delete("/users/{user_id}/{completion_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user_completion(
    user_id: int,
    completion_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> None:
    completion = (
        db.query(Completion)
        .options(joinedload(Completion.member))
        .filter(Completion.id == completion_id, Completion.member_id == user_id)
        .first()
    )
    if not completion:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Completion not found")

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids or completion.member.team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Completion outside managed teams")

    db.delete(completion)
    db.commit()
