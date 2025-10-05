from typing import List

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from ..dependencies import get_current_active_user, get_db
from ..models import (
    Completion,
    CompletionStatus,
    RoleEnum,
    StatCategory,
    StatCategoryComponent,
    StatMetricEnum,
    Task,
    Team,
    User,
)
from ..schemas import LeaderboardEntry

router = APIRouter(prefix="/leaderboard", tags=["leaderboard"])


@router.get("/members", response_model=List[LeaderboardEntry])
def member_leaderboard(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> List[LeaderboardEntry]:
    rows = (
        db.query(
            User.id.label("entity_id"),
            User.real_name.label("name"),
            func.coalesce(func.sum(Completion.points_awarded), 0).label("score"),
        )
        .outerjoin(
            Completion,
            (Completion.member_id == User.id) & (Completion.status == CompletionStatus.APPROVED),
        )
        .group_by(User.id)
        .order_by(func.coalesce(func.sum(Completion.points_awarded), 0).desc())
        .all()
    )
    return [
        LeaderboardEntry(
            entity_id=row.entity_id,
            name=row.name,
            score=float(row.score or 0),
            rank=index + 1,
        )
        for index, row in enumerate(rows)
    ]


@router.get("/team-members", response_model=List[LeaderboardEntry])
def team_member_leaderboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> List[LeaderboardEntry]:
    if not current_user.team_id:
        return []

    rows = (
        db.query(
            User.id.label("entity_id"),
            User.real_name.label("name"),
            func.coalesce(func.sum(Completion.points_awarded), 0).label("score"),
            func.coalesce(func.count(Completion.id), 0).label("completion_count"),
        )
        .outerjoin(
            Completion,
            (Completion.member_id == User.id) & (Completion.status == CompletionStatus.APPROVED),
        )
        .filter(User.team_id == current_user.team_id)
        .group_by(User.id)
        .order_by(func.coalesce(func.sum(Completion.points_awarded), 0).desc())
        .all()
    )
    return [
        LeaderboardEntry(
            entity_id=row.entity_id,
            name=row.name,
            score=float(row.score or 0),
            rank=index + 1,
            member_count=int(row.completion_count or 0),
        )
        for index, row in enumerate(rows)
    ]


@router.get("/user/{user_id}/task-completions")
def get_user_task_completions(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    # Check if the user exists and is in the same team as current user
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Allow any authenticated user to view task completions of any other user
    # This makes the leaderboard feature more open and social
    pass

    # Get task completion counts grouped by task
    task_completions = (
        db.query(
            Completion.task_id,
            func.count(Completion.id).label("completion_count"),
            func.sum(Completion.points_awarded).label("total_points"),
        )
        .join(Task, Task.id == Completion.task_id)
        .filter(
            Completion.member_id == user_id,
            Completion.status == CompletionStatus.APPROVED
        )
        .group_by(Completion.task_id)
        .all()
    )

    # Get task names
    task_ids = [tc.task_id for tc in task_completions]
    if not task_ids:
        return {"user_id": user_id, "username": user.username, "real_name": user.real_name, "task_completions": []}

    tasks = (
        db.query(Task.id, Task.name)
        .filter(Task.id.in_(task_ids))
        .all()
    )
    task_names = {task.id: task.name for task in tasks}

    result = {
        "user_id": user_id,
        "username": user.username,
        "real_name": user.real_name,
        "task_completions": [
            {
                "task_id": tc.task_id,
                "task_name": task_names.get(tc.task_id, f"Task #{tc.task_id}"),
                "completion_count": tc.completion_count,
                "total_points": float(tc.total_points or 0)
            }
            for tc in task_completions
        ]
    }

    return result


@router.get("/team-activity")
def get_team_recent_activity(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    if not current_user.team_id:
        return {"activities": []}

    # Get recent approved completions from team members (last 7 days)
    from datetime import datetime, timedelta, timezone
    week_ago = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)

    recent_completions = (
        db.query(Completion)
        .options(
            joinedload(Completion.task),
            joinedload(Completion.member)
        )
        .join(User, Completion.member_id == User.id)
        .filter(
            User.team_id == current_user.team_id,
            Completion.status == CompletionStatus.APPROVED,
            Completion.reviewed_at >= week_ago
        )
        .order_by(Completion.reviewed_at.desc())
        .limit(20)
        .all()
    )

    # Get team stats for motivation
    total_points_this_week = sum(c.points_awarded for c in recent_completions)
    total_completions_this_week = len(recent_completions)
    active_members = len(set(c.member_id for c in recent_completions))

    # Format activities
    activities = []
    for completion in recent_completions:
        time_ago = datetime.now(timezone.utc).replace(tzinfo=None) - completion.reviewed_at
        if time_ago.days > 0:
            time_str = f"{time_ago.days} day{'s' if time_ago.days > 1 else ''} ago"
        elif time_ago.seconds > 3600:
            hours = time_ago.seconds // 3600
            time_str = f"{hours} hour{'s' if hours > 1 else ''} ago"
        else:
            minutes = time_ago.seconds // 60
            time_str = f"{minutes} minute{'s' if minutes > 1 else ''} ago" if minutes > 0 else "just now"

        activities.append({
            "id": completion.id,
            "member_name": completion.member.real_name or completion.member.username if completion.member else "Unknown",
            "task_name": completion.task.name if completion.task else "Unknown Task",
            "points": completion.points_awarded,
            "count": completion.count,
            "time_ago": time_str,
            "is_current_user": completion.member_id == current_user.id
        })

    return {
        "activities": activities,
        "stats": {
            "total_points_this_week": total_points_this_week,
            "total_completions_this_week": total_completions_this_week,
            "active_members": active_members,
            "team_name": current_user.team.name if hasattr(current_user, 'team') and current_user.team else None
        }
    }


@router.get("/team/{team_id}/members", response_model=List[LeaderboardEntry])
def get_team_members_leaderboard(
    team_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> List[LeaderboardEntry]:
    # Check if team exists
    team = db.get(Team, team_id)
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    rows = (
        db.query(
            User.id.label("entity_id"),
            User.real_name.label("name"),
            func.coalesce(func.sum(Completion.points_awarded), 0).label("score"),
            func.coalesce(func.count(Completion.id), 0).label("completion_count"),
        )
        .outerjoin(
            Completion,
            (Completion.member_id == User.id) & (Completion.status == CompletionStatus.APPROVED),
        )
        .filter(User.team_id == team_id)
        .group_by(User.id)
        .order_by(func.coalesce(func.sum(Completion.points_awarded), 0).desc())
        .all()
    )
    return [
        LeaderboardEntry(
            entity_id=row.entity_id,
            name=row.name,
            score=float(row.score or 0),
            rank=index + 1,
            member_count=int(row.completion_count or 0),
        )
        for index, row in enumerate(rows)
    ]


@router.get("/teams", response_model=List[LeaderboardEntry])
def team_leaderboard(
    mode: str = Query(default="total", pattern="^(total|average)$"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> List[LeaderboardEntry]:
    rows = (
        db.query(
            Team.id.label("entity_id"),
            Team.name.label("name"),
            func.coalesce(func.sum(Completion.points_awarded), 0).label("total_points"),
            func.count(func.distinct(User.id)).label("member_count"),
        )
        .outerjoin(User, User.team_id == Team.id)
        .outerjoin(
            Completion,
            (Completion.member_id == User.id) & (Completion.status == CompletionStatus.APPROVED),
        )
        .group_by(Team.id)
        .all()
    )

    entries = []
    for row in rows:
        total_points = float(row.total_points or 0)
        member_count = int(row.member_count or 0)
        if mode == "average" and member_count > 0:
            score = total_points / member_count
        else:
            score = total_points
        entries.append(
            {
                "entity_id": row.entity_id,
                "name": row.name,
                "score": score,
                "total_points": total_points,
                "member_count": member_count,
            }
        )

    entries.sort(key=lambda item: item["score"], reverse=True)

    results: List[LeaderboardEntry] = []
    for index, entry in enumerate(entries):
        results.append(
            LeaderboardEntry(
                entity_id=entry["entity_id"],
                name=entry["name"],
                score=float(entry["score"] or 0),
                rank=index + 1,
                member_count=entry["member_count"],
                total_points=entry["total_points"],
            )
        )
    return results


@router.get("/stats/{category_id}", response_model=List[LeaderboardEntry])
def stats_leaderboard(
    category_id: int,
    scope: str = Query(default="members", pattern="^(members|teams)$"),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
) -> List[LeaderboardEntry]:
    category = (
        db.query(StatCategory)
        .options(joinedload(StatCategory.components))
        .filter(StatCategory.id == category_id)
        .first()
    )
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")

    components = category.components
    if not components:
        return []

    task_ids = {component.task_id for component in components}
    if not task_ids:
        return []

    completion_rows = (
        db.query(
            Completion.member_id,
            Completion.task_id,
            func.coalesce(func.sum(Completion.count), 0).label("sum_count"),
            func.coalesce(func.sum(Completion.points_awarded), 0).label("sum_points"),
        )
        .filter(
            Completion.task_id.in_(task_ids),
            Completion.status == CompletionStatus.APPROVED,
        )
        .group_by(Completion.member_id, Completion.task_id)
        .all()
    )

    if not completion_rows:
        return []

    metrics_by_member: dict[int, dict[int, dict[str, float]]] = {}
    member_ids = set()
    for row in completion_rows:
        member_id = row.member_id
        task_id = row.task_id
        member_ids.add(member_id)
        task_map = metrics_by_member.setdefault(member_id, {})
        task_map[task_id] = {
            "points": float(row.sum_points or 0),
            "count": float(row.sum_count or 0),
        }

    if not member_ids:
        return []

    users = (
        db.query(User.id, User.username, User.real_name, User.team_id)
        .filter(User.id.in_(member_ids))
        .all()
    )
    user_lookup = {user.id: user for user in users}

    scores_by_member: dict[int, dict[str, float]] = {}
    for member_id, task_values in metrics_by_member.items():
        total_score = 0.0
        raw_value = 0.0
        for component in components:
            metrics = task_values.get(component.task_id)
            metric_value = 0.0
            if metrics:
                if component.metric == StatMetricEnum.POINTS:
                    metric_value = metrics["points"]
                else:
                    metric_value = metrics["count"]
            total_score += component.weight * metric_value
            raw_value += metric_value
        if member_id in user_lookup and (raw_value != 0 or total_score != 0):
            scores_by_member[member_id] = {
                "score": total_score,
                "raw": raw_value,
            }

    if not scores_by_member:
        return []

    if scope == "teams":
        team_scores: dict[int, dict[str, object]] = {}
        for member_id, aggregates in scores_by_member.items():
            user = user_lookup.get(member_id)
            if not user or user.team_id is None:
                continue
            data = team_scores.setdefault(
                user.team_id,
                {"score": 0.0, "total": 0.0, "member_ids": set()},
            )
            data["score"] += aggregates["score"]
            data["total"] += aggregates["raw"]
            data["member_ids"].add(member_id)

        if not team_scores:
            return []

        team_rows = db.query(Team.id, Team.name).filter(Team.id.in_(team_scores.keys())).all()
        team_lookup = {team.id: team.name for team in team_rows}

        entries = []
        for team_id, aggregates in team_scores.items():
            team_name = team_lookup.get(team_id)
            if not team_name:
                continue
            score_value = float(aggregates["score"] or 0.0)
            total_value = float(aggregates["total"] or 0.0)
            member_count = len(aggregates["member_ids"])
            entries.append(
                {
                    "entity_id": team_id,
                    "name": team_name,
                    "score": score_value,
                    "total_points": total_value,
                    "member_count": member_count,
                }
            )

        entries.sort(key=lambda item: item["score"], reverse=True)
        limited = entries[:limit]
        return [
            LeaderboardEntry(
                entity_id=item["entity_id"],
                name=item["name"],
                score=float(item["score"]),
                rank=index + 1,
                member_count=item["member_count"],
                total_points=float(item["total_points"]),
            )
            for index, item in enumerate(limited)
        ]

    # members scope
    member_entries = []
    for member_id, aggregates in scores_by_member.items():
        user = user_lookup.get(member_id)
        if not user:
            continue
        member_entries.append(
            {
                "entity_id": member_id,
                "name": user.real_name or user.username,
                "score": float(aggregates["score"]),
                "total_points": float(aggregates["raw"]),
            }
        )

    member_entries.sort(key=lambda item: item["score"], reverse=True)
    limited_members = member_entries[:limit]
    return [
        LeaderboardEntry(
            entity_id=item["entity_id"],
            name=item["name"],
            score=float(item["score"]),
            rank=index + 1,
            total_points=float(item["total_points"]),
        )
        for index, item in enumerate(limited_members)
    ]
