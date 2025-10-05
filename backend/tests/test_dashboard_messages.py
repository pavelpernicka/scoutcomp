from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import RoleEnum, Team, User


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    body = response.json()
    return body["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_admin_can_create_global_dashboard_message(client, db_session):
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
    db_session.add(admin)
    db_session.commit()

    token = _login(client, "admin", "secret")
    response = client.post(
        "/dashboard-messages",
        json={"title": "Notice", "body": "Hello scouts!"},
        headers=_auth_headers(token),
    )

    assert response.status_code == 201
    body = response.json()
    assert body["team_id"] is None
    assert body["body"] == "Hello scouts!"
    assert body["created_by_username"] == "admin"


def test_group_admin_restricted_to_managed_teams(client, db_session):
    team_alpha = Team(name="Alpha", join_code="ALPHA123")
    team_bravo = Team(name="Bravo", join_code="BRAVO123")
    db_session.add_all([team_alpha, team_bravo])
    db_session.flush()

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
    db_session.add(group_admin)
    db_session.commit()

    token = _login(client, "leader", "secret")
    headers = _auth_headers(token)

    disallowed = client.post(
        "/dashboard-messages",
        json={"title": "Global", "body": "General info"},
        headers=headers,
    )
    assert disallowed.status_code == 403

    other_team_attempt = client.post(
        "/dashboard-messages",
        json={"title": "Wrong team", "body": "Info", "team_id": team_bravo.id},
        headers=headers,
    )
    assert other_team_attempt.status_code == 403

    allowed = client.post(
        "/dashboard-messages",
        json={"title": "Alpha news", "body": "Stay ready!", "team_id": team_alpha.id},
        headers=headers,
    )
    assert allowed.status_code == 201
    created = allowed.json()
    assert created["team_id"] == team_alpha.id


def test_dashboard_message_update_respects_permissions(client, db_session):
    team_alpha = Team(name="TeamOne", join_code="TEAMONE1")
    db_session.add(team_alpha)
    db_session.flush()

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
    group_admin = User(
        username="captain",
        email="captain@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.GROUP_ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name="Test Captain",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    group_admin.managed_teams.append(team_alpha)
    db_session.add_all([admin, group_admin])
    db_session.commit()

    admin_token = _login(client, "admin", "secret")
    group_token = _login(client, "captain", "secret")

    create_response = client.post(
        "/dashboard-messages",
        json={"title": "Briefing", "body": "Initial", "team_id": team_alpha.id},
        headers=_auth_headers(admin_token),
    )
    assert create_response.status_code == 201
    message_id = create_response.json()["id"]

    update_response = client.patch(
        f"/dashboard-messages/{message_id}",
        json={"body": "Updated info", "team_id": None},
        headers=_auth_headers(admin_token),
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["team_id"] is None
    assert updated["body"] == "Updated info"

    forbidden_change = client.patch(
        f"/dashboard-messages/{message_id}",
        json={"body": "Group tries"},
        headers=_auth_headers(group_token),
    )
    assert forbidden_change.status_code == 403

    group_create = client.post(
        "/dashboard-messages",
        json={"title": "Alpha", "body": "Initial", "team_id": team_alpha.id},
        headers=_auth_headers(group_token),
    )
    assert group_create.status_code == 201
    group_message_id = group_create.json()["id"]

    group_update = client.patch(
        f"/dashboard-messages/{group_message_id}",
        json={"body": "Edited by group", "title": "  Alpha Alert  "},
        headers=_auth_headers(group_token),
    )
    assert group_update.status_code == 200
    result = group_update.json()
    assert result["body"] == "Edited by group"
    assert result["title"] == "Alpha Alert"

    make_global_attempt = client.patch(
        f"/dashboard-messages/{group_message_id}",
        json={"team_id": None},
        headers=_auth_headers(group_token),
    )
    assert make_global_attempt.status_code == 403
