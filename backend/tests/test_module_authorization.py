from datetime import datetime, timezone

from app.models import PermissionGroup, RoleEnum, Team, User
from app.modules import registry
from app.permissions import allows, allows_team, permission_scopes


def _user(username, role, team=None):
    return User(
        username=username,
        real_name=username,
        password_hash="test",
        role=role,
        team=team,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def test_legacy_roles_are_migrated_to_system_groups(db_session):
    team = Team(name="Vlci", join_code="VLCI0001")
    admin = _user("admin", RoleEnum.ADMIN)
    leader = _user("leader", RoleEnum.GROUP_ADMIN, team)
    member = _user("member", RoleEnum.MEMBER, team)
    leader.managed_teams.append(team)
    db_session.add_all([team, admin, leader, member]); db_session.commit()

    registry.seed(db_session)

    assert "Superadmin" in {group.name for group in admin.permission_groups}
    assert "Vedoucí družiny" in {group.name for group in leader.permission_groups}
    assert "Člen" in {group.name for group in member.permission_groups}
    assert allows(db_session, admin, "core.modules.manage")
    assert allows_team(db_session, leader, "core.users.read", team.id)
    assert "team" in permission_scopes(db_session, leader, "core.events.edit")


def test_seed_removes_default_member_group_when_user_has_a_specific_group(db_session):
    registry.seed(db_session)
    member_group = db_session.query(PermissionGroup).filter_by(name="Člen").one()
    admin_group = db_session.query(PermissionGroup).filter_by(name="Superadmin").one()
    user = _user("duplicate-groups", RoleEnum.MEMBER)
    user.permission_groups = [member_group, admin_group]
    db_session.add(user)
    db_session.commit()

    registry.seed(db_session)

    assert [group.name for group in user.permission_groups] == ["Superadmin"]


def test_team_scope_does_not_escape_managed_team(db_session):
    own = Team(name="Vlci", join_code="VLCI0001")
    other = Team(name="Rysi", join_code="RYSI0001")
    leader = _user("leader", RoleEnum.GROUP_ADMIN, own)
    db_session.add_all([own, other, leader]); db_session.commit()
    registry.seed(db_session)

    assert allows_team(db_session, leader, "core.users.read", own.id)
    assert not allows_team(db_session, leader, "core.users.read", other.id)
