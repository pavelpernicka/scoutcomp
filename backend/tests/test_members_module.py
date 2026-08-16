from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import RoleEnum, Team, User


def _user(username: str, role: RoleEnum, team: Team | None = None):
    return User(
        username=username,
        real_name=username,
        password_hash=get_password_hash("secret"),
        role=role,
        team=team,
        preferred_language="cs",
        is_active=True,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def _login(client, username: str) -> str:
    response = client.post("/auth/login", json={"username": username, "password": "secret"})
    assert response.status_code == 200
    return response.json()["access_token"]


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _seed_and_login(client, db_session, role: RoleEnum):
    user = _user(f"{role}_user", role)
    db_session.add(user)
    db_session.commit()
    return _login(client, user.username)


def test_member_directory_search_and_filters(client, db_session):
    team = Team(name="Vlci", join_code="VLCI0001")
    db_session.add(team)
    db_session.commit()
    alice = _user("alice", RoleEnum.MEMBER, team)
    alice.real_name = "Alice Veselá"
    bob = _user("bob", RoleEnum.MEMBER, team)
    bob.real_name = "Bob Nový"
    carol = _user("carol", RoleEnum.MEMBER)
    carol.real_name = "Carol Stará"
    db_session.add_all([alice, bob, carol])
    db_session.commit()

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    listing = client.get("/members", headers=headers)
    assert listing.status_code == 200
    body = listing.json()
    assert body["total"] == 4  # alice + bob + carol + admin_user
    names = {item["real_name"] for item in body["items"]}
    assert {"Alice Veselá", "Bob Nový", "Carol Stará"} <= names
    assert all(item["member_status"] == "active" for item in body["items"])
    assert all(item["age"] is None for item in body["items"])

    found = client.get("/members?search=vesel", headers=headers).json()
    assert [item["real_name"] for item in found["items"]] == ["Alice Veselá"]

    only_team = client.get(f"/members?team_id={team.id}", headers=headers).json()
    assert {item["real_name"] for item in only_team["items"]} == {"Alice Veselá", "Bob Nový"}

    paginated = client.get("/members?limit=1&offset=0", headers=headers).json()
    assert paginated["total"] == 4
    assert len(paginated["items"]) == 1


def test_member_profile_tags_relationships_notes_flow(client, db_session):
    team = Team(name="Vlci", join_code="VLCI0001")
    db_session.add(team)
    db_session.commit()
    alice = _user("alice2", RoleEnum.MEMBER, team)
    alice.real_name = "Alice"
    bob = _user("bob2", RoleEnum.MEMBER, team)
    bob.real_name = "Bob"
    db_session.add_all([alice, bob])
    db_session.commit()

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    created = client.put(
        f"/members/{alice.id}",
        headers=headers,
        json={
            "phone": "123456789",
            "birth_date": "2010-05-01",
            "gender": "female",
            "member_status": "active",
            "parent_name": "Rodič Alice",
            "address": "Nádražní 1",
        },
    )
    assert created.status_code == 200
    profile = created.json()["profile"]
    assert profile["phone"] == "123456789"
    assert profile["gender"] == "female"
    assert profile["parent_name"] == "Rodič Alice"

    updated = client.put(
        f"/members/{alice.id}",
        headers=headers,
        json={"phone": "", "parent_name": ""},
    ).json()["profile"]
    assert updated["phone"] is None
    assert updated["parent_name"] is None
    assert updated["birth_date"] == "2010-05-01"  # untouched fields preserved

    detail = client.get(f"/members/{alice.id}", headers=headers).json()
    assert detail["profile"]["city"] is None
    assert detail["activity"] == {"attendance_count": 0, "completion_count": 0, "total_points": 0.0}

    tagged = client.post(f"/members/{alice.id}/tags", headers=headers, json={"tag": "Skaut"}).json()
    assert tagged["tags"] == ["skaut"]
    again = client.post(f"/members/{alice.id}/tags", headers=headers, json={"tag": "skaut"}).json()
    assert again["tags"] == ["skaut"]  # idempotent
    by_tag = client.get("/members?tag=skaut", headers=headers).json()
    assert alice.id in {item["id"] for item in by_tag["items"]}

    rel = client.post(
        f"/members/{alice.id}/relationships",
        headers=headers,
        json={"related_user_id": bob.id, "type": "parent", "note": "tatínek"},
    ).json()
    assert len(rel["relationships"]) == 1
    assert rel["relationships"][0]["type"] == "parent"
    assert rel["relationships"][0]["related_user"]["real_name"] == "Bob"

    self_rel = client.post(
        f"/members/{alice.id}/relationships",
        headers=headers,
        json={"related_user_id": alice.id},
    )
    assert self_rel.status_code == 422

    notes = client.post(f"/members/{alice.id}/notes", headers=headers, json={"content": "Pozor, alergie"}).json()
    assert len(notes["notes"]) == 1
    assert notes["notes"][0]["content"] == "Pozor, alergie"

    detail = client.get(f"/members/{alice.id}", headers=headers).json()
    assert len(detail["notes"]) == 1
    assert len(detail["relationships"]) == 1
    assert detail["tags"] == ["skaut"]

    removed_note = client.delete(
        f"/members/{alice.id}/notes/{notes['notes'][0]['id']}", headers=headers
    ).json()
    assert removed_note["notes"] == []
    removed_rel = client.delete(
        f"/members/{alice.id}/relationships/{rel['relationships'][0]['id']}", headers=headers
    ).json()
    assert removed_rel["relationships"] == []
    removed_tag = client.delete(f"/members/{alice.id}/tags/skaut", headers=headers).json()
    assert removed_tag["tags"] == []


def test_member_stats(client, db_session):
    team = Team(name="Vlci", join_code="VLCI0001")
    db_session.add(team)
    db_session.commit()
    a = _user("stat_a", RoleEnum.MEMBER, team)
    a.real_name = "A"
    b = _user("stat_b", RoleEnum.MEMBER, team)
    b.real_name = "B"
    c = _user("stat_c", RoleEnum.MEMBER)
    c.real_name = "C"
    db_session.add_all([a, b, c])
    db_session.commit()

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)
    client.put(f"/members/{b.id}", headers=headers, json={"member_status": "inactive"})

    stats = client.get("/members/stats", headers=headers).json()
    assert stats["total"] == 4  # a + b + c + admin_user
    assert stats["by_status"]["active"] == 3
    assert stats["by_status"]["inactive"] == 1
    assert stats["by_status"]["alumni"] == 0
    vlci = next(entry for entry in stats["by_team"] if entry["team_id"] == team.id)
    assert vlci["count"] == 2
    assert vlci["team_name"] == "Vlci"


def test_member_csv_export(client, db_session):
    team = Team(name="Vlci", join_code="VLCI0001")
    db_session.add(team)
    db_session.commit()
    alice = _user("alice3", RoleEnum.MEMBER, team)
    alice.real_name = "Alice Export"
    db_session.add(alice)
    db_session.commit()

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)
    client.put(
        f"/members/{alice.id}",
        headers=headers,
        json={"phone": "777888999", "parent_name": "Rodič", "member_status": "active"},
    )

    exported = client.get("/members/export.csv", headers=headers)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert "Alice Export" in exported.text
    assert "777888999" in exported.text
    assert "Rodič" in exported.text

    member_token = _seed_and_login(client, db_session, RoleEnum.MEMBER)
    assert client.get("/members/export.csv", headers=_headers(member_token)).status_code == 403


def test_member_access_control_team_scope(client, db_session):
    own = Team(name="Vlci", join_code="VLCI0001")
    other = Team(name="Rysi", join_code="RYSI0001")
    leader = _user("leader_member", RoleEnum.GROUP_ADMIN, own)
    db_session.add_all([own, other, leader])
    db_session.commit()
    alice = _user("alice4", RoleEnum.MEMBER, own)
    alice.real_name = "Alice"
    bob = _user("bob4", RoleEnum.MEMBER, other)
    bob.real_name = "Bob"
    db_session.add_all([alice, bob])
    db_session.commit()
    leader.managed_teams.append(own)
    db_session.commit()

    token = _login(client, "leader_member")
    headers = _headers(token)

    listing = client.get("/members", headers=headers).json()
    assert {item["real_name"] for item in listing["items"]} == {"Alice", "leader_member"}

    own_detail = client.get(f"/members/{alice.id}", headers=headers)
    assert own_detail.status_code == 200
    assert client.get(f"/members/{bob.id}", headers=headers).status_code == 404

    member_token = _seed_and_login(client, db_session, RoleEnum.MEMBER)
    assert client.get("/members", headers=_headers(member_token)).status_code == 403
    assert client.get(f"/members/{alice.id}", headers=_headers(member_token)).status_code == 403
