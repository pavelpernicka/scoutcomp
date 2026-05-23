from datetime import datetime, timezone

from app.core.security import create_access_token
from app.models import RoleEnum, Team, User


def _auth_headers_for_user(user: User) -> dict[str, str]:
    token, _expires = create_access_token(user.id, user.role)
    return {"Authorization": f"Bearer {token}"}


def _active_user(*, username: str, email: str, role: RoleEnum, real_name: str) -> User:
    return User(
        username=username,
        email=email,
        password_hash="test-hash",
        role=role,
        preferred_language="cs",
        is_active=True,
        real_name=real_name,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def _seed_inventory_scope(db_session):
    team_alpha = Team(name="Vlci", description="", join_code="VLCI1234")
    team_beta = Team(name="Rysi", description="", join_code="RYSI1234")
    admin = _active_user(username="admin", email="admin@example.com", role=RoleEnum.ADMIN, real_name="Admin")
    group_admin = _active_user(username="ga", email="ga@example.com", role=RoleEnum.GROUP_ADMIN, real_name="Group Admin")
    group_admin.managed_teams.append(team_alpha)
    db_session.add_all([team_alpha, team_beta, admin, group_admin])
    db_session.commit()
    return team_alpha, team_beta, admin, group_admin


def test_group_admin_only_sees_managed_inventory(client, db_session):
    team_alpha, team_beta, admin, group_admin = _seed_inventory_scope(db_session)
    alpha_item = client.post(
        "/inventory/items",
        json={"team_id": team_alpha.id, "name": "Stan", "quantity": 4, "status": "available"},
        headers=_auth_headers_for_user(admin),
    )
    assert alpha_item.status_code == 201

    beta_item = client.post(
        "/inventory/items",
        json={"team_id": team_beta.id, "name": "Kotel", "quantity": 2, "status": "available"},
        headers=_auth_headers_for_user(admin),
    )
    assert beta_item.status_code == 201

    response = client.get("/inventory/items", headers=_auth_headers_for_user(group_admin))

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["team_id"] == team_alpha.id
    assert body[0]["name"] == "Stan"


def test_qr_identifier_stays_stable_after_rename(client, db_session):
    team_alpha, _team_beta, admin, _group_admin = _seed_inventory_scope(db_session)
    created = client.post(
        "/inventory/items",
        json={"team_id": team_alpha.id, "name": "Sekera", "quantity": 1, "status": "available"},
        headers=_auth_headers_for_user(admin),
    )
    assert created.status_code == 201
    item = created.json()
    qr_identifier = item["qr_identifier"]

    updated = client.patch(
        f"/inventory/items/{item['id']}",
        json={"name": "Velká sekera"},
        headers=_auth_headers_for_user(admin),
    )
    assert updated.status_code == 200
    assert updated.json()["qr_identifier"] == qr_identifier

    fetched = client.get(f"/inventory/qr/{qr_identifier}", headers=_auth_headers_for_user(admin))
    assert fetched.status_code == 200
    assert fetched.json()["id"] == item["id"]
    assert fetched.json()["name"] == "Velká sekera"


def test_inventory_loan_event_and_return_scan_flow(client, db_session):
    team_alpha, _team_beta, admin, _group_admin = _seed_inventory_scope(db_session)
    created = client.post(
        "/inventory/items",
        json={
            "team_id": team_alpha.id,
            "name": "Lopata",
            "quantity": 6,
            "status": "available",
            "default_location": "Sklad A",
        },
        headers=_auth_headers_for_user(admin),
    )
    assert created.status_code == 201
    item = created.json()

    loan = client.post(
        f"/inventory/items/{item['id']}/loans",
        json={"borrower_name": "Kuba", "quantity": 2},
        headers=_auth_headers_for_user(admin),
    )
    assert loan.status_code == 201
    assert loan.json()["open_loan_quantity"] == 2
    assert loan.json()["available_quantity"] == 4

    event = client.post(
        "/inventory/events",
        json={"team_id": team_alpha.id, "name": "Tábor 2026", "status": "planned"},
        headers=_auth_headers_for_user(admin),
    )
    assert event.status_code == 201
    event_id = event.json()["id"]

    assigned = client.post(
        f"/inventory/events/{event_id}/items",
        json={"item_id": item["id"], "planned_quantity": 3},
        headers=_auth_headers_for_user(admin),
    )
    assert assigned.status_code == 200
    assert len(assigned.json()["items"]) == 1

    scan = client.post(
        f"/inventory/events/{event_id}/scan-return",
        json={"qr_identifier": item["qr_identifier"]},
        headers=_auth_headers_for_user(admin),
    )
    assert scan.status_code == 200
    body = scan.json()
    assert body["items"][0]["returned_quantity"] == 1
    assert len(body["summary"]["returned"]) == 1
    assert len(body["summary"]["missing"]) == 1
