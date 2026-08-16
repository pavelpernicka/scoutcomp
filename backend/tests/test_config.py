from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import RoleEnum, User


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_public_config_exposes_leaderboard_mode_lock_default(client):
    response = client.get("/config")
    assert response.status_code == 200

    body = response.json()
    assert body["leaderboard_default_view"] == "total"
    assert body["leaderboard_show_only_default_mode"] is False


def test_app_shell_contains_saved_name_and_favicon_before_client_javascript(client, db_session):
    from app.routers.config import set_config_value

    set_config_value(db_session, "app_name", "Oddíl & spol.")
    set_config_value(db_session, "app_icon", "data:image/svg+xml;base64,PHN2Zy8+")

    response = client.get("/app-shell")

    assert response.status_code == 200
    assert "<title>Oddíl &amp; spol.</title>" in response.text
    assert 'rel="icon" href="data:image/svg+xml;base64,PHN2Zy8+"' in response.text
    assert "__SCOUTCOMP_APP_TITLE__" not in response.text
    assert "__SCOUTCOMP_APP_ICON__" not in response.text


def test_admin_can_update_leaderboard_mode_lock(client, db_session):
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
    update_response = client.patch(
        "/admin/config",
        headers=_auth_headers(token),
        json={
            "leaderboard_default_view": "average",
            "leaderboard_show_only_default_mode": True,
        },
    )
    assert update_response.status_code == 200
    updated = update_response.json()
    assert updated["leaderboard_default_view"] == "average"
    assert updated["leaderboard_show_only_default_mode"] is True

    public_response = client.get("/config")
    assert public_response.status_code == 200
    public_body = public_response.json()
    assert public_body["leaderboard_default_view"] == "average"
    assert public_body["leaderboard_show_only_default_mode"] is True
