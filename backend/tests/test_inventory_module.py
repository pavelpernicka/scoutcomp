from datetime import datetime, timezone

from app.core.security import create_access_token
from app.models import RoleEnum, User


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


def _seed_inventory_user(db_session):
    admin = _active_user(username="admin", email="admin@example.com", role=RoleEnum.ADMIN, real_name="Admin")
    db_session.add(admin)
    db_session.commit()
    return admin


def test_inventory_is_global_and_has_no_team_fields(client, db_session):
    admin = _seed_inventory_user(db_session)
    first_item = client.post(
        "/inventory/items",
        json={"name": "Stan", "quantity": 4, "status": "available"},
        headers=_auth_headers_for_user(admin),
    )
    assert first_item.status_code == 201

    second_item = client.post(
        "/inventory/items",
        json={"name": "Kotel", "quantity": 2, "status": "available"},
        headers=_auth_headers_for_user(admin),
    )
    assert second_item.status_code == 201

    response = client.get("/inventory/items", headers=_auth_headers_for_user(admin))

    assert response.status_code == 200
    body = response.json()
    assert [item["name"] for item in body] == ["Kotel", "Stan"]
    assert all("team_id" not in item and "team_name" not in item for item in body)


def test_qr_identifier_stays_stable_after_rename(client, db_session):
    admin = _seed_inventory_user(db_session)
    created = client.post(
        "/inventory/items",
        json={"name": "Sekera", "quantity": 1, "status": "available"},
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


def test_inventory_loan_return_and_qr_lookup_flow(client, db_session):
    admin = _seed_inventory_user(db_session)
    created = client.post(
        "/inventory/items",
        json={
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

    too_low = client.patch(
        f"/inventory/items/{item['id']}",
        json={"quantity": 1},
        headers=_auth_headers_for_user(admin),
    )
    assert too_low.status_code == 400

    scanned = client.get(
        f"/inventory/qr/{item['qr_identifier']}",
        headers=_auth_headers_for_user(admin),
    )
    assert scanned.status_code == 200
    assert scanned.json()["id"] == item["id"]

    loan_id = next(loan["id"] for loan in loan.json()["loans"] if not loan["returned_at"])
    returned = client.post(
        f"/inventory/loans/{loan_id}/return",
        headers=_auth_headers_for_user(admin),
    )
    assert returned.status_code == 200
    assert returned.json()["open_loan_quantity"] == 0

    removed_endpoint = client.get("/inventory/events", headers=_auth_headers_for_user(admin))
    assert removed_endpoint.status_code == 404


def test_inventory_item_keeps_location_quantities_in_sync_after_return(client, db_session):
    admin = _seed_inventory_user(db_session)
    headers = _auth_headers_for_user(admin)
    created = client.post(
        "/inventory/items",
        json={
            "name": "Podsada",
            "quantity": 6,
            "locations": [
                {"location": "Sklad A", "quantity": 2},
                {"location": "Sklad B", "quantity": 4},
            ],
        },
        headers=headers,
    )
    assert created.status_code == 201
    item = created.json()

    loaned = client.post(
        f"/inventory/items/{item['id']}/loans",
        json={"borrower_name": "Kuba", "quantity": 3, "location": "Sklad B"},
        headers=headers,
    )
    assert loaned.status_code == 201
    assert {entry["location"]: entry["quantity"] for entry in loaned.json()["locations"]} == {"Sklad A": 2, "Sklad B": 1}

    loan_id = next(loan["id"] for loan in loaned.json()["loans"] if not loan["returned_at"])
    returned = client.post(f"/inventory/loans/{loan_id}/return", headers=headers)
    assert returned.status_code == 200
    locations = returned.json()["locations"]
    assert {entry["location"]: entry["quantity"] for entry in locations} == {"Sklad A": 2, "Sklad B": 4}

    updated = client.patch(
        f"/inventory/items/{item['id']}",
        json={"name": "Podsada velká", "locations": locations},
        headers=headers,
    )
    assert updated.status_code == 200
