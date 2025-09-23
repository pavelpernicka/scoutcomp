import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..dependencies import (
    get_current_active_user,
    get_db,
    get_managed_team_ids,
    require_admin,
    require_admin_or_group_admin,
)
from ..models import RoleEnum, Team, User
from ..schemas import TeamCreate, TeamJoinRequest, TeamPublic, TeamUpdate

router = APIRouter(prefix="/teams", tags=["teams"])


def _generate_join_code(db: Session, length: int = 8) -> str:
    while True:
        candidate = secrets.token_hex(length // 2).upper()
        if not db.query(Team).filter(Team.join_code == candidate).first():
            return candidate


@router.get("/", response_model=List[TeamPublic])
@router.get("", response_model=List[TeamPublic], include_in_schema=False)
def list_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_group_admin),
) -> List[Team]:
    query = db.query(Team).order_by(Team.name)
    if current_user.role == RoleEnum.GROUP_ADMIN:
        managed_ids = get_managed_team_ids(current_user)
        if not managed_ids:
            return []
        query = query.filter(Team.id.in_(managed_ids))
    return query.all()


@router.post("/", response_model=TeamPublic, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=TeamPublic, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_team(
    payload: TeamCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Team:
    team = Team(name=payload.name, description=payload.description, join_code=_generate_join_code(db))
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.patch("/{team_id}", response_model=TeamPublic)
def update_team(
    team_id: int,
    payload: TeamUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Team:
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    if payload.name is not None:
        team.name = payload.name
    if payload.description is not None:
        team.description = payload.description
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> None:
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    db.delete(team)
    db.commit()


@router.post("/{team_id}/invite", response_model=TeamPublic)
def rotate_join_code(
    team_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
) -> Team:
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    team.join_code = _generate_join_code(db)
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.post("/join", response_model=TeamPublic)
def join_team(
    payload: TeamJoinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> Team:
    team = db.query(Team).filter(Team.join_code == payload.join_code).first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    current_user.team_id = team.id
    db.add(current_user)
    db.commit()
    db.refresh(team)
    return team
