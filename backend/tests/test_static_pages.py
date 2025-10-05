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


def test_member_can_view_rules_page(client, db_session):
    member = User(
        username="member",
        email="member@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        is_active=True,
        real_name="Test Member",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db_session.add(member)
    db_session.commit()

    token = _login(client, "member", "secret")
    response = client.get("/pages/rules", headers=_auth_headers(token))

    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == "rules"
    assert "content" in body


def test_only_admin_can_update_rules_page(client, db_session):
    admin = User(
        username="root",
        email="admin@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name="Test Admin",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    member = User(
        username="helper",
        email="helper@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        is_active=True,
        real_name="Test Helper",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db_session.add_all([admin, member])
    db_session.commit()

    admin_token = _login(client, "root", "secret")
    member_token = _login(client, "helper", "secret")

    forbidden = client.put(
        "/pages/rules",
        json={"content": "Attempt"},
        headers=_auth_headers(member_token),
    )
    assert forbidden.status_code == 403

    update = client.put(
        "/pages/rules",
        json={"content": "Welcome to the rules"},
        headers=_auth_headers(admin_token),
    )
    assert update.status_code == 200
    assert update.json()["content"] == "Welcome to the rules"

    verify = client.get("/pages/rules", headers=_auth_headers(member_token))
    assert verify.status_code == 200
    assert verify.json()["content"] == "Welcome to the rules"
