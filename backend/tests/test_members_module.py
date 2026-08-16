from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import RoleEnum, ScoutAttendance, ScoutEvent, Team, User


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
    assert all(item["years_in_group"] is None for item in body["items"])

    found = client.get("/members?search=vesel", headers=headers).json()
    assert [item["real_name"] for item in found["items"]] == ["Alice Veselá"]

    only_team = client.get(f"/members?team_id={team.id}", headers=headers).json()
    assert {item["real_name"] for item in only_team["items"]} == {"Alice Veselá", "Bob Nový"}

    paginated = client.get("/members?limit=1&offset=0", headers=headers).json()
    assert paginated["total"] == 4
    assert len(paginated["items"]) == 1


def test_member_profile_tags_and_notes_flow(client, db_session):
    team = Team(name="Vlci", join_code="VLCI0001")
    db_session.add(team)
    db_session.commit()
    alice = _user("alice2", RoleEnum.MEMBER, team)
    alice.real_name = "Alice"
    db_session.add(alice)
    db_session.commit()

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    headers = _headers(token)

    created = client.put(
        f"/members/{alice.id}",
        headers=headers,
        json={
            "joined_at": "2010-05-01",
            "member_status": "active",
        },
    )
    assert created.status_code == 200
    profile = created.json()["profile"]
    assert profile["joined_at"] == "2010-05-01"

    updated = client.put(
        f"/members/{alice.id}",
        headers=headers,
        json={"member_status": "inactive"},
    ).json()["profile"]
    assert updated["member_status"] == "inactive"
    assert updated["joined_at"] == "2010-05-01"  # untouched fields preserved

    detail = client.get(f"/members/{alice.id}", headers=headers).json()
    assert set(detail["profile"]) == {"user_id", "joined_at", "member_status"}

    tagged = client.post(f"/members/{alice.id}/tags", headers=headers, json={"tag": "Skaut"}).json()
    assert tagged["tags"] == ["skaut"]
    again = client.post(f"/members/{alice.id}/tags", headers=headers, json={"tag": "skaut"}).json()
    assert again["tags"] == ["skaut"]  # idempotent
    by_tag = client.get("/members?tag=skaut", headers=headers).json()
    assert alice.id in {item["id"] for item in by_tag["items"]}

    notes = client.post(f"/members/{alice.id}/notes", headers=headers, json={"content": "Pozor, alergie"}).json()
    assert len(notes["notes"]) == 1
    assert notes["notes"][0]["content"] == "Pozor, alergie"

    detail = client.get(f"/members/{alice.id}", headers=headers).json()
    assert len(detail["notes"]) == 1
    assert "relationships" not in detail
    assert detail["tags"] == ["skaut"]

    removed_note = client.delete(
        f"/members/{alice.id}/notes/{notes['notes'][0]['id']}", headers=headers
    ).json()
    assert removed_note["notes"] == []
    removed_tag = client.delete(f"/members/{alice.id}/tags/skaut", headers=headers).json()
    assert removed_tag["tags"] == []


def test_member_attendance_is_paginated_and_excludes_planned(client, db_session):
    team = Team(name="Vlci", join_code="VLCI0001")
    member = _user("attendance_member", RoleEnum.MEMBER, team)
    db_session.add_all([team, member])
    db_session.commit()
    older = ScoutEvent(team_id=team.id, title="Starší schůzka", starts_at=datetime(2025, 1, 1))
    newer = ScoutEvent(team_id=team.id, title="Novější schůzka", starts_at=datetime(2025, 2, 1))
    upcoming = ScoutEvent(team_id=team.id, title="Příští schůzka", starts_at=datetime(2025, 3, 1))
    db_session.add_all([older, newer, upcoming])
    db_session.flush()
    db_session.add_all([
        ScoutAttendance(event_id=older.id, user_id=member.id, mode="real", status="present"),
        ScoutAttendance(event_id=newer.id, user_id=member.id, mode="real", status="late"),
        ScoutAttendance(event_id=newer.id, user_id=member.id, mode="planned", status="present"),
    ])
    db_session.commit()

    token = _seed_and_login(client, db_session, RoleEnum.ADMIN)
    response = client.get(f"/members/{member.id}/attendance?limit=1&offset=1", headers=_headers(token))

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 1
    assert body["items"][0]["title"] == "Novější schůzka"
    assert body["items"][0]["status"] == "late"
    upcoming_entry = client.get(f"/members/{member.id}/attendance?limit=1&offset=0", headers=_headers(token)).json()
    assert upcoming_entry["items"][0]["title"] == "Příští schůzka"
    assert upcoming_entry["items"][0]["status"] == "not_recorded"


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
        json={"joined_at": "2015-09-01", "member_status": "active"},
    )

    exported = client.get("/members/export.csv", headers=headers)
    assert exported.status_code == 200
    assert exported.headers["content-type"].startswith("text/csv")
    assert "Alice Export" in exported.text
    assert "2015-09-01" in exported.text

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
