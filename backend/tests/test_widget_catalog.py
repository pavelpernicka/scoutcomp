from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import RoleEnum, Team, User


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


def _reset_widget_config(client, token: str):
    widgets = client.get("/admin/widgets", headers=_headers(token)).json()
    response = client.put(
        "/admin/widgets",
        json={"enabled_ids": [w["id"] for w in widgets]},
        headers=_headers(token),
    )
    assert response.status_code == 200


def test_public_widgets_include_core_and_competitions(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, member])
    db_session.commit()

    token = _login(client, "member", "secret")
    response = client.get("/widgets", headers=_headers(token))
    assert response.status_code == 200
    widgets = response.json()
    ids = {widget["id"] for widget in widgets}
    assert "core.messages" in ids
    assert "competitions.activity" in ids
    assert "competitions.progress" in ids
    assert "competitions.tasks" in ids
    assert "competitions.announcements" in ids
    core_messages = next(w for w in widgets if w["id"] == "core.messages")
    assert core_messages["component"] == "messages"
    assert core_messages["module"] == "core"
    announcements = next(w for w in widgets if w["id"] == "competitions.announcements")
    assert announcements["component"] == "announcements"
    assert announcements["module"] == "competitions"


def test_widgets_respect_permissions(client, db_session):
    admin = _user("admin", RoleEnum.ADMIN)
    db_session.add(admin)
    db_session.commit()

    token = _login(client, "admin", "secret")
    response = client.get("/widgets", headers=_headers(token))
    ids = {widget["id"] for widget in response.json()}
    assert "competitions.activity" in ids
    assert "core.messages" in ids


def test_admin_widgets_config_enables_and_disables(client, db_session):
    admin = _user("admin", RoleEnum.ADMIN)
    db_session.add(admin)
    db_session.commit()
    token = _login(client, "admin", "secret")

    _reset_widget_config(client, token)

    response = client.get("/admin/widgets", headers=_headers(token))
    assert response.status_code == 200
    all_widgets = response.json()
    assert any(w["id"] == "competitions.activity" for w in all_widgets)
    assert all(w["enabled"] for w in all_widgets)

    disabled = [w for w in all_widgets if w["id"] != "competitions.activity"]
    response = client.put("/admin/widgets", json={"enabled_ids": [w["id"] for w in disabled]}, headers=_headers(token))
    assert response.status_code == 200

    response = client.get("/widgets", headers=_headers(token))
    ids = {widget["id"] for widget in response.json()}
    assert "competitions.activity" not in ids
    assert "competitions.tasks" in ids

    response = client.get("/admin/widgets", headers=_headers(token))
    activity = next(w for w in response.json() if w["id"] == "competitions.activity")
    assert activity["enabled"] is False


def test_admin_widgets_rejects_unknown_id(client, db_session):
    admin = _user("admin", RoleEnum.ADMIN)
    db_session.add(admin)
    db_session.commit()
    token = _login(client, "admin", "secret")

    response = client.put("/admin/widgets", json={"enabled_ids": ["nonexistent.widget"]}, headers=_headers(token))
    assert response.status_code == 400


def test_admin_widgets_requires_core_modules_manage(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, member])
    db_session.commit()

    token = _login(client, "member", "secret")
    response = client.get("/admin/widgets", headers=_headers(token))
    assert response.status_code == 403
