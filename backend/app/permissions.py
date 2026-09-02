"""Object based authorization, shared by core and feature modules."""
from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from .models import DirectUserPermission, DirectUserPermissionDeny, PermissionDefinition


_INVENTORY_READ_GRANULAR = ("items.read",)
_INVENTORY_MANAGE_GRANULAR = (
    "items.manage",
    "loans.manage",
    "events.manage",
    "locations.manage",
    "categories.manage",
    "flags.manage",
    "templates.manage",
)
_WEB_MANAGE_GRANULAR = (
    "pages.manage",
    "posts.manage",
    "media.manage",
    "menus.manage",
    "design.manage",
    "templates.manage",
    "themes.manage",
    "publish",
    "settings.manage",
)


def _implied_actions(action: str) -> set[str]:
    """Actions that implicitly grant `action` (coarse inventory permission implies the granular ones)."""
    if action == "inventory.read":
        return {action, *(f"inventory.{code}" for code in _INVENTORY_READ_GRANULAR)}
    if action == "inventory.manage":
        return {action, *(f"inventory.{code}" for code in _INVENTORY_MANAGE_GRANULAR)}
    if action == "web.manage":
        return {action, *(f"web.{code}" for code in _WEB_MANAGE_GRANULAR)}
    return {action}


def effective_permission_scopes(db: Session, user) -> dict[str, set[str]]:
    """Return effective actions and scopes; explicit deny takes precedence."""
    # Also makes isolated test databases and new deployments self-initialising.
    from .modules import registry
    registry.seed(db)
    denied_actions = {
        implied
        for row in db.query(DirectUserPermissionDeny).filter_by(user_id=user.id).all()
        for implied in _implied_actions(f"{row.permission.module_code}.{row.permission.code}")
    }
    result: dict[str, set[str]] = {}

    def add(action: str, scope: str) -> None:
        for implied in _implied_actions(action):
            if implied not in denied_actions:
                result.setdefault(implied, set()).add(scope)

    for group in user.permission_groups:
        for grant in group.grants:
            add(f"{grant.permission.module_code}.{grant.permission.code}", grant.scope)
    for permission in db.query(PermissionDefinition).filter_by(default_for_member=True):
        add(f"{permission.module_code}.{permission.code}", "any")
    for grant in db.query(DirectUserPermission).filter_by(user_id=user.id):
        add(f"{grant.permission.module_code}.{grant.permission.code}", "any")
    return result


def permission_keys(db: Session, user) -> set[str]:
    """Return effective module.permission keys; explicit deny takes precedence."""
    return set(effective_permission_scopes(db, user))


def permission_scopes(db: Session, user, action: str) -> set[str]:
    """Effective scopes for an action. `any` includes all lower scopes."""
    return effective_permission_scopes(db, user).get(action, set())


def has_any_scope(db: Session, user, action: str) -> bool:
    """True when the user holds the action with the global `any` scope."""
    return "any" in permission_scopes(db, user, action)


def scoped_team_ids(db: Session, user, action: str) -> Optional[set[int]]:
    """Team ids the user may act on for `action`.

    Returns ``None`` for global (``any``) scope, an empty set when the user has
    no usable scope, and the own/managed team ids for ``team`` scope.
    """
    scopes = permission_scopes(db, user, action)
    if "any" in scopes:
        return None
    return managed_team_ids(user) if "team" in scopes else set()


def allows(db: Session, user, action: str, *, owner_id: int | None = None, team_id: int | None = None) -> bool:
    scopes = permission_scopes(db, user, action)
    return "any" in scopes or ("own" in scopes and owner_id == user.id) or ("team" in scopes and team_id in managed_team_ids(user))


def managed_team_ids(user) -> set[int]:
    ids = {user.team_id} if user.team_id is not None else set()
    ids.update(team.id for team in getattr(user, "managed_teams", []))
    return ids


def allows_team(db: Session, user, action: str, team_id: int | None) -> bool:
    scopes = permission_scopes(db, user, action)
    return "any" in scopes or ("team" in scopes and team_id in managed_team_ids(user))


def require_permission(module_code: str, code: str):
    def dependency(db, current_user):
        if f"{module_code}.{code}" not in permission_keys(db, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing permission")
        return current_user
    return dependency
