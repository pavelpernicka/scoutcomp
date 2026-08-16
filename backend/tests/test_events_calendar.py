from datetime import datetime, timezone, timedelta

from app.core.security import get_password_hash
from app.models import RoleEnum, Team, User
from app.web.data_sources import resolve_data_source


def _login(client, username: str, password: str = "secret") -> str:
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
        real_name=username.title(),
        password_hash=get_password_hash("secret"),
        role=role,
        preferred_language="cs",
        is_active=True,
        team=team,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def _event_payload(title="Schůzka", team_id=None, **overrides):
    payload = {
        "title": title,
        "kind": "meeting",
        "starts_at": (datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
        "ends_at": (datetime.now(timezone.utc) + timedelta(days=1, hours=2)).isoformat(),
        "location": "Klubovna",
        "description": "Popis akce",
        "team_id": team_id,
    }
    payload.update(overrides)
    return payload


def test_member_can_read_events(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, member])
    db_session.commit()

    token = _login(client, "member")
    response = client.get("/activity/events", headers=_headers(token))
    assert response.status_code == 200
    assert response.json() == []


def test_member_cannot_create_event(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, member])
    db_session.commit()

    token = _login(client, "member")
    response = client.post(
        "/activity/events",
        json=_event_payload(),
        headers=_headers(token),
    )
    assert response.status_code == 403


def test_group_admin_crud_events_for_own_team(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    leader = _user("leader", RoleEnum.GROUP_ADMIN, team)
    db_session.add_all([team, leader])
    db_session.commit()

    token = _login(client, "leader")
    headers = _headers(token)

    created = client.post("/activity/events", json=_event_payload(team_id=team.id), headers=headers)
    assert created.status_code == 201
    event = created.json()
    assert event["title"] == "Schůzka"
    assert event["team_id"] == team.id
    assert event["team_name"] == "Alpha"
    assert event["created_by_id"] == leader.id

    updated = client.put(
        f"/activity/events/{event['id']}",
        json=_event_payload(title="Výprava", team_id=team.id, kind="trip"),
        headers=headers,
    )
    assert updated.status_code == 200
    assert updated.json()["title"] == "Výprava"

    deleted = client.delete(f"/activity/events/{event['id']}", headers=headers)
    assert deleted.status_code == 204
    assert client.get("/activity/events", headers=headers).json() == []


def test_admin_can_create_unit_wide_event(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    db_session.add_all([team, admin])
    db_session.commit()

    token = _login(client, "admin")
    response = client.post(
        "/activity/events",
        json=_event_payload(team_id=None),
        headers=_headers(token),
    )
    assert response.status_code == 201
    assert response.json()["team_id"] is None
    assert response.json()["team_name"] is None


def test_event_public_visibility_is_explicit_and_available_to_cms(client, db_session):
    admin = _user("admin", RoleEnum.ADMIN)
    db_session.add(admin)
    db_session.commit()
    headers = _headers(_login(client, "admin"))

    private_response = client.post(
        "/activity/events",
        json=_event_payload(title="Interní akce"),
        headers=headers,
    )
    assert private_response.status_code == 201
    assert private_response.json()["is_public"] is False

    public_response = client.post(
        "/activity/events",
        json=_event_payload(title="Veřejná akce", is_public=True),
        headers=headers,
    )
    assert public_response.status_code == 201
    assert public_response.json()["is_public"] is True

    public_events = resolve_data_source(db_session, "core.events")
    assert [event["title"] for event in public_events] == ["Veřejná akce"]


def test_member_sees_only_own_and_unit_wide_events(client, db_session):
    alpha = Team(name="Alpha", join_code="JOINALPHA")
    beta = Team(name="Beta", join_code="JOINBETA")
    member = _user("member", RoleEnum.MEMBER, alpha)
    admin = _user("admin", RoleEnum.ADMIN)
    db_session.add_all([alpha, beta, member, admin])
    db_session.commit()

    admin_token = _login(client, "admin")
    admin_headers = _headers(admin_token)
    own = client.post("/activity/events", json=_event_payload(team_id=alpha.id, title="Alpha akce"), headers=admin_headers).json()
    other = client.post("/activity/events", json=_event_payload(team_id=beta.id, title="Beta akce"), headers=admin_headers).json()
    unit = client.post("/activity/events", json=_event_payload(team_id=None, title="Oddílová akce"), headers=admin_headers).json()

    token = _login(client, "member")
    titles = {event["title"] for event in client.get("/activity/events", headers=_headers(token)).json()}
    assert titles == {"Alpha akce", "Oddílová akce"}
    assert "Beta akce" not in titles


def test_attendance_requires_permission_and_records_status(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, admin, member])
    db_session.commit()

    admin_token = _login(client, "admin")
    admin_headers = _headers(admin_token)
    event = client.post(
        "/activity/events",
        json=_event_payload(team_id=team.id),
        headers=admin_headers,
    ).json()

    member_token = _login(client, "member")
    denied = client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": member.id, "status": "present"},
        headers=_headers(member_token),
    )
    assert denied.status_code == 403

    marked = client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": member.id, "status": "present"},
        headers=admin_headers,
    )
    assert marked.status_code == 200
    event_after = client.get("/activity/events", headers=admin_headers).json()[0]
    assert any(
        entry["user_id"] == member.id and entry["status"] == "present"
        for entry in event_after["attendance"]
    )


def test_member_hides_leader_only_events(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, admin, member])
    db_session.commit()

    admin_headers = _headers(_login(client, "admin"))
    leader_event = client.post(
        "/activity/events",
        json=_event_payload(team_id=team.id, title="Interní výprava", audience="leaders"),
        headers=admin_headers,
    )
    assert leader_event.status_code == 201

    member_headers = _headers(_login(client, "member"))
    member_titles = {e["title"] for e in client.get("/activity/events", headers=member_headers).json()}
    assert member_titles == set()

    admin_titles = {e["title"] for e in client.get("/activity/events", headers=admin_headers).json()}
    assert admin_titles == {"Interní výprava"}


def test_planned_and_real_attendance_modes_are_separate(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, admin, member])
    db_session.commit()

    headers = _headers(_login(client, "admin"))
    event = client.post(
        "/activity/events",
        json=_event_payload(team_id=team.id),
        headers=headers,
    ).json()

    planned = client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": member.id, "mode": "planned", "status": "present"},
        headers=headers,
    )
    assert planned.status_code == 200
    assert planned.json()["mode"] == "planned"

    real = client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": member.id, "mode": "real", "status": "absent"},
        headers=headers,
    )
    assert real.status_code == 200
    assert real.json()["mode"] == "real"
    assert real.json()["status"] == "absent"

    event_after = client.get("/activity/events", headers=headers).json()[0]
    records = {(entry["mode"], entry["status"]) for entry in event_after["attendance"]}
    assert ("planned", "present") in records
    assert ("real", "absent") in records


def test_admin_member_search_and_overview(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    member = _user("member", RoleEnum.MEMBER, team)
    member.real_name = "Jan Novák"
    db_session.add_all([team, admin, member])
    db_session.commit()

    headers = _headers(_login(client, "admin"))
    event = client.post(
        "/activity/events",
        json=_event_payload(team_id=team.id, title="Schůzka 1"),
        headers=headers,
    ).json()
    client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": member.id, "mode": "planned", "status": "attending"},
        headers=headers,
    )
    client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": member.id, "mode": "real", "status": "present"},
        headers=headers,
    )

    results = client.get("/admin/core/attendance/members/search", params={"q": "nov"}, headers=headers)
    assert results.status_code == 200
    assert any(m["id"] == member.id for m in results.json())

    overview = client.get(
        f"/admin/core/attendance/members/{member.id}",
        params={"date_from": "2020-01-01", "date_to": "2099-01-01"},
        headers=headers,
    )
    assert overview.status_code == 200
    data = overview.json()
    assert data["member"]["real_name"] == "Jan Novák"
    assert data["summary"]["meeting"]["events"] == 1
    assert data["summary"]["meeting"]["present"] == 1
    assert data["summary"]["meeting"]["attending"] == 1
    assert len(data["events"]) == 1
    assert data["events"][0]["real_status"] == "present"
    assert data["events"][0]["planned_status"] == "attending"


def test_message_attendees_sends_only_to_present(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    present = _user("present", RoleEnum.MEMBER, team)
    absent = _user("absent", RoleEnum.MEMBER, team)
    db_session.add_all([team, admin, present, absent])
    db_session.commit()

    headers = _headers(_login(client, "admin"))
    event = client.post(
        "/activity/events",
        json=_event_payload(team_id=team.id),
        headers=headers,
    ).json()
    client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": present.id, "mode": "real", "status": "present"},
        headers=headers,
    )
    client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": absent.id, "mode": "real", "status": "absent"},
        headers=headers,
    )

    response = client.post(
        f"/activity/events/{event['id']}/message",
        json={"message": "Připomínka!"},
        headers=headers,
    )
    assert response.status_code == 200
    assert response.json() == {"sent": 1, "total": 2}

    thread = client.get(f"/messages/{present.id}", headers=headers).json()
    assert any(message["body"] == "Připomínka!" for message in thread["messages"])


def test_member_can_set_own_planned_attendance(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, admin, member])
    db_session.commit()

    admin_headers = _headers(_login(client, "admin"))
    event = client.post(
        "/activity/events",
        json=_event_payload(team_id=team.id),
        headers=admin_headers,
    ).json()

    member_headers = _headers(_login(client, "member"))
    response = client.post(
        f"/activity/events/{event['id']}/planned",
        json={"status": "present"},
        headers=member_headers,
    )
    assert response.status_code == 200
    assert response.json()["mode"] == "planned"
    assert response.json()["status"] == "present"

    event_after = client.get("/activity/events", headers=member_headers).json()[0]
    assert ("planned", "present") in {(entry["mode"], entry["status"]) for entry in event_after["attendance"]}


def test_member_cannot_set_own_real_attendance(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, admin, member])
    db_session.commit()

    admin_headers = _headers(_login(client, "admin"))
    event = client.post(
        "/activity/events",
        json=_event_payload(team_id=team.id),
        headers=admin_headers,
    ).json()

    member_headers = _headers(_login(client, "member"))
    response = client.post(
        f"/activity/events/{event['id']}/attendance",
        json={"user_id": member.id, "mode": "real", "status": "present"},
        headers=member_headers,
    )
    assert response.status_code == 403


def test_planned_deadline_blocks_member_signup(client, db_session):
    team = Team(name="Alpha", join_code="JOINALPHA")
    admin = _user("admin", RoleEnum.ADMIN)
    member = _user("member", RoleEnum.MEMBER, team)
    db_session.add_all([team, admin, member])
    db_session.commit()

    admin_headers = _headers(_login(client, "admin"))
    event = client.post(
        "/activity/events",
        json=_event_payload(
            team_id=team.id,
            requires_planned=True,
            planned_deadline=(datetime.now(timezone.utc) - timedelta(days=1)).isoformat(),
        ),
        headers=admin_headers,
    ).json()

    member_headers = _headers(_login(client, "member"))
    response = client.post(
        f"/activity/events/{event['id']}/planned",
        json={"status": "present"},
        headers=member_headers,
    )
    assert response.status_code == 400
