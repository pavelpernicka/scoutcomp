import pytest

from app.config import settings
from app.core.security import get_password_hash
from app.models import RoleEnum, Team, User


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


def test_login_rejects_invalid_credentials(client):
    response = client.post(
        "/auth/login",
        json={"username": "ghost", "password": "wrong"},
    )

    assert response.status_code == 401


def test_member_registration_with_join_code(client, db_session):
    settings.app.features.allow_self_registration = True
    team = Team(name="Alfa", description="Test", join_code="JOIN1234")
    db_session.add(team)
    db_session.commit()

    response = client.post(
        "/auth/register",
        json={
            "username": "scout",
            "email": "scout@example.com",
            "password": "Secret123",
            "join_code": "JOIN1234",
            "preferred_language": "cs",
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
        },
    )

    assert response.status_code == 201
    tokens = response.json()
    assert tokens["token_type"] == "bearer"

    created = db_session.query(User).filter(User.username == "admin2").one()
    assert created.role == RoleEnum.ADMIN
