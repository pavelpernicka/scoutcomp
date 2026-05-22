from datetime import datetime, timezone
from typing import Optional

from app.core.security import get_password_hash
from app.models import RoleEnum, Task, TaskAutoCloseScope, Team, User


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _member(username: str, team: Optional[Team] = None) -> User:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return User(
        username=username,
        email=f"{username}@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        is_active=True,
        real_name=username.title(),
        first_login_at=now,
        team=team,
    )


def _admin(username: str = "admin") -> User:
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    return User(
        username=username,
        email=f"{username}@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name=username.title(),
        first_login_at=now,
    )


def test_auto_close_global_after_distinct_members(client, db_session):
    member_one = _member("member_one")
    member_two = _member("member_two")
    task = Task(
        name="global-close-task",
        description="",
        points_per_completion=1,
        auto_close_after_completions=2,
        auto_close_scope=TaskAutoCloseScope.GLOBAL,
    )
    db_session.add_all([member_one, member_two, task])
    db_session.commit()

    token_one = _login(client, "member_one", "secret")
    token_two = _login(client, "member_two", "secret")

    response = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token_one),
    )
    assert response.status_code == 201

    response = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token_two),
    )
    assert response.status_code == 201

    blocked = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token_one),
    )
    assert blocked.status_code == 410

    active = client.get("/tasks?status=active", headers=_auth_headers(token_one))
    assert active.status_code == 200
    returned_task = next(item for item in active.json() if item["id"] == task.id)
    assert returned_task["is_closed_for_user"] is True


def test_auto_close_requires_admin_approval(client, db_session):
    admin = _admin()
    member_one = _member("approve_member_one")
    member_two = _member("approve_member_two")
    member_three = _member("approve_member_three")
    member_four = _member("approve_member_four")
    task = Task(
        name="approval-close-task",
        description="",
        points_per_completion=1,
        requires_approval=True,
        auto_close_after_completions=2,
        auto_close_scope=TaskAutoCloseScope.GLOBAL,
    )
    db_session.add_all([admin, member_one, member_two, member_three, member_four, task])
    db_session.commit()

    token_one = _login(client, "approve_member_one", "secret")
    token_two = _login(client, "approve_member_two", "secret")
    token_three = _login(client, "approve_member_three", "secret")
    admin_token = _login(client, "admin", "secret")

    completion_one = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token_one),
    )
    completion_two = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token_two),
    )
    completion_three = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token_three),
    )
    assert completion_one.status_code == 201
    assert completion_two.status_code == 201
    assert completion_three.status_code == 201

    approve_one = client.patch(
        f"/completions/{completion_one.json()['id']}",
        json={"status": "approved", "admin_note": "ok"},
        headers=_auth_headers(admin_token),
    )
    assert approve_one.status_code == 200

    still_open = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token_three),
    )
    assert still_open.status_code == 201

    approve_two = client.patch(
        f"/completions/{completion_two.json()['id']}",
        json={"status": "approved", "admin_note": "ok"},
        headers=_auth_headers(admin_token),
    )
    assert approve_two.status_code == 200

    token_four = _login(client, "approve_member_four", "secret")
    blocked = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token_four),
    )
    assert blocked.status_code == 410


def test_auto_close_team_scope_closes_only_current_team(client, db_session):
    team_alpha = Team(name="Alpha", description="", join_code="ALPHA001")
    team_bravo = Team(name="Bravo", description="", join_code="BRAVO001")
    alpha_member_one = _member("alpha_member_one", team_alpha)
    alpha_member_two = _member("alpha_member_two", team_alpha)
    bravo_member_one = _member("bravo_member_one", team_bravo)
    task = Task(
        name="team-close-task",
        description="",
        points_per_completion=1,
        auto_close_after_completions=1,
        auto_close_scope=TaskAutoCloseScope.TEAM,
    )
    db_session.add_all([team_alpha, team_bravo, alpha_member_one, alpha_member_two, bravo_member_one, task])
    db_session.commit()

    alpha_token_one = _login(client, "alpha_member_one", "secret")
    alpha_token_two = _login(client, "alpha_member_two", "secret")
    bravo_token_one = _login(client, "bravo_member_one", "secret")

    first_alpha = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(alpha_token_one),
    )
    assert first_alpha.status_code == 201

    blocked_alpha = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(alpha_token_two),
    )
    assert blocked_alpha.status_code == 410

    bravo_still_open = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(bravo_token_one),
    )
    assert bravo_still_open.status_code == 201


def test_submit_rejects_when_auto_close_limit_would_be_exceeded(client, db_session):
    member = _member("exceed_member")
    task = Task(
        name="exceed-task",
        description="",
        points_per_completion=1,
        auto_close_after_completions=5,
        auto_close_scope=TaskAutoCloseScope.GLOBAL,
    )
    db_session.add_all([member, task])
    db_session.commit()

    token = _login(client, "exceed_member", "secret")

    first = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 4},
        headers=_auth_headers(token),
    )
    assert first.status_code == 201

    exceed = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 2},
        headers=_auth_headers(token),
    )
    assert exceed.status_code == 400
    assert "Auto-close limit" in exceed.json()["detail"]

    exact = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(token),
    )
    assert exact.status_code == 201


def test_auto_close_reaches_new_limit_after_limit_change(client, db_session):
    admin = _admin()
    member = _member("limit_change_member")
    task = Task(
        name="limit-change-task",
        description="",
        points_per_completion=1,
        auto_close_after_completions=1,
        auto_close_scope=TaskAutoCloseScope.GLOBAL,
    )
    db_session.add_all([admin, member, task])
    db_session.commit()

    admin_token = _login(client, "admin", "secret")
    member_token = _login(client, "limit_change_member", "secret")

    first = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    assert first.status_code == 201

    blocked_after_first = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    assert blocked_after_first.status_code == 410

    update = client.patch(
        f"/tasks/{task.id}",
        json={"auto_close_after_completions": 3, "auto_close_scope": "global"},
        headers=_auth_headers(admin_token),
    )
    assert update.status_code == 200

    second = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    third = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    assert second.status_code == 201
    assert third.status_code == 201

    blocked_after_third = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    assert blocked_after_third.status_code == 410


def test_admin_can_reset_auto_close_counts(client, db_session):
    admin = _admin()
    member = _member("reset_counts_member")
    task = Task(
        name="reset-counts-task",
        description="",
        points_per_completion=1,
        auto_close_after_completions=2,
        auto_close_scope=TaskAutoCloseScope.GLOBAL,
    )
    db_session.add_all([admin, member, task])
    db_session.commit()

    admin_token = _login(client, "admin", "secret")
    member_token = _login(client, "reset_counts_member", "secret")

    close_now = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 2},
        headers=_auth_headers(member_token),
    )
    assert close_now.status_code == 201

    blocked = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    assert blocked.status_code == 410

    reset = client.post(
        f"/tasks/{task.id}/auto-close-reset",
        headers=_auth_headers(admin_token),
    )
    assert reset.status_code == 200
    assert reset.json()["is_closed_for_user"] is False

    first_after_reset = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    second_after_reset = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    assert first_after_reset.status_code == 201
    assert second_after_reset.status_code == 201

    blocked_again = client.post(
        f"/tasks/{task.id}/submissions",
        json={"count": 1},
        headers=_auth_headers(member_token),
    )
    assert blocked_again.status_code == 410
