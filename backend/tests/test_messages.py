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


def _user(username: str, role: RoleEnum, team=None, receive_messages=True):
    return User(
        username=username,
        real_name=username,
        password_hash=get_password_hash("secret"),
        role=role,
        preferred_language="cs",
        is_active=True,
        team=team,
        receive_messages=receive_messages,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def test_send_message_and_list_conversation(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    alice = _user("alice", RoleEnum.MEMBER, team)
    bob = _user("bob", RoleEnum.MEMBER, team)
    db_session.add_all([team, alice, bob])
    db_session.commit()

    token = _login(client, "alice", "secret")
    response = client.post(
        "/messages",
        json={"recipient_id": bob.id, "body": "Ahoj Bobe!"},
        headers=_headers(token),
    )
    assert response.status_code == 201
    body = response.json()
    assert body["from_me"] is True
    assert body["recipient_id"] == bob.id

    conversations = client.get("/messages", headers=_headers(token)).json()
    assert len(conversations) == 1
    assert conversations[0]["other_user"]["id"] == bob.id
    assert conversations[0]["last_message"]["body"] == "Ahoj Bobe!"
    assert conversations[0]["unread_count"] == 0

    bob_token = _login(client, "bob", "secret")
    bob_view = client.get("/messages", headers=_headers(bob_token)).json()
    assert len(bob_view) == 1
    assert bob_view[0]["unread_count"] == 1


def test_thread_and_mark_read(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    alice = _user("alice", RoleEnum.MEMBER, team)
    bob = _user("bob", RoleEnum.MEMBER, team)
    db_session.add_all([team, alice, bob])
    db_session.commit()

    alice_token = _login(client, "alice", "secret")
    bob_token = _login(client, "bob", "secret")
    client.post("/messages", json={"recipient_id": bob.id, "body": "První"}, headers=_headers(alice_token))
    client.post("/messages", json={"recipient_id": alice.id, "body": "Druhá"}, headers=_headers(bob_token))

    thread = client.get(f"/messages/{bob.id}", headers=_headers(alice_token)).json()
    assert [message["body"] for message in thread["messages"]] == ["První", "Druhá"]
    assert thread["has_more"] is False

    unread = client.get("/messages/unread", headers=_headers(alice_token)).json()
    assert unread["count"] == 0
    bob_unread = client.get("/messages/unread", headers=_headers(bob_token)).json()
    assert bob_unread["count"] == 1


def test_send_blocked_when_recipient_disabled(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    alice = _user("alice", RoleEnum.MEMBER, team)
    bob = _user("bob", RoleEnum.MEMBER, team, receive_messages=False)
    db_session.add_all([team, alice, bob])
    db_session.commit()

    token = _login(client, "alice", "secret")
    response = client.post(
        "/messages",
        json={"recipient_id": bob.id, "body": "Tajná zpráva"},
        headers=_headers(token),
    )
    assert response.status_code == 403


def test_override_allows_messaging_disabled_recipient(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    bob = _user("bob", RoleEnum.MEMBER, team, receive_messages=False)
    db_session.add_all([team, admin, bob])
    db_session.commit()

    token = _login(client, "admin", "secret")
    response = client.post(
        "/messages",
        json={"recipient_id": bob.id, "body": "Důležité oznámení"},
        headers=_headers(token),
    )
    assert response.status_code == 201


def test_user_search(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    alice = _user("alice", RoleEnum.MEMBER, team)
    bob = _user("bob", RoleEnum.MEMBER, team)
    carol = _user("carol", RoleEnum.MEMBER, team)
    db_session.add_all([team, alice, bob, carol])
    db_session.commit()

    token = _login(client, "alice", "secret")
    response = client.get("/messages/users/search?q=bo", headers=_headers(token))
    assert response.status_code == 200
    ids = {user["id"] for user in response.json()}
    assert ids == {bob.id}
    assert alice.id not in ids

    all_users = client.get("/messages/users/search", headers=_headers(token)).json()
    assert {user["id"] for user in all_users} == {bob.id, carol.id}


def test_cannot_message_yourself(client, db_session):
    alice = _user("alice", RoleEnum.MEMBER)
    db_session.add(alice)
    db_session.commit()

    token = _login(client, "alice", "secret")
    response = client.post(
        "/messages",
        json={"recipient_id": alice.id, "body": "Sám sobě"},
        headers=_headers(token),
    )
    assert response.status_code == 400


def test_toggle_receive_messages_preference(client, db_session):
    alice = _user("alice", RoleEnum.MEMBER)
    db_session.add(alice)
    db_session.commit()

    token = _login(client, "alice", "secret")
    headers = _headers(token)

    me = client.get("/users/me", headers=headers).json()
    assert me["user"]["receive_messages"] is True

    response = client.patch(
        "/users/me",
        json={"receive_messages": False},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json()["user"]["receive_messages"] is False

    me = client.get("/users/me", headers=headers).json()
    assert me["user"]["receive_messages"] is False

    client.patch("/users/me", json={"receive_messages": True}, headers=headers)
    assert client.get("/users/me", headers=headers).json()["user"]["receive_messages"] is True


def test_search_results_expose_receive_messages(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    alice = _user("alice", RoleEnum.MEMBER, team)
    bob = _user("bob", RoleEnum.MEMBER, team, receive_messages=False)
    db_session.add_all([team, alice, bob])
    db_session.commit()

    token = _login(client, "alice", "secret")
    results = client.get("/messages/users/search?q=bo", headers=_headers(token)).json()
    assert results[0]["receive_messages"] is False


def test_thread_pagination_loads_older_pages(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    alice = _user("alice", RoleEnum.MEMBER, team)
    bob = _user("bob", RoleEnum.MEMBER, team)
    db_session.add_all([team, alice, bob])
    db_session.commit()

    token = _login(client, "alice", "secret")
    headers = _headers(token)
    for i in range(1, 8):
        response = client.post(
            "/messages",
            json={"recipient_id": bob.id, "body": f"Zpráva {i}"},
            headers=headers,
        )
        assert response.status_code == 201
    first_page = client.get(f"/messages/{bob.id}", params={"limit": 3}, headers=headers).json()
    assert [message["body"] for message in first_page["messages"]] == [
        "Zpráva 5",
        "Zpráva 6",
        "Zpráva 7",
    ]
    assert first_page["has_more"] is True

    oldest = first_page["messages"][0]["id"]
    second_page = client.get(
        f"/messages/{bob.id}", params={"limit": 3, "before_id": oldest}, headers=headers
    ).json()
    assert [message["body"] for message in second_page["messages"]] == ["Zpráva 2", "Zpráva 3", "Zpráva 4"]
    assert second_page["has_more"] is True

    oldest = second_page["messages"][0]["id"]
    third_page = client.get(
        f"/messages/{bob.id}", params={"limit": 3, "before_id": oldest}, headers=headers
    ).json()
    assert [message["body"] for message in third_page["messages"]] == ["Zpráva 1"]
    assert third_page["has_more"] is False

    bob_token = _login(client, "bob", "secret")
    newest_id = first_page["messages"][-1]["id"]
    client.post(
        "/messages",
        json={"recipient_id": alice.id, "body": "Nová živá zpráva"},
        headers=_headers(bob_token),
    )
    delta = client.get(
        f"/messages/{bob.id}", params={"after_id": newest_id}, headers=headers
    ).json()
    assert [message["body"] for message in delta["messages"]] == ["Nová živá zpráva"]
    assert delta["unread_count"] == 0
