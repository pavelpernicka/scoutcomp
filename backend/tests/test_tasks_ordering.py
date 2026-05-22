from datetime import datetime, timedelta, timezone

from app.core.security import get_password_hash
from app.models import RoleEnum, Task, User


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_active_tasks_are_ordered_hot_deal_then_created_at_desc(client, db_session):
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    member = User(
        username="member",
        email="member@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        is_active=True,
        real_name="Task Member",
        first_login_at=now,
    )

    tasks = [
        Task(
            name="normal-new",
            description="",
            points_per_completion=1,
            hot_deal=False,
            start_time=now - timedelta(days=1),
            created_at=now - timedelta(hours=1),
        ),
        Task(
            name="hot-old",
            description="",
            points_per_completion=1,
            hot_deal=True,
            start_time=now - timedelta(days=1),
            created_at=now - timedelta(hours=3),
        ),
        Task(
            name="hot-new",
            description="",
            points_per_completion=1,
            hot_deal=True,
            start_time=now - timedelta(days=1),
            created_at=now - timedelta(minutes=30),
        ),
        Task(
            name="normal-old",
            description="",
            points_per_completion=1,
            hot_deal=False,
            start_time=now - timedelta(days=1),
            created_at=now - timedelta(hours=5),
        ),
    ]

    db_session.add(member)
    db_session.add_all(tasks)
    db_session.commit()

    token = _login(client, "member", "secret")
    response = client.get("/tasks?status=active", headers=_auth_headers(token))

    assert response.status_code == 200
    ordered_names = [item["name"] for item in response.json()]
    assert ordered_names[:4] == ["hot-new", "hot-old", "normal-new", "normal-old"]
