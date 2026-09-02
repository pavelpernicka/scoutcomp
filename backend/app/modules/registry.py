"""Registry for independently deployable application modules.

Adding a module is deliberately declarative: add a ModuleManifest below (or
register one during startup), provide its router and permissions.  The registry
seeds the database and is also the single source for administration and UI nav.
"""
from dataclasses import dataclass, field
from threading import RLock
from typing import Iterable

from fastapi import APIRouter, FastAPI
from sqlalchemy.orm import Session

from ..web.data_sources import WebDataSourceManifest

from ..models import (
    DirectUserPermission,
    DirectUserPermissionDeny,
    PermissionDefinition,
    PermissionGroup,
    PermissionGroupPermission,
    RegisteredModule,
    RoleEnum,
    User,
)


@dataclass(frozen=True)
class ModuleManifest:
    code: str
    name: str
    description: str
    icon: str
    route: str
    # (action, label, description, default_for_member, supported scopes)
    permissions: tuple[tuple[str, str, str, bool, tuple[str, ...]], ...] = field(default_factory=tuple)
    menu: tuple[dict, ...] = field(default_factory=tuple)
    admin_menu: tuple[dict, ...] = field(default_factory=tuple)
    widgets: tuple[dict, ...] = field(default_factory=tuple)
    # Reusable web page components (blocks) other modules provide to the web module.
    web_components: tuple[dict, ...] = field(default_factory=tuple)
    # Public, presentation-neutral data exposed to the website renderer.
    web_data_sources: tuple[WebDataSourceManifest, ...] = field(default_factory=tuple)
    routers: tuple[APIRouter, ...] = field(default_factory=tuple)
    dependencies: tuple[str, ...] = field(default_factory=tuple)
    version: str = "1.0.0"

    @property
    def api_prefixes(self) -> tuple[str, ...]:
        return tuple(
            route.path.rstrip("/") or "/"
            for router in self.routers
            for route in router.routes
            if getattr(route, "path", None)
        )

    @property
    def metadata(self) -> dict:
        return {
            "icon": self.icon,
            "route": self.route,
            "version": self.version,
            "menu_items": len(self.menu),
            "admin_menu_items": len(self.admin_menu),
            "widget_count": len(self.widgets),
            "web_component_count": len(self.web_components),
            "web_data_source_count": len(self.web_data_sources),
            "api_prefixes": list(self.api_prefixes),
            "router_count": len(self.routers),
        }


class ModuleRegistry:
    def __init__(self) -> None:
        self._modules: dict[str, ModuleManifest] = {}
        # Permission reads currently synchronize declarative manifests for
        # isolated databases as well as normal startup. Parallel API requests
        # must not race the idempotent-but-multi-statement group seeding.
        self._seed_lock = RLock()

    def register(self, manifest: ModuleManifest) -> None:
        if manifest.code in self._modules:
            raise ValueError(f"Module '{manifest.code}' is already registered")
        self._modules[manifest.code] = manifest

    def manifests(self) -> Iterable[ModuleManifest]:
        return self._modules.values()

    def get(self, code: str) -> ModuleManifest | None:
        return self._modules.get(code)

    def seed(self, db: Session) -> None:
        with self._seed_lock:
            self._seed(db)

    def _seed(self, db: Session) -> None:
        known = {manifest.code for manifest in self.manifests()}
        self._purge_unregistered(db, known)
        for manifest in self.manifests():
            self._purge_undeclared_permissions(db, manifest)
            record = db.query(RegisteredModule).filter_by(code=manifest.code).one_or_none()
            if record is None:
                record = RegisteredModule(code=manifest.code, name=manifest.name, description=manifest.description)
                db.add(record)
            else:
                record.name, record.description = manifest.name, manifest.description
            record.version = manifest.version
            record.dependencies = list(manifest.dependencies)
            record.module_metadata = manifest.metadata
            if manifest.code == "core":
                record.installed, record.enabled = True, True
            for code, name, description, default_for_member, scopes in manifest.permissions:
                permission = db.query(PermissionDefinition).filter_by(module_code=manifest.code, code=code).one_or_none()
                if permission is None:
                    db.add(PermissionDefinition(module_code=manifest.code, code=code, name=name,
                                                description=description, default_for_member=default_for_member, scopes=list(scopes)))
                else:
                    permission.name = name
                    permission.description = description
                    permission.default_for_member = default_for_member
                    permission.scopes = list(scopes)
        db.commit()
        self._seed_system_groups(db)
        self._scrub_widget_config(db)

    def _purge_unregistered(self, db: Session, known: set[str]) -> None:
        """Drop DB records for modules that no longer exist in the code registry.

        SQLite does not enforce ON DELETE CASCADE here, so join-table rows are
        removed explicitly before the permission definitions themselves.
        """
        stale = db.query(PermissionDefinition).filter(~PermissionDefinition.module_code.in_(known)).all()
        if stale:
            stale_ids = [permission.id for permission in stale]
            db.query(PermissionGroupPermission).filter(
                PermissionGroupPermission.permission_id.in_(stale_ids)
            ).delete(synchronize_session=False)
            db.query(DirectUserPermission).filter(
                DirectUserPermission.permission_id.in_(stale_ids)
            ).delete(synchronize_session=False)
            db.query(DirectUserPermissionDeny).filter(
                DirectUserPermissionDeny.permission_id.in_(stale_ids)
            ).delete(synchronize_session=False)
            for permission in stale:
                db.delete(permission)
        for record in db.query(RegisteredModule).filter(~RegisteredModule.code.in_(known)).all():
            db.delete(record)

    def _purge_undeclared_permissions(self, db: Session, manifest: ModuleManifest) -> None:
        """Remove permission definitions no longer declared by a registered module."""
        known_codes = {item[0] for item in manifest.permissions}
        query = db.query(PermissionDefinition).filter(PermissionDefinition.module_code == manifest.code)
        if known_codes:
            query = query.filter(~PermissionDefinition.code.in_(known_codes))
        stale = query.all()
        if not stale:
            return
        stale_ids = [permission.id for permission in stale]
        db.query(PermissionGroupPermission).filter(
            PermissionGroupPermission.permission_id.in_(stale_ids)
        ).delete(synchronize_session=False)
        db.query(DirectUserPermission).filter(
            DirectUserPermission.permission_id.in_(stale_ids)
        ).delete(synchronize_session=False)
        db.query(DirectUserPermissionDeny).filter(
            DirectUserPermissionDeny.permission_id.in_(stale_ids)
        ).delete(synchronize_session=False)
        for permission in stale:
            db.delete(permission)

    def _scrub_widget_config(self, db: Session) -> None:
        """Drop widget ids that no longer exist from the stored dashboard config."""
        known_widget_ids = {
            item.get("id") or f"{manifest.code}.{item['component']}"
            for manifest in self.manifests()
            for item in manifest.widgets
        }
        core = db.query(RegisteredModule).filter_by(code="core").one_or_none()
        if not core or not core.settings:
            return
        enabled = core.settings.get("widgets_enabled")
        if not isinstance(enabled, list):
            return
        cleaned = [widget_id for widget_id in enabled if widget_id in known_widget_ids]
        if cleaned == enabled:
            return
        settings = dict(core.settings)
        if cleaned:
            settings["widgets_enabled"] = cleaned
        else:
            settings.pop("widgets_enabled", None)  # empty = not configured = all enabled
        core.settings = settings

    def _seed_system_groups(self, db: Session) -> None:
        """One-way, idempotent migration from legacy roles to scoped groups.

        Three system groups exist:
        * ``Člen``            – the default group for members, ``any`` scope.
        * ``Vedoucí družiny`` – group admins; every team-scoped permission
          granted at ``team`` scope so they only act within their teams.
        * ``Superadmin``      – full access; every permission at ``any`` scope.
        """
        permissions = {
            f"{item.module_code}.{item.code}": item
            for item in db.query(PermissionDefinition).all()
        }
        member_defaults = [
            ("competitions.participate", "any"),
            ("competitions.rewards.read", "any"),
            ("core.events.read", "any"),
            ("core.users.read", "any"),
        ]
        team_grants = [
            (key, "team")
            for key, item in permissions.items()
            if "team" in (item.scopes or [])
        ]
        leader_grants = list(team_grants)
        if "core.is_leader" in permissions:
            leader_grants.append(("core.is_leader", "any"))
        definitions = {
            "Člen": ("Základní přístup člena oddílu", member_defaults),
            "Vedoucí družiny": ("Vedení družiny – oprávnění v rámci svěřených družin", leader_grants),
            "Superadmin": ("Úplná správa celé aplikace", [(key, "any") for key in permissions]),
        }
        groups: dict[str, PermissionGroup] = {}
        for name, (description, grants) in definitions.items():
            group = db.query(PermissionGroup).filter_by(name=name).one_or_none()
            if group is None:
                group = PermissionGroup(name=name, description=description, is_system=True)
                db.add(group); db.flush()
            group.is_system = True
            groups[name] = group
            existing = {grant.permission_id for grant in group.grants}
            for action, scope in grants:
                permission = permissions.get(action)
                if permission and permission.id not in existing:
                    db.add(PermissionGroupPermission(group_id=group.id, permission_id=permission.id, scope=scope))
        db.flush()
        for user in db.query(User).all():
            # Legacy roles are migration input only.  Once an account has at
            # least one permission group, its access is owned exclusively by
            # those groups and must not be silently restored from ``role`` on
            # every permission check (for example after an administrator
            # deliberately removes the Superadmin group).
            if not user.permission_groups:
                target = {RoleEnum.MEMBER: "Člen", RoleEnum.GROUP_ADMIN: "Vedoucí družiny", RoleEnum.ADMIN: "Superadmin"}.get(user.role, "Člen")
                user.permission_groups.append(groups[target])
            elif len(user.permission_groups) > 1:
                # Permission-group membership is intentionally singular. Older
                # versions appended a new group to the default Člen group.
                # Preserve Superadmin when present; otherwise keep the most
                # capable non-default group deterministically.
                current_groups = list(user.permission_groups)
                superadmin = next((group for group in current_groups if group.name == "Superadmin"), None)
                non_default = [group for group in current_groups if group.name != "Člen"]
                candidates = non_default or current_groups
                selected = superadmin or max(
                    candidates,
                    key=lambda group: (len(group.grants), -group.id),
                )
                user.permission_groups = [selected]
            # Keep the non-null legacy column in a neutral state until a
            # future schema migration can remove it.  No authorization or UI
            # behavior may depend on it after the group migration above.
            user.role = RoleEnum.MEMBER
        db.commit()

    def member_group(self, db: Session) -> PermissionGroup | None:
        """The default ``Člen`` group every user belongs to."""
        self.seed(db)
        return db.query(PermissionGroup).filter_by(name="Člen").one_or_none()

    def install(self, app: FastAPI, db: Session) -> None:
        self.seed(db)
        enabled = {item.code for item in db.query(RegisteredModule).filter_by(enabled=True, installed=True).all()}
        for manifest in self.manifests():
            if manifest.code in enabled:
                for router in manifest.routers:
                    app.include_router(router)


registry = ModuleRegistry()
