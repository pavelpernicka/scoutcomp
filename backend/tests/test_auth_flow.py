import pytest
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.core.security import get_password_hash
from app.models import RefreshToken, RoleEnum, Team, User, Config
from app.routers.config import set_config_value
from app.routers.users import _user_to_public
from app.migrations import _normalize_legacy_usernames


@pytest.fixture(autouse=True)
def reset_settings():
    original_self_registration = settings.app.features.allow_self_registration
    original_developer_mode = settings.app.developer_mode
    yield
    settings.app.features.allow_self_registration = original_self_registration
    settings.app.developer_mode = original_developer_mode


def test_login_success(client, db_session):
    user = User(
        username="admin",
        email="admin@example.com",
        password_hash=get_password_hash("secret123"),
        role=RoleEnum.ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name="Test Admin",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/auth/login",
        json={"username": "admin", "password": "secret123"},
    )

    assert response.status_code == 200
    body = response.json()
    assert "access_token" in body
    assert body["token_type"] == "bearer"


def test_login_remember_me_extends_refresh_session(client, db_session, monkeypatch):
    monkeypatch.setattr(settings.app.token, "refresh_expire_minutes", 10)
    monkeypatch.setattr(settings.app.token, "remember_me_refresh_expire_minutes", 100)
    user = User(
        username="remembered",
        email="remembered@example.com",
        password_hash=get_password_hash("secret123"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        is_active=True,
        real_name="Remembered User",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    db_session.add(user)
    db_session.commit()

    response = client.post(
        "/auth/login",
        json={"username": "remembered", "password": "secret123", "remember_me": True},
    )

    assert response.status_code == 200
    refresh_token = db_session.query(RefreshToken).filter(RefreshToken.user_id == user.id).one()
    assert refresh_token.expires_at > datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=90)


def test_login_rejects_invalid_credentials(client):
    response = client.post(
        "/auth/login",
        json={"username": "ghost", "password": "wrong"},
    )

    assert response.status_code == 401


def test_member_registration_with_join_code(client, db_session):
    # Enable self-registration in database config
    set_config_value(db_session, "allow_self_registration", "true")
    db_session.commit()

    team = Team(name="Alfa", description="Test", join_code="JOIN1234")
    db_session.add(team)
    db_session.commit()
    db_session.refresh(team)

    response = client.post(
        "/auth/register",
        json={
            "username": "scout",
            "email": "scout@example.com",
            "password": "Secret123",
            "join_code": "JOIN1234",
            "preferred_language": "cs",
            "real_name": "Test Scout",
        },
    )

    assert response.status_code == 201
    tokens = response.json()
    assert tokens["token_type"] == "bearer"

    created = db_session.query(User).filter(User.username == "scout").one()
    assert created.team_id == team.id
    assert created.role == RoleEnum.MEMBER


def test_admin_bootstrap_allowed_in_developer_mode(client, db_session):
    settings.app.developer_mode = True

    response = client.post(
        "/auth/register",
        json={
            "username": "admin2",
            "email": "admin2@example.com",
            "password": "Secret123",
            "role": "admin",
            "real_name": "Test Admin 2",
        },
    )

    assert response.status_code == 201
    tokens = response.json()
    assert tokens["token_type"] == "bearer"

    created = db_session.query(User).filter(User.username == "admin2").one()
    assert created.role == RoleEnum.ADMIN


def test_registration_rejects_noncanonical_username(client, db_session):
    set_config_value(db_session, "allow_self_registration", "true")
    team = Team(name="Alfa", description="Test", join_code="JOIN1234")
    db_session.add(team)
    db_session.commit()
    response = client.post("/auth/register", json={
        "username": "Skaut Člen", "real_name": "Test Scout", "password": "Secret123", "join_code": "JOIN1234",
    })
    assert response.status_code == 422


def test_legacy_username_is_safe_to_serialize(db_session):
    user = User(
        username="Alois Čtvrtekkkk",
        email="legacy@example.com",
        password_hash=get_password_hash("secret123"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        is_active=True,
        real_name="Alois Čtvrtekkkk",
    )
    db_session.add(user)
    db_session.commit()

    assert _user_to_public(user).username == "aloistvrtekkkk"


def test_legacy_username_migration_normalizes_and_keeps_valid_collision_owner(db_session):
    valid = User(username="aloistvrtekkkk", email="valid@example.com", password_hash="x", real_name="Valid")
    legacy = User(username="Alois Čtvrtekkkk", email="legacy@example.com", password_hash="x", real_name="Legacy")
    db_session.add_all([valid, legacy])
    db_session.commit()

    with db_session.bind.begin() as connection:
        _normalize_legacy_usernames(connection)
    db_session.expire_all()

    assert db_session.get(User, valid.id).username == "aloistvrtekkkk"
    assert db_session.get(User, legacy.id).username.startswith("aloistvrtekkkk-")
