from datetime import datetime, timezone

from app.core.security import get_password_hash
from app.models import (
    Completion,
    CompletionStatus,
    RoleEnum,
    Task,
    Team,
    User,
)


def _login(client, username: str, password: str) -> str:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    return response.json()["access_token"]


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_stat_category_crud_and_leaderboard(client, db_session):
    team = Team(name="Alpha", description="Test team", join_code="ALPHA123")
    admin = User(
        username="admin",
        email="admin@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name="Test Admin",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    member_one = User(
        username="scout1",
        email="scout1@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        team=team,
        is_active=True,
        real_name="Test Scout One",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    member_two = User(
        username="scout2",
        email="scout2@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        team=team,
        is_active=True,
        real_name="Test Scout Two",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )

    task_points = Task(
        name="Signal fire",
        description="",
        points_per_completion=5,
        team=team,
    )
    task_completions = Task(
        name="Map drawing",
        description="",
        points_per_completion=3,
        team=team,
    )

    db_session.add_all([team, admin, member_one, member_two, task_points, task_completions])
    db_session.commit()

    # Completions for member one
    db_session.add_all(
        [
            Completion(
                member_id=member_one.id,
                task_id=task_points.id,
                status=CompletionStatus.APPROVED,
                count=2,
                points_awarded=10,
            ),
            Completion(
                member_id=member_one.id,
                task_id=task_completions.id,
                status=CompletionStatus.APPROVED,
                count=1,
                points_awarded=3,
            ),
        ]
    )

    # Completions for member two
    db_session.add_all(
        [
            Completion(
                member_id=member_two.id,
                task_id=task_points.id,
                status=CompletionStatus.APPROVED,
                count=1,
                points_awarded=5,
            ),
            Completion(
                member_id=member_two.id,
                task_id=task_completions.id,
                status=CompletionStatus.APPROVED,
                count=3,
                points_awarded=9,
            ),
        ]
    )
    db_session.commit()

    token = _login(client, "admin", "secret")

    # Create category with two components
    icon_original = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQ"
        "VR42mP8/x8AAusB9Yl2nWkAAAAASUVORK5CYII="
    )
    icon_updated = (
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAHElEQVR4"
        "nGP8z/CfAQgwBiqGAgwMDAwMDADFYQfLOBInyAAAAABJRU5ErkJggg=="
    )

    create_response = client.post(
        "/stats-categories",
        json={
            "name": "Fire mastery",
            "description": "Weighted mix of fire tasks",
            "icon": icon_original,
            "components": [
                {"task_id": task_points.id, "metric": "points", "weight": 1.0},
                {"task_id": task_completions.id, "metric": "completions", "weight": 2.0},
            ],
        },
        headers=_auth_headers(token),
    )
    assert create_response.status_code == 201
    category = create_response.json()
    assert category["name"] == "Fire mastery"
    assert category["icon"] == icon_original
    assert len(category["components"]) == 2

    category_id = category["id"]

    # Update category description
    patch_response = client.patch(
        f"/stats-categories/{category_id}",
        json={"description": "Updated description", "icon": icon_updated},
        headers=_auth_headers(token),
    )
    assert patch_response.status_code == 200
    assert patch_response.json()["description"] == "Updated description"
    assert patch_response.json()["icon"] == icon_updated

    # Add another component
    add_component = client.post(
        f"/stats-categories/{category_id}/components",
        json={"task_id": task_points.id, "metric": "completions", "weight": 0.5, "position": 5},
        headers=_auth_headers(token),
    )
    assert add_component.status_code == 201
    component_id = add_component.json()["id"]

    # Update component weight
    update_component = client.patch(
        f"/stats-categories/components/{component_id}",
        json={"weight": 1.5},
        headers=_auth_headers(token),
    )
    assert update_component.status_code == 200
    assert update_component.json()["weight"] == 1.5

    # Remove component
    remove_component = client.delete(
        f"/stats-categories/components/{component_id}",
        headers=_auth_headers(token),
    )
    assert remove_component.status_code == 204

    # Public list should include category with component count
    public_list = client.get("/stats-categories").json()
    summary = next(item for item in public_list if item["id"] == category_id)
    assert summary["icon"] == icon_updated

    # Leaderboard per category (members)
    leaderboard = client.get(f"/leaderboard/stats/{category_id}", headers=_auth_headers(token)).json()
    assert len(leaderboard) == 2
    # member_one score: points 10*1 + completions task_completions (1)*2 = 12
    # member_two score: points 5*1 + completions (3)*2 = 11
    assert leaderboard[0]["name"] == "Test Scout One"
    assert leaderboard[0]["score"] == 12
    assert leaderboard[1]["name"] == "Test Scout Two"
    assert leaderboard[1]["score"] == 11

    # Leaderboard per category (teams)
    team_leaderboard = client.get(
        f"/leaderboard/stats/{category_id}",
        params={"scope": "teams"},
        headers=_auth_headers(token),
    ).json()
    assert len(team_leaderboard) == 1
    assert team_leaderboard[0]["member_count"] == 2
    assert team_leaderboard[0]["score"] == 23

    # Delete category
    delete_response = client.delete(
        f"/stats-categories/{category_id}",
        headers=_auth_headers(token),
    )
    assert delete_response.status_code == 204

    # After deletion leaderboard should return 404
    not_found = client.get(f"/leaderboard/stats/{category_id}", headers=_auth_headers(token))
    assert not_found.status_code == 404


def test_group_admin_cannot_manage_categories(client, db_session):
    team = Team(name="Beta", description="", join_code="BETA123")
    group_admin = User(
        username="leader",
        email="leader@example.com",
        password_hash=get_password_hash("secret"),
        role=RoleEnum.GROUP_ADMIN,
        preferred_language="cs",
        is_active=True,
        real_name="Test Group Admin",
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    group_admin.managed_teams.append(team)
    db_session.add_all([team, group_admin])
    db_session.commit()

    token = _login(client, "leader", "secret")

    response = client.post(
        "/stats-categories",
        json={"name": "Test", "description": ""},
        headers=_auth_headers(token),
    )
    assert response.status_code == 403
