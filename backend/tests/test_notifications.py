from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import Notification, RoleEnum, User


def _login(client, username: str, password: str = "secret") -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _user(username: str, role: RoleEnum):
    return User(
        username=username,
        real_name=username.title(),
        password_hash=get_password_hash("secret"),
        role=role,
        preferred_language="cs",
        is_active=True,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def test_mark_all_notifications_read(client, db_session):
    member = _user("member", RoleEnum.MEMBER)
    db_session.add(member)
    db_session.commit()
    db_session.add_all(
        [
            Notification(user_id=member.id, message="První", sender_id=member.id),
            Notification(user_id=member.id, message="Druhá", sender_id=member.id),
        ]
    )
    db_session.commit()

    token = _login(client, "member")
    response = client.post("/notifications/read", headers=_headers(token))
    assert response.status_code == 200

    unread = (
        db_session.query(Notification)
        .filter(Notification.user_id == member.id, Notification.read_at.is_(None))
        .count()
    )
    assert unread == 0

    listing = client.get("/notifications", headers=_headers(token))
    assert listing.status_code == 200
    assert len(listing.json()) == 2
    assert all(item["read_at"] for item in listing.json())


def test_mark_read_only_affects_own_notifications(client, db_session):
    member = _user("member", RoleEnum.MEMBER)
    other = _user("other", RoleEnum.MEMBER)
    db_session.add_all([member, other])
    db_session.commit()
    db_session.add_all(
        [
            Notification(user_id=member.id, message="Mine", sender_id=member.id),
            Notification(user_id=other.id, message="Theirs", sender_id=member.id),
        ]
    )
    db_session.commit()

    token = _login(client, "member")
    response = client.post("/notifications/read", headers=_headers(token))
    assert response.status_code == 200

    their_notification = (
        db_session.query(Notification).filter(Notification.user_id == other.id).first()
    )
    assert their_notification.read_at is None
