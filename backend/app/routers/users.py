from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..dependencies import (
    get_current_active_user,
    get_db,
    get_managed_team_ids,
    require_admin,
    require_admin_or_group_admin,
)
from ..models import Completion, CompletionStatus, RoleEnum, Team, User
from ..schemas import MeResponse, ScoreSummary, UserCreate, UserPublic, UserUpdate
from ..core.security import get_password_hash

router = APIRouter(prefix="/users", tags=["users"])


def _user_to_public(user: User) -> UserPublic:
    return UserPublic(
        id=user.id,
        username=user.username,
        email=user.email,
        preferred_language=user.preferred_language,
        role=user.role,
        team_id=user.team_id,
        is_active=user.is_active,
        created_at=user.created_at,
        updated_at=user.updated_at,
        managed_team_ids=[team.id for team in getattr(user, "managed_teams", [])],
        team_name=user.team.name if hasattr(user, 'team') and user.team else None,
    )


def _set_managed_teams(db: Session, user: User, team_ids: Optional[List[int]]) -> None:
    if team_ids is None:
        return
    unique_ids = list(dict.fromkeys(team_ids))
    if not unique_ids:
        user.managed_teams = []
        return
    teams = db.query(Team).filter(Team.id.in_(unique_ids)).all()
    if len(teams) != len(unique_ids):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="One or more teams not found")
    user.managed_teams = teams


def _assert_group_admin_can_manage(current_user: User, target_user: User) -> None:
    if current_user.role != RoleEnum.GROUP_ADMIN:
        return
    allowed = get_managed_team_ids(current_user)
    if target_user.id == current_user.id:
        return
    if not allowed or (target_user.team_id not in allowed):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside managed teams")


@router.get("/me", response_model=MeResponse)
def read_current_user(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> MeResponse:
    if current_user.team_id:
        current_user = db.query(User).options(joinedload(User.team)).filter(User.id == current_user.id).first()
    total_points = (
        db.query(func.coalesce(func.sum(Completion.points_awarded), 0))
        .filter(Completion.member_id == current_user.id, Completion.status == CompletionStatus.APPROVED)
        .scalar()
    )

    member_scores = (
        db.query(
            Completion.member_id.label("member_id"),
            func.coalesce(func.sum(Completion.points_awarded), 0).label("score"),
        )
        .filter(Completion.status == CompletionStatus.APPROVED)
        .group_by(Completion.member_id)
        .subquery()
    )

    member_rank = None
    member_score_row = (
        db.query(member_scores.c.score)
        .filter(member_scores.c.member_id == current_user.id)
        .one_or_none()
    )
    if member_score_row:
        higher = (
            db.query(func.count())
            .select_from(member_scores)
            .filter(member_scores.c.score > member_score_row.score)
            .scalar()
        )
        member_rank = (higher or 0) + 1

    team_rank = None
    if current_user.team_id:
        team_scores = (
            db.query(
                Team.id.label("team_id"),
                func.coalesce(func.sum(Completion.points_awarded), 0).label("score"),
            )
            .join(User, User.team_id == Team.id)
            .outerjoin(
                Completion,
                (Completion.member_id == User.id) & (Completion.status == CompletionStatus.APPROVED),
            )
            .group_by(Team.id)
            .subquery()
        )
        team_score_row = (
            db.query(team_scores.c.score)
            .filter(team_scores.c.team_id == current_user.team_id)
            .one_or_none()
        )
        if team_score_row:
            higher_teams = (
                db.query(func.count())
                .select_from(team_scores)
                .filter(team_scores.c.score > team_score_row.score)
                .scalar()
            )
            team_rank = (higher_teams or 0) + 1

    return MeResponse(
        user=_user_to_public(current_user),
        scoreboard=ScoreSummary(
            total_points=float(total_points or 0),
            member_rank=member_rank,
            team_rank=team_rank,
        ),
    )


@router.get("/", response_model=List[UserPublic])
@router.get("", response_model=List[UserPublic], include_in_schema=False)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
    team_id: Optional[int] = Query(default=None),
    role: Optional[RoleEnum] = Query(default=None),
) -> List[User]:
    query = db.query(User)
    managed_ids: set[int] = set()

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids:
            return []
        query = query.filter(or_(User.team_id == None, User.team_id.in_(managed_ids)))  # noqa: E711

    if team_id is not None:
        if current_user.role == RoleEnum.GROUP_ADMIN and team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        query = query.filter(User.team_id == team_id)

    if role is not None:
        query = query.filter(User.role == role)

    return query.all()


@router.get("/{user_id}", response_model=UserPublic)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids or (user.team_id not in managed_ids and user.team_id is not None):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside managed teams")

    return user


@router.post("/", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=UserPublic, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> User:
    if payload.team_id is not None:
        team = db.get(Team, payload.team_id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        preferred_language=payload.preferred_language,
        team_id=payload.team_id,
        role=payload.role,
    )
    db.add(user)
    try:
        db.flush()
        if payload.managed_team_ids is not None:
            if payload.role != RoleEnum.GROUP_ADMIN:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Managed teams can only be assigned to group admins",
                )
            _set_managed_teams(db, user, payload.managed_team_ids)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists") from exc
    db.refresh(user)
    return user


@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> User:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No managed teams configured",
            )
        if user.team_id not in managed_ids and user.team_id is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User outside managed teams",
            )
        if payload.team_id is not None and payload.team_id not in managed_ids:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Team outside managed scope",
            )
        forbidden_updates = [
            payload.username,
            payload.email,
            payload.role,
            payload.password,
            payload.preferred_language,
            payload.is_active,
            payload.managed_team_ids,
        ]
        if any(value is not None for value in forbidden_updates):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Group admins cannot modify roles, credentials, or managed teams",
            )

    if payload.username is not None:
        if current_user.role != RoleEnum.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins may change usernames")
        user.username = payload.username

    if payload.email is not None:
        if current_user.role != RoleEnum.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins may change emails")
        user.email = payload.email

    if payload.password:
        if current_user.role != RoleEnum.ADMIN and current_user.id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Cannot modify password")
        user.password_hash = get_password_hash(payload.password)
    if payload.preferred_language is not None:
        user.preferred_language = payload.preferred_language
    if payload.team_id is not None:
        if payload.team_id:
            team = db.get(Team, payload.team_id)
            if not team:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
        user.team_id = payload.team_id
    elif "team_id" in payload.model_fields_set:
        user.team_id = None
    if payload.role is not None:
        if current_user.id == user.id and payload.role != RoleEnum.ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Admins cannot remove their own admin role",
            )
        if current_user.role != RoleEnum.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins may change roles")
        user.role = payload.role
        if payload.role != RoleEnum.GROUP_ADMIN:
            user.managed_teams = []
    if payload.is_active is not None:
        if current_user.role != RoleEnum.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins may change activation state")
        user.is_active = payload.is_active

    if payload.managed_team_ids is not None:
        if current_user.role != RoleEnum.ADMIN:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins may update managed teams")
        if user.role != RoleEnum.GROUP_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Managed teams require group admin role",
            )
        _set_managed_teams(db, user, payload.managed_team_ids)

    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists") from exc
    db.refresh(user)
    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if current_user.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")
    db.delete(user)
    db.commit()
