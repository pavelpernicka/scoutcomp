from datetime import datetime, timezone

from app.core.security import create_access_token
from app.models import RoleEnum, Task, Team, User


def _auth_headers_for_user(user: User) -> dict[str, str]:
    token, _expires = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _active_user(
    *,
    username: str,
    email: str,
    role: RoleEnum,
    real_name: str,
    team: Team | None = None,
) -> User:
    return User(
        username=username,
        email=email,
        password_hash="test-hash",
        role=role,
        preferred_language="cs",
        is_active=True,
        real_name=real_name,
        team=team,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def _seed_group_admin_with_managed_team(db_session):
    team_alpha = Team(name="Alpha", description="", join_code="ALPHA123")
    group_admin = _active_user(
        username="leader",
        email="leader@example.com",
        role=RoleEnum.GROUP_ADMIN,
        real_name="Group Leader",
    )
    group_admin.managed_teams.append(team_alpha)
    member_alpha = _active_user(
        username="alpha_member",
        email="alpha_member@example.com",
        role=RoleEnum.MEMBER,
        real_name="Alpha Member",
        team=team_alpha,
    )
    member_without_team = _active_user(
        username="no_team_member",
        email="no_team_member@example.com",
        role=RoleEnum.MEMBER,
        real_name="No Team Member",
    )
    db_session.add_all([team_alpha, group_admin, member_alpha, member_without_team])
    db_session.commit()
    return team_alpha, group_admin, member_alpha, member_without_team


def test_group_admin_list_users_excludes_users_without_team(client, db_session):
    team_alpha, group_admin, member_alpha, member_without_team = _seed_group_admin_with_managed_team(db_session)

    response = client.get("/users", headers=_auth_headers_for_user(group_admin))

    assert response.status_code == 200
    body = response.json()
    returned_ids = {user["id"] for user in body}
    assert member_alpha.id in returned_ids
    assert member_without_team.id not in returned_ids
    assert all(user["team_id"] == team_alpha.id for user in body)


def test_group_admin_cannot_get_user_without_team(client, db_session):
    _team_alpha, group_admin, _member_alpha, member_without_team = _seed_group_admin_with_managed_team(db_session)

    response = client.get(
        f"/users/{member_without_team.id}",
        headers=_auth_headers_for_user(group_admin),
    )

    assert response.status_code == 403


def test_group_admin_cannot_update_user_without_team(client, db_session):
    _team_alpha, group_admin, _member_alpha, member_without_team = _seed_group_admin_with_managed_team(db_session)

    response = client.patch(
        f"/users/{member_without_team.id}",
        json={"real_name": "Updated Name"},
        headers=_auth_headers_for_user(group_admin),
    )

    assert response.status_code == 403


def test_group_admin_cannot_remove_team_assignment(client, db_session):
    _team_alpha, group_admin, member_alpha, _member_without_team = _seed_group_admin_with_managed_team(db_session)

    response = client.patch(
        f"/users/{member_alpha.id}",
        json={"team_id": None},
        headers=_auth_headers_for_user(group_admin),
    )

    assert response.status_code == 403


def test_group_admin_cannot_notify_user_without_team(client, db_session):
    _team_alpha, group_admin, _member_alpha, member_without_team = _seed_group_admin_with_managed_team(db_session)

    response = client.post(
        f"/notifications/users/{member_without_team.id}",
        json={"message": "Test message"},
        headers=_auth_headers_for_user(group_admin),
    )

    assert response.status_code == 403


def test_group_admin_cannot_create_completion_for_user_without_team(client, db_session):
    team_alpha, group_admin, _member_alpha, member_without_team = _seed_group_admin_with_managed_team(db_session)
    task = Task(
        name="Scoped task",
        description="",
        points_per_completion=3,
        team=team_alpha,
    )
    db_session.add(task)
    db_session.commit()

    response = client.post(
        f"/completions/users/{member_without_team.id}",
        json={"task_id": task.id, "count": 1, "status": "approved"},
        headers=_auth_headers_for_user(group_admin),
    )

    assert response.status_code == 403
