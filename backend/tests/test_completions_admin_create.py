from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import Completion, CompletionStatus, RoleEnum, Task, Team, User


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_create_completion_for_user(client, db_session):
    team = Team(name="Alpha", description="Test", join_code="JOINALPHA")
    admin = User(
        username="admin",
        email="admin@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name="Test Admin",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    member = User(
        username="member",
        email="member@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        team=team,
        is_active=True,
        real_name="Test Member",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    task = Task(
        name="Log fire",
        description="",
        points_per_completion=5,
        team=team,
    )

    db_session.add_all([team, admin, member, task])
    db_session.commit()

    token = _login(client, "admin", "secret")

    response = client.post(
        f"/completions/users/{member.id}",
        json={
            "task_id": task.id,
            "count": 3,
            "status": "approved",
            "admin_note": "Manual entry",
        },
        headers=_auth_headers(token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["task_id"] == task.id
    assert body["member_id"] == member.id
    assert body["status"] == "approved"
    assert body["count"] == 3
    assert body["points_awarded"] == 15

    stored = db_session.query(Completion).filter(Completion.id == body["id"]).one()
    assert stored.status == CompletionStatus.APPROVED
    assert stored.points_awarded == 15
    assert stored.reviewer_id == admin.id


def test_group_admin_cannot_create_for_foreign_team(client, db_session):
    team_alpha = Team(name="Alpha", description="", join_code="ALPHA123")
    team_bravo = Team(name="Bravo", description="", join_code="BRAVO123")
    group_admin = User(
        username="leader",
        email="leader@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.GROUP_ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name="Test Group Admin",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    group_admin.managed_teams.append(team_alpha)
    member = User(
        username="other",
        email="other@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        team=team_bravo,
        is_active=True,
        real_name="Test Other Member",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    task = Task(
        name="Task",
        description="",
        points_per_completion=2,
        team=team_bravo,
    )

    db_session.add_all([team_alpha, team_bravo, group_admin, member, task])
    db_session.commit()

    token = _login(client, "leader", "secret")

    response = client.post(
        f"/completions/users/{member.id}",
        json={"task_id": task.id, "count": 1},
        headers=_auth_headers(token),
    )

    assert response.status_code == 403


def test_group_admin_can_create_for_managed_team(client, db_session):
    team_alpha = Team(name="Alpha", description="", join_code="ALPHA567")
    group_admin = User(
        username="leader",
        email="leader@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.GROUP_ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name="Test Group Admin",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    group_admin.managed_teams.append(team_alpha)
    member = User(
        username="scout",
        email="scout@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        team=team_alpha,
        is_active=True,
        real_name="Test Scout",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    task = Task(
        name="Signal fire",
        description="",
        points_per_completion=4,
        team=team_alpha,
    )

    db_session.add_all([team_alpha, group_admin, member, task])
    db_session.commit()

    token = _login(client, "leader", "secret")

    response = client.post(
        f"/completions/users/{member.id}",
        json={"task_id": task.id, "count": 2, "status": "approved"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["points_awarded"] == 8
    assert body["status"] == "approved"
