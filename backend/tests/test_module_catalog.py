from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import Completion, CompletionStatus, RoleEnum, Task, Team, User
from app.modules import registry


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _user(username: str, role: RoleEnum, team=None):
    return User(
        username=username,
        real_name=username,
        password_hash=get_password_hash("secret"),
        role=role,
        preferred_language="cs",
        is_active=True,
        team=team,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def test_users_me_no_longer_exposes_scoreboard(client, db_session):
    admin = _user("admin", RoleEnum.ADMIN)
    db_session.add(admin)
    db_session.commit()

    token = _login(client, "admin", "secret")
    response = client.get("/users/me", headers=_headers(token))
    assert response.status_code == 200
    body = response.json()
    assert "scoreboard" not in body
    assert body["user"]["username"] == "admin"


def test_leaderboard_me_reports_score_summary(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    member = _user("member", RoleEnum.MEMBER, team)
    task = Task(name="Task", description="", points_per_completion=5, team=team)
    db_session.add_all([team, member, task])
    db_session.commit()
    completion = Completion(
        member=member, task=task, count=2,
        status=CompletionStatus.APPROVED, points_awarded=10,
    )
    db_session.add(completion)
    db_session.commit()

    token = _login(client, "member", "secret")
    response = client.get("/leaderboard/me", headers=_headers(token))
    assert response.status_code == 200
    body = response.json()
    assert body["total_points"] == 10
    assert body["member_rank"] == 1
    assert body["team_rank"] == 1


def test_catalog_contains_only_four_modules(client, db_session):
    registry.seed(db_session)
    admin = _user("admin", RoleEnum.ADMIN)
    db_session.add(admin)
    db_session.commit()

    token = _login(client, "admin", "secret")
    response = client.get("/modules/all", headers=_headers(token))
    assert response.status_code == 200
    body = response.json()
    codes = sorted(module["code"] for module in body)
    assert codes == ["competitions", "core", "inventory", "web"]

    by_code = {module["code"]: module for module in body}
    assert by_code["competitions"]["dependencies"] == ["core"]
    assert by_code["inventory"]["dependencies"] == ["core"]
    assert by_code["web"]["dependencies"] == ["core"]

    # The member evidence is folded into the core module: its admin menu entry
    # points to /admin/core/users and its permissions live under core.*
    core_permissions = {permission["code"] for permission in by_code["core"]["permissions"]}
    assert {"members.read", "members.edit", "members.notes.manage", "members.export"} <= core_permissions
    admin_menu = client.get("/modules/admin-menu", headers=_headers(token)).json()
    users_entry = next(item for item in admin_menu if item["route"] == "/admin/core/users")
    assert users_entry["permission"] == "core.members.read"

    # Enabled modules expose their sub-sections via the public catalogue.
    catalogue = client.get("/modules", headers=_headers(token)).json()
    catalogue_by_code = {module["code"]: module for module in catalogue}
    competitions_menu = {item["route"] for item in catalogue_by_code["competitions"]["menu"]}
    assert competitions_menu == {"/tasks", "/leaderboard", "/rules"}
    inventory_menu = {item["route"] for item in catalogue_by_code["inventory"]["menu"]}
    assert "/inventory/items" in inventory_menu
    assert "/inventory/settings" in inventory_menu
    assert "/inventory/flags" not in inventory_menu
    # Visitor-facing pages are served exclusively by app.site_app. The logged-in
    # React application exposes only permission-filtered CMS administration.
    assert catalogue_by_code["web"]["menu"] == []
    web_admin_routes = {
        item["route"] for item in client.get("/modules/admin-menu", headers=_headers(token)).json()
        if item["route"].startswith("/admin/web")
    }
    assert "/admin/web/pages" in web_admin_routes
