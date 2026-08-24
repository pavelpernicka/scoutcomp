from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..dependencies import get_current_active_user, get_db
from ..models import DirectUserPermission, DirectUserPermissionDeny, PermissionDefinition, PermissionGroup, PermissionGroupPermission, RegisteredModule, User
from ..permissions import allows, permission_keys
from ..modules import registry
from ..modules.translations import localized_menu_item, localized_widget, module_translation_keys

router = APIRouter(prefix="/modules", tags=["modules"])
admin_router = APIRouter(prefix="/admin/access", tags=["access management"])


def require_core_access(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)) -> User:
    if not allows(db, current_user, "core.access.manage"):
        raise HTTPException(403, "Missing core.access.manage")
    return current_user


def require_module_management(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)) -> User:
    if not allows(db, current_user, "core.modules.manage"):
        raise HTTPException(403, "Missing core.modules.manage")
    return current_user


SUPERADMIN_GROUP_NAME = "Superadmin"
MEMBER_GROUP_NAME = "Člen"


def superadmin_group(db: Session) -> PermissionGroup | None:
    return db.query(PermissionGroup).filter_by(name=SUPERADMIN_GROUP_NAME).one_or_none()


def member_group(db: Session) -> PermissionGroup | None:
    return db.query(PermissionGroup).filter_by(name=MEMBER_GROUP_NAME).one_or_none()


def _ensure_superadmin_exists(db: Session, user: User) -> None:
    """Failsafe: at least one user must keep the Superadmin group."""
    admin = superadmin_group(db)
    if admin is None:
        return
    if user in admin.members:
        return
    if not any(other.is_active for other in admin.members):
        raise HTTPException(400, "Alespoň jeden uživatel musí zůstat v superadmin skupině")


def _access_manage_group_ids(db: Session, user: User) -> set[int]:
    """Ids of permission groups that currently grant the user core.access.manage."""
    denied = {row.permission_id for row in db.query(DirectUserPermissionDeny).filter_by(user_id=user.id)}
    return {
        group.id
        for group in user.permission_groups
        for grant in group.grants
        if grant.permission_id not in denied
        and f"{grant.permission.module_code}.{grant.permission.code}" == "core.access.manage"
    }


def _access_manage_via_direct(db: Session, user: User) -> bool:
    denied = {row.permission_id for row in db.query(DirectUserPermissionDeny).filter_by(user_id=user.id)}
    return any(
        row.permission_id not in denied
        and f"{row.permission.module_code}.{row.permission.code}" == "core.access.manage"
        for row in db.query(DirectUserPermission).filter_by(user_id=user.id).all()
    )


def _ensure_access_manage_retained(db: Session, user: User, removed_group_ids: set[int]) -> None:
    """Failsafe: block a change that would strip the last source of core.access.manage."""
    if _access_manage_via_direct(db, user):
        return
    if not (_access_manage_group_ids(db, user) - removed_group_ids):
        raise HTTPException(400, "Nelze odebrat poslední oprávnění ke správě oprávnění (core.access.manage)")


def _grants_access_manage(db: Session, group) -> bool:
    return any(
        f"{grant.permission.module_code}.{grant.permission.code}" == "core.access.manage"
        for grant in group.grants
    )


def _ids_grant_access_manage(db: Session, permission_ids: set[int]) -> bool:
    if not permission_ids:
        return False
    return db.query(PermissionDefinition).filter(
        PermissionDefinition.id.in_(permission_ids),
        PermissionDefinition.module_code == "core",
        PermissionDefinition.code == "access.manage",
    ).first() is not None


@router.get("")
def list_modules(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    registry.seed(db)
    permissions = permission_keys(db, current_user)
    records = {m.code: m for m in db.query(RegisteredModule).filter_by(enabled=True, installed=True)}
    result = []
    for manifest in registry.manifests():
        if manifest.code not in records: continue
        result.append({
            "code": manifest.code,
            "name": manifest.name,
            "description": manifest.description,
            **module_translation_keys(manifest.code),
            "icon": manifest.icon,
            "route": manifest.route,
            "menu": [
                localized_menu_item(manifest.code, item, "menu")
                for item in manifest.menu
                if item.get("permission") in permissions
            ],
            "widgets": [
                localized_widget(manifest.code, item)
                for item in manifest.widgets
                if item.get("permission") in permissions
            ],
            "permissions": [p for p in permissions if p.startswith(f"{manifest.code}.")],
        })
    return result


@router.get("/admin-menu")
def admin_menu(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    registry.seed(db); permissions = permission_keys(db, current_user)
    records = {m.code: m for m in db.query(RegisteredModule).filter_by(enabled=True, installed=True)}
    return [
        {
            **localized_menu_item(manifest.code, item, "admin"),
            "module": manifest.code,
            "section_key": f"modules.{manifest.code}.name",
        }
        for manifest in registry.manifests()
        if manifest.code in records
        for item in manifest.admin_menu
        if item.get("permission") in permissions
    ]


@router.get("/all")
def list_all_modules(db: Session = Depends(get_db), _: User = Depends(require_module_management)):
    registry.seed(db)
    manifests = {m.code: m for m in registry.manifests()}
    dependents = {code: [other.code for other in registry.manifests() if code in other.dependencies] for code in manifests}
    permissions = {m.code: [{"action": f"{p.module_code}.{p.code}", "name": p.name, "code": p.code, "description": p.description, "default_for_member": p.default_for_member, "scopes": p.scopes or ["any"]} for p in db.query(PermissionDefinition).filter_by(module_code=m.code)] for m in registry.manifests()}
    result = []
    for m in db.query(RegisteredModule).order_by(RegisteredModule.name).all():
        manifest = manifests.get(m.code)
        result.append({
            "code": m.code, "name": m.name, "description": m.description,
            **module_translation_keys(m.code),
            "enabled": m.enabled, "installed": m.installed, "settings": m.settings or {},
            "catalog": m.code in manifests,
            "dependencies": list(manifest.dependencies) if manifest else list(m.dependencies or []),
            "dependents": dependents.get(m.code, []),
            "metadata": m.module_metadata or {},
            "permissions": permissions.get(m.code, []),
        })
    for code, manifest in manifests.items():
        if all(r["code"] != code for r in result):
            result.append({
                "code": code, "name": manifest.name, "description": manifest.description,
                **module_translation_keys(code),
                "enabled": False, "installed": False, "settings": {},
                "catalog": True,
                "dependencies": list(manifest.dependencies),
                "dependents": dependents.get(code, []),
                "metadata": manifest.metadata,
                "permissions": permissions.get(code, []),
            })
    return sorted(result, key=lambda r: r["name"])


@router.get("/all/{code}")
def module_detail(code: str, db: Session = Depends(get_db), _: User = Depends(require_module_management)):
    registry.seed(db)
    record = db.query(RegisteredModule).filter_by(code=code).one_or_none()
    manifest = next((m for m in registry.manifests() if m.code == code), None)
    if not record and not manifest:
        raise HTTPException(404, "Unknown module")
    permissions = [{"action": f"{p.module_code}.{p.code}", "code": p.code, "name": p.name,
                    "description": p.description, "default_for_member": p.default_for_member, "scopes": p.scopes or ["any"]}
                   for p in db.query(PermissionDefinition).filter_by(module_code=code)]
    return {
        "code": code,
        "name": (record or manifest).name,
        "description": (record or manifest).description,
        **module_translation_keys(code),
        "enabled": record.enabled if record else False,
        "installed": record.installed if record else False,
        "settings": record.settings or {} if record else {},
        "catalog": manifest is not None,
        "dependencies": list(manifest.dependencies) if manifest else list(record.dependencies or []),
        "dependents": [other.code for other in registry.manifests() if code in other.dependencies],
        "metadata": (record.module_metadata or {}) if record else (manifest.metadata if manifest else {}),
        "menu": [localized_menu_item(code, item, "menu") for item in manifest.menu] if manifest else [],
        "admin_menu": [localized_menu_item(code, item, "admin") for item in manifest.admin_menu] if manifest else [],
        "widgets": [localized_widget(code, item) for item in manifest.widgets] if manifest else [],
        "permissions": permissions,
    }


class ModuleUpdate(BaseModel):
    enabled: bool | None = None
    installed: bool | None = None
    settings: dict = Field(default_factory=dict)


@router.patch("/{code}")
def update_module(code: str, payload: ModuleUpdate, db: Session = Depends(get_db), _: User = Depends(require_module_management)):
    item = db.query(RegisteredModule).filter_by(code=code).one_or_none()
    if not item: raise HTTPException(404, "Unknown module")
    if code == "core" and (payload.enabled is False or payload.installed is False):
        raise HTTPException(400, "Core module is required and cannot be disabled or uninstalled")
    if payload.installed is True or payload.enabled is True:
        manifest = next((m for m in registry.manifests() if m.code == code), None)
        missing = [dependency for dependency in (manifest.dependencies if manifest else ()) if not (db.query(RegisteredModule).filter_by(code=dependency, installed=True, enabled=True).one_or_none())]
        if missing: raise HTTPException(409, f"Missing active dependencies: {', '.join(missing)}")
    dependents = [m.code for m in registry.manifests() if code in m.dependencies]
    active_dependents = [item for item in db.query(RegisteredModule).filter(RegisteredModule.code.in_(dependents), RegisteredModule.installed.is_(True), RegisteredModule.enabled.is_(True)).all()]
    if (payload.installed is False or payload.enabled is False) and active_dependents:
        raise HTTPException(409, f"Required by active modules: {', '.join(item.code for item in active_dependents)}")
    if payload.enabled is not None: item.enabled = payload.enabled
    if payload.installed is not None: item.installed = payload.installed
    if payload.settings: item.settings = payload.settings
    db.commit()
    return {"code": item.code, "enabled": item.enabled, "installed": item.installed, "settings": item.settings}


class PermissionGroupPayload(BaseModel):
    name: str
    description: str | None = None
    permission_ids: list[int] = []
    grants: list[dict] = []


@admin_router.get("/permissions")
def list_permissions(db: Session = Depends(get_db), _: User = Depends(require_core_access)):
    registry.seed(db)
    module_names = {manifest.code: manifest.name for manifest in registry.manifests()}
    return [{"id": p.id, "module_code": p.module_code, "module_name": module_names.get(p.module_code, p.module_code),
             "code": p.code, "name": p.name,
             "description": p.description, "default_for_member": p.default_for_member, "scopes": p.scopes or ["any"], "action": f"{p.module_code}.{p.code}"}
            for p in db.query(PermissionDefinition).order_by(PermissionDefinition.module_code, PermissionDefinition.code)]


@admin_router.get("/groups")
def list_groups(db: Session = Depends(get_db), _: User = Depends(require_core_access)):
    return [{"id": g.id, "name": g.name, "description": g.description, "is_system": g.is_system,
             "permission_ids": [p.id for p in g.permissions], "grants": [{"permission_id": x.permission_id, "scope": x.scope} for x in g.grants], "member_ids": [u.id for u in g.members]}
            for g in db.query(PermissionGroup).all()]


@admin_router.post("/groups")
def create_group(payload: PermissionGroupPayload, db: Session = Depends(get_db), _: User = Depends(require_core_access)):
    ids = [g.get("permission_id") for g in payload.grants] or payload.permission_ids
    permissions = db.query(PermissionDefinition).filter(PermissionDefinition.id.in_(ids)).all()
    if len(permissions) != len(set(ids)): raise HTTPException(404, "Unknown permission")
    group = PermissionGroup(name=payload.name, description=payload.description)
    db.add(group); db.commit(); db.refresh(group)
    for grant in payload.grants or [{"permission_id": item, "scope":"any"} for item in payload.permission_ids]: db.add(PermissionGroupPermission(group_id=group.id, permission_id=grant["permission_id"], scope=grant.get("scope", "any")))
    db.commit()
    return {"id": group.id, "name": group.name}


@admin_router.put("/groups/{group_id}")
def update_group(group_id: int, payload: PermissionGroupPayload, db: Session = Depends(get_db), current_user: User = Depends(require_core_access)):
    group = db.get(PermissionGroup, group_id)
    if not group: raise HTTPException(404, "Unknown permission group")
    is_superadmin = group.name == SUPERADMIN_GROUP_NAME and group.is_system
    if is_superadmin:
        # Superadmin always holds every permission at `any` scope.
        all_ids = [permission.id for permission in db.query(PermissionDefinition).all()]
        new_ids = set(all_ids)
        payload = PermissionGroupPayload(
            name=SUPERADMIN_GROUP_NAME,
            description=payload.description or group.description,
            grants=[{"permission_id": permission_id, "scope": "any"} for permission_id in all_ids],
        )
    else:
        new_ids = {g["permission_id"] for g in (payload.grants or [{"permission_id": item, "scope": "any"} for item in payload.permission_ids])}
    if group.id in _access_manage_group_ids(db, current_user) and not _ids_grant_access_manage(db, new_ids):
        _ensure_access_manage_retained(db, current_user, {group.id})
    group.name, group.description = payload.name, payload.description
    db.query(PermissionGroupPermission).filter_by(group_id=group_id).delete()
    for grant in payload.grants or [{"permission_id": item, "scope":"any"} for item in payload.permission_ids]: db.add(PermissionGroupPermission(group_id=group_id, permission_id=grant["permission_id"], scope=grant.get("scope", "any")))
    db.commit(); return {"id": group.id, "name": group.name}


@admin_router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_core_access)):
    group = db.get(PermissionGroup, group_id)
    if not group: raise HTTPException(404, "Unknown permission group")
    if group.is_system: raise HTTPException(400, "Systémovou skupinu nelze smazat")
    _ensure_access_manage_retained(db, current_user, _access_manage_group_ids(db, current_user) & {group.id})
    db.delete(group); db.commit()


@admin_router.delete("/groups/{group_id}/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_user_from_group(group_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_core_access)):
    group = db.get(PermissionGroup, group_id)
    user = db.get(User, user_id)
    if not group or not user: raise HTTPException(404, "Unknown permission group or user")
    if group not in user.permission_groups: raise HTTPException(404, "User is not a member of the group")
    if user_id == current_user.id and group.id in _access_manage_group_ids(db, current_user):
        _ensure_access_manage_retained(db, current_user, {group.id})
    user.permission_groups.remove(group)
    if group.name == SUPERADMIN_GROUP_NAME:
        _ensure_superadmin_exists(db, current_user)
    db.commit()


@admin_router.put("/users/{user_id}/groups")
def assign_user_groups(user_id: int, group_ids: list[int], db: Session = Depends(get_db), current_user: User = Depends(require_core_access)):
    user = db.get(User, user_id)
    if not user: raise HTTPException(404, "Unknown user")
    user.permission_groups = db.query(PermissionGroup).filter(PermissionGroup.id.in_(group_ids)).all()
    if user_id == current_user.id and "core.access.manage" not in permission_keys(db, current_user):
        db.rollback()
        raise HTTPException(400, "Nelze odebrat poslední oprávnění ke správě oprávnění (core.access.manage)")
    admin = superadmin_group(db)
    if admin is not None and admin not in user.permission_groups and not any(other.is_active for other in admin.members):
        db.rollback()
        raise HTTPException(400, "Alespoň jeden uživatel musí zůstat v superadmin skupině")
    db.commit(); return {"user_id": user_id, "group_ids": [g.id for g in user.permission_groups]}


class UserPermissionsPayload(BaseModel):
    grant_ids: list[int] = []
    deny_ids: list[int] = []


@admin_router.put("/users/{user_id}/permissions")
def set_direct_permissions(user_id: int, payload: UserPermissionsPayload, db: Session = Depends(get_db), current_user: User = Depends(require_core_access)):
    """Per-user exceptions; deny always overrides a group or member default."""
    if set(payload.grant_ids) & set(payload.deny_ids): raise HTTPException(400, "A permission cannot be granted and denied")
    user = db.get(User, user_id)
    permissions = db.query(PermissionDefinition).filter(PermissionDefinition.id.in_(set(payload.grant_ids) | set(payload.deny_ids))).all()
    if not user or len(permissions) != len(set(payload.grant_ids) | set(payload.deny_ids)): raise HTTPException(404, "Unknown user or permission")
    db.query(DirectUserPermission).filter_by(user_id=user_id).delete()
    db.query(DirectUserPermissionDeny).filter_by(user_id=user_id).delete()
    for permission_id in payload.grant_ids: db.add(DirectUserPermission(user_id=user_id, permission_id=permission_id))
    for permission_id in payload.deny_ids: db.add(DirectUserPermissionDeny(user_id=user_id, permission_id=permission_id))
    if user_id == current_user.id and "core.access.manage" not in permission_keys(db, current_user):
        db.rollback()
        raise HTTPException(400, "Nelze odebrat poslední oprávnění ke správě oprávnění (core.access.manage)")
    db.commit()
    return {"user_id": user_id, "permissions": sorted(permission_keys(db, user))}
