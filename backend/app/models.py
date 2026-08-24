from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
    Index,
    Integer,
    JSON,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship

from .database import Base


class RoleEnum(str, Enum):
    ADMIN = "admin"
    MEMBER = "member"
    GROUP_ADMIN = "group_admin"


class TaskPeriodUnit(str, Enum):
    HOUR = "hour"
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class TaskAutoCloseScope(str, Enum):
    GLOBAL = "global"
    TEAM = "team"


class StatMetricEnum(str, Enum):
    POINTS = "points"
    COMPLETIONS = "completions"


class CompletionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class InventoryItemStatus(str, Enum):
    AVAILABLE = "available"
    MISSING = "missing"
    DAMAGED = "damaged"
    MAINTENANCE = "maintenance"


class InventoryHistoryAction(str, Enum):
    CREATED = "created"
    UPDATED = "updated"
    LOCATION_CHANGED = "location_changed"
    LOANED = "loaned"
    RETURNED = "returned"
    EVENT_ASSIGNED = "event_assigned"
    EVENT_RETURNED = "event_returned"
    MARKED_MISSING = "marked_missing"
    MARKED_DAMAGED = "marked_damaged"
    QR_SCANNED = "qr_scanned"
    PHOTO_ADDED = "photo_added"
    PHOTO_REMOVED = "photo_removed"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    real_name = Column(String(150), nullable=False)
    email = Column(String(255), unique=True, nullable=True, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(RoleEnum), default=RoleEnum.MEMBER, nullable=False)
    preferred_language = Column(String(8), default="cs", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
    first_login_at = Column(DateTime, nullable=True)  # Track first login for password change prompt
    receive_messages = Column(Boolean, default=True, nullable=False)
    push_show_previews = Column(Boolean, default=False, nullable=False)
    avatar = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="members")
    completions = relationship(
        "Completion",
        back_populates="member",
        cascade="all, delete-orphan",
        foreign_keys="Completion.member_id",
    )
    admin_reviews = relationship(
        "Completion",
        back_populates="reviewer",
        foreign_keys="Completion.reviewer_id",
    )
    refresh_tokens = relationship(
        "RefreshToken",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    audit_logs = relationship(
        "AuditLog",
        back_populates="actor",
        cascade="all, delete-orphan",
    )
    notifications = relationship(
        "Notification",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="Notification.user_id",
    )
    sent_notifications = relationship(
        "Notification",
        back_populates="sender",
        foreign_keys="Notification.sender_id",
    )
    managed_teams = relationship(
        "Team",
        secondary="group_admin_teams",
        back_populates="group_admins",
    )
    dashboard_messages = relationship(
        "DashboardMessage",
        back_populates="creator",
        foreign_keys="DashboardMessage.created_by_id",
    )
    inventory_history_entries = relationship(
        "InventoryHistory",
        back_populates="actor",
        foreign_keys="InventoryHistory.actor_id",
    )
    permission_groups = relationship(
        "PermissionGroup",
        secondary="user_permission_groups",
        back_populates="members",
    )
    member_profile = relationship(
        "MemberProfile",
        back_populates="user",
        uselist=False,
        cascade="all, delete-orphan",
    )
    member_tags = relationship(
        "MemberTag",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    push_subscriptions = relationship(
        "PushSubscription",
        back_populates="user",
        cascade="all, delete-orphan",
    )


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    join_code = Column(String(32), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    logo = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    members = relationship("User", back_populates="team")
    tasks = relationship("Task", back_populates="team")
    group_admins = relationship(
        "User",
        secondary="group_admin_teams",
        back_populates="managed_teams",
    )
    dashboard_messages = relationship(
        "DashboardMessage",
        back_populates="team",
        cascade="all, delete-orphan",
    )


class Task(Base):
    __tablename__ = "tasks"
    __table_args__ = (
        UniqueConstraint("team_id", "name", name="uq_task_team_name"),
    )

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    start_time = Column(DateTime, default=func.now(), nullable=False)
    end_time = Column(DateTime, nullable=True)
    points_per_completion = Column(Float, nullable=False)
    max_per_period = Column(Integer, nullable=True)
    period_unit = Column(SAEnum(TaskPeriodUnit), nullable=True)
    period_count = Column(Integer, nullable=True)
    requires_approval = Column(Boolean, default=False, nullable=False)
    is_archived = Column(Boolean, default=False, nullable=False)
    hot_deal = Column(Boolean, default=False, nullable=False)
    auto_close_after_completions = Column(Integer, nullable=True)
    auto_close_scope = Column(SAEnum(TaskAutoCloseScope), nullable=True)
    auto_closed_at = Column(DateTime, nullable=True)
    auto_close_reset_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="tasks")
    completions = relationship("Completion", back_populates="task")
    variants = relationship("TaskVariant", back_populates="task", order_by="TaskVariant.position")
    team_closures = relationship("TaskTeamClosure", back_populates="task", cascade="all, delete-orphan")


class TaskTeamClosure(Base):
    __tablename__ = "task_team_closures"
    __table_args__ = (UniqueConstraint("task_id", "team_id", name="uq_task_team_closure"),)

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    closed_at = Column(DateTime, default=func.now(), nullable=False)

    task = relationship("Task", back_populates="team_closures")
    team = relationship("Team")


class TaskVariant(Base):
    __tablename__ = "task_variants"
    __table_args__ = (
        UniqueConstraint("task_id", "name", name="uq_task_variant_name"),
        UniqueConstraint("task_id", "position", name="uq_task_variant_position"),
    )

    id = Column(Integer, primary_key=True, index=True)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    points = Column(Float, nullable=False)
    position = Column(Integer, default=0, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    task = relationship("Task", back_populates="variants")
    completions = relationship("Completion", back_populates="variant")


class Completion(Base):
    __tablename__ = "completions"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    variant_id = Column(Integer, ForeignKey("task_variants.id", ondelete="SET NULL"), nullable=True)
    status = Column(SAEnum(CompletionStatus), default=CompletionStatus.PENDING, nullable=False)
    submitted_at = Column(DateTime, default=func.now(), nullable=False)
    reviewed_at = Column(DateTime, nullable=True)
    reviewer_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    member_note = Column(Text, nullable=True)
    admin_note = Column(Text, nullable=True)
    points_awarded = Column(Float, nullable=False, default=0.0)
    count = Column(Integer, nullable=False, default=1)

    member = relationship("User", back_populates="completions", foreign_keys=[member_id])
    reviewer = relationship("User", back_populates="admin_reviews", foreign_keys=[reviewer_id])
    task = relationship("Task", back_populates="completions")
    variant = relationship("TaskVariant", back_populates="completions")


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User", back_populates="refresh_tokens")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)
    target_type = Column(String(100), nullable=False)
    target_id = Column(String(64), nullable=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    actor = relationship("User", back_populates="audit_logs")


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    read_at = Column(DateTime, nullable=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    user = relationship("User", back_populates="notifications", foreign_keys=[user_id])
    sender = relationship("User", back_populates="sent_notifications", foreign_keys=[sender_id])


class GroupAdminTeam(Base):
    __tablename__ = "group_admin_teams"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), primary_key=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class DashboardMessage(Base):
    __tablename__ = "dashboard_messages"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(150), nullable=True)
    body = Column(Text, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    team = relationship("Team", back_populates="dashboard_messages")
    creator = relationship("User", back_populates="dashboard_messages")


class StatCategory(Base):
    __tablename__ = "stat_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    icon = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    components = relationship(
        "StatCategoryComponent",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="StatCategoryComponent.position",
    )


class StatCategoryComponent(Base):
    __tablename__ = "stat_category_components"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("stat_categories.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
    metric = Column(SAEnum(StatMetricEnum), nullable=False, default=StatMetricEnum.POINTS)
    weight = Column(Float, nullable=False, default=1.0)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    category = relationship("StatCategory", back_populates="components")
    task = relationship("Task")


class StaticPage(Base):
    __tablename__ = "static_pages"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, nullable=False)
    content = Column(Text, nullable=False, default="")
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class InventorySet(Base):
    __tablename__ = "inventory_sets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    flag_id = Column(Integer, ForeignKey("inventory_flags.id", ondelete="SET NULL"), nullable=True, index=True)
    default_location = Column(String(200), nullable=True)
    current_location = Column(String(200), nullable=True)
    status = Column(SAEnum(InventoryItemStatus), nullable=False, default=InventoryItemStatus.AVAILABLE)
    notes = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    items = relationship("InventoryItem", back_populates="inventory_set")


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(120), nullable=True, index=True)
    flag_id = Column(Integer, ForeignKey("inventory_flags.id", ondelete="SET NULL"), nullable=True, index=True)
    set_id = Column(Integer, ForeignKey("inventory_sets.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity = Column(Integer, nullable=False, default=1)
    quantity_unit = Column(String(32), nullable=False, default="ks")
    default_location = Column(String(200), nullable=True)
    current_location = Column(String(200), nullable=True)
    status = Column(SAEnum(InventoryItemStatus), nullable=False, default=InventoryItemStatus.AVAILABLE)
    notes = Column(Text, nullable=True)
    qr_identifier = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    flag = relationship("InventoryFlag", back_populates="items")
    inventory_set = relationship("InventorySet", back_populates="items")
    photos = relationship(
        "InventoryPhoto",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="InventoryPhoto.position",
    )
    history_entries = relationship(
        "InventoryHistory",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="InventoryHistory.created_at.desc()",
    )
    loans = relationship(
        "InventoryLoan",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="InventoryLoan.borrowed_at.desc()",
    )
    locations = relationship(
        "InventoryItemLocation",
        back_populates="item",
        cascade="all, delete-orphan",
        order_by="InventoryItemLocation.location.asc()",
    )


class InventoryPhoto(Base):
    __tablename__ = "inventory_photos"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    image_url = Column(Text, nullable=False)
    caption = Column(String(200), nullable=True)
    position = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    item = relationship("InventoryItem", back_populates="photos")


class InventoryItemLocation(Base):
    __tablename__ = "inventory_item_locations"
    __table_args__ = (UniqueConstraint("item_id", "location", name="uq_inventory_item_location"),)

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    location = Column(String(200), nullable=False)
    quantity = Column(Integer, nullable=False, default=0)

    item = relationship("InventoryItem", back_populates="locations")


class InventoryLoan(Base):
    __tablename__ = "inventory_loans"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    borrower_name = Column(String(200), nullable=False)
    borrowed_at = Column(DateTime, nullable=False, default=func.now())
    due_at = Column(DateTime, nullable=True)
    returned_at = Column(DateTime, nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    source_location = Column(String(200), nullable=True)
    note = Column(Text, nullable=True)
    item = relationship("InventoryItem", back_populates="loans")


class InventoryHistory(Base):
    __tablename__ = "inventory_history"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    # Legacy audit records retain their former event identifier only as a scalar;
    # actions are no longer part of the inventory domain.
    event_id = Column(Integer, nullable=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(SAEnum(InventoryHistoryAction), nullable=False, index=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    item = relationship("InventoryItem", back_populates="history_entries")
    actor = relationship("User", back_populates="inventory_history_entries")


class InventoryLabelTemplate(Base):
    __tablename__ = "inventory_label_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    width_mm = Column(Float, nullable=False, default=62)
    height_mm = Column(Float, nullable=False, default=29)
    qr_size_mm = Column(Float, nullable=False, default=18)
    fields = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class InventoryLocation(Base):
    __tablename__ = "inventory_locations"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("inventory_locations.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    path = Column(String(500), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    parent = relationship("InventoryLocation", remote_side=[id], back_populates="children")
    children = relationship(
        "InventoryLocation",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="InventoryLocation.sort_order",
    )


class InventoryCategory(Base):
    __tablename__ = "inventory_categories"

    id = Column(Integer, primary_key=True, index=True)
    parent_id = Column(Integer, ForeignKey("inventory_categories.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    path = Column(String(500), nullable=False, index=True)
    color = Column(String(16), nullable=False, default="#5b8def")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    parent = relationship("InventoryCategory", remote_side=[id], back_populates="children")
    children = relationship(
        "InventoryCategory",
        back_populates="parent",
        cascade="all, delete-orphan",
        order_by="InventoryCategory.sort_order",
    )


class InventoryFlag(Base):
    __tablename__ = "inventory_flags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(32), nullable=False, default="neutral")
    is_system = Column(Boolean, nullable=False, default=False)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    items = relationship("InventoryItem", back_populates="flag")


class PermissionDefinition(Base):
    __tablename__ = "permission_definitions"
    __table_args__ = (
        UniqueConstraint("module_code", "code", name="uq_permission_module_code"),
    )

    id = Column(Integer, primary_key=True)
    module_code = Column(String(80), nullable=False, index=True)
    code = Column(String(100), nullable=False)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    default_for_member = Column(Boolean, nullable=False, default=False)
    scopes = Column(JSON, nullable=True)


class DirectUserPermission(Base):
    __tablename__ = "direct_user_permissions"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(
        Integer,
        ForeignKey("permission_definitions.id", ondelete="CASCADE"),
        primary_key=True,
    )

    permission = relationship("PermissionDefinition")


class DirectUserPermissionDeny(Base):
    __tablename__ = "direct_user_permission_denies"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    permission_id = Column(
        Integer,
        ForeignKey("permission_definitions.id", ondelete="CASCADE"),
        primary_key=True,
    )

    permission = relationship("PermissionDefinition")


class PermissionGroup(Base):
    __tablename__ = "permission_groups"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), nullable=False, unique=True)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    grants = relationship(
        "PermissionGroupPermission",
        back_populates="group",
        cascade="all, delete-orphan",
    )
    permissions = relationship(
        "PermissionDefinition",
        secondary="permission_group_permissions",
        viewonly=True,
    )
    members = relationship(
        "User",
        secondary="user_permission_groups",
        back_populates="permission_groups",
    )


class PermissionGroupPermission(Base):
    __tablename__ = "permission_group_permissions"

    group_id = Column(
        Integer,
        ForeignKey("permission_groups.id", ondelete="CASCADE"),
        primary_key=True,
    )
    permission_id = Column(
        Integer,
        ForeignKey("permission_definitions.id", ondelete="CASCADE"),
        primary_key=True,
    )
    scope = Column(String(32), nullable=False, default="any")

    group = relationship("PermissionGroup", back_populates="grants")
    permission = relationship("PermissionDefinition")


class UserPermissionGroup(Base):
    __tablename__ = "user_permission_groups"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    group_id = Column(Integer, ForeignKey("permission_groups.id", ondelete="CASCADE"), primary_key=True)


class RegisteredModule(Base):
    __tablename__ = "registered_modules"

    id = Column(Integer, primary_key=True)
    code = Column(String(80), nullable=False, unique=True, index=True)
    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)
    version = Column(String(32), nullable=False, default="1.0.0")
    enabled = Column(Boolean, nullable=False, default=True)
    settings = Column(JSON, nullable=False, default=dict)
    installed = Column(Boolean, nullable=False, default=True)
    dependencies = Column(JSON, nullable=False, default=list)
    module_metadata = Column("metadata", JSON, nullable=False, default=dict)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class ScoutEvent(Base):
    __tablename__ = "scout_events"

    id = Column(Integer, primary_key=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    kind = Column(String(30), nullable=False, default="meeting")
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=True)
    location = Column(String(200), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    color = Column(String(16), nullable=True)
    audience = Column(String(20), nullable=False, default="members")
    requires_planned = Column(Boolean, nullable=False, default=False)
    planned_deadline = Column(DateTime, nullable=True)
    is_public = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team")
    attendances = relationship(
        "ScoutAttendance",
        back_populates="event",
        cascade="all, delete-orphan",
    )


class ScoutAttendance(Base):
    __tablename__ = "scout_attendances"

    id = Column(Integer, primary_key=True)
    event_id = Column(Integer, ForeignKey("scout_events.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    mode = Column(String(20), nullable=False, default="real")
    status = Column(String(20), nullable=False, default="present")
    note = Column(Text, nullable=True)
    marked_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    marked_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=True)

    __table_args__ = (
        UniqueConstraint("event_id", "user_id", "mode", name="uq_scout_event_user"),
    )

    event = relationship("ScoutEvent", back_populates="attendances")
    user = relationship("User", foreign_keys=[user_id])


class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True)
    title = Column(String(150), nullable=True)
    body = Column(Text, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    team = relationship("Team")
    creator = relationship("User", foreign_keys=[created_by_id])



class DirectMessage(Base):
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    body = Column(Text, nullable=False)
    read_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    sender = relationship("User", foreign_keys=[sender_id])
    recipient = relationship("User", foreign_keys=[recipient_id])


class MemberStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ALUMNI = "alumni"


class MemberTag(Base):
    __tablename__ = "member_tags"
    __table_args__ = (
        UniqueConstraint("user_id", "tag", name="uq_member_tag"),
    )

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    tag = Column(String(50), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    user = relationship("User", back_populates="member_tags")


class MemberProfile(Base):
    __tablename__ = "member_profiles"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at = Column(Date, nullable=True)
    member_status = Column(SAEnum(MemberStatus), nullable=False, default=MemberStatus.ACTIVE)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="member_profile")


class MemberNote(Base):
    __tablename__ = "member_notes"

    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    author = relationship("User", foreign_keys=[author_id])


class WebPage(Base):
    __tablename__ = "web_pages"

    id = Column(Integer, primary_key=True)
    slug = Column(String(200), nullable=False, unique=True, index=True)
    path_segment = Column(String(200), nullable=True)
    path = Column(String(500), nullable=True, unique=True, index=True)
    title = Column(String(200), nullable=False)
    template = Column(String(50), nullable=True)
    template_id = Column(Integer, ForeignKey("web_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    source_template_id = Column(Integer, ForeignKey("web_templates.id", ondelete="SET NULL"), nullable=True, index=True)
    source_template_version = Column(Integer, nullable=True)
    data = Column(JSON, nullable=True)
    html = Column(Text, nullable=True)
    published = Column(Boolean, nullable=False, default=False)
    draft_version = Column(Integer, nullable=False, default=1)
    published_revision_id = Column(
        Integer, ForeignKey("web_page_revisions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    position = Column(Integer, nullable=False, default=0)
    parent_id = Column(Integer, ForeignKey("web_pages.id", ondelete="SET NULL"), nullable=True, index=True)
    meta_description = Column(String(300), nullable=True)
    seo_title = Column(String(200), nullable=True)
    canonical_url = Column(String(500), nullable=True)
    og_image_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    noindex = Column(Boolean, nullable=False, default=False)
    sitemap_include = Column(Boolean, nullable=False, default=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    # A soft-deleted page releases its public address. These fields retain the
    # original identity so restore can be explicit and collision-safe.
    trashed_slug = Column(String(200), nullable=True)
    trashed_path_segment = Column(String(200), nullable=True)
    trashed_path = Column(String(500), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])


class WebPageRevision(Base):
    __tablename__ = "web_page_revisions"
    __table_args__ = (
        UniqueConstraint("page_id", "revision_number", name="uq_web_page_revision_number"),
    )

    id = Column(Integer, primary_key=True)
    page_id = Column(Integer, ForeignKey("web_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    html = Column(Text, nullable=True)
    data = Column(JSON, nullable=True)
    revision_number = Column(Integer, nullable=True)
    source_version = Column(Integer, nullable=False, default=1)
    title = Column(String(200), nullable=True)
    path_segment = Column(String(200), nullable=True)
    path = Column(String(500), nullable=True)
    template_key = Column(String(100), nullable=True)
    template_id = Column(Integer, ForeignKey("web_templates.id", ondelete="SET NULL"), nullable=True)
    compiled_tree = Column(JSON, nullable=True)
    compiled_css = Column(Text, nullable=True)
    # Fully rendered immutable public document(s). The public app must only
    # read these artifacts, never compile/render a draft or publication at
    # request time. Variants are keyed by a canonical query string (currently
    # pagination uses ``page=N``).
    rendered_html = Column(Text, nullable=True)
    rendered_variants = Column(JSON, nullable=True)
    rendered_at = Column(DateTime, nullable=True)
    reason = Column(String(32), nullable=True)
    is_publication = Column(Boolean, nullable=False, default=False)
    seo_title = Column(String(200), nullable=True)
    meta_description = Column(String(300), nullable=True)
    canonical_url = Column(String(500), nullable=True)
    og_image_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    noindex = Column(Boolean, nullable=False, default=False)
    sitemap_include = Column(Boolean, nullable=False, default=True)
    # Public routing/data context is part of an immutable publication, not a
    # pointer back to the mutable WebPage draft.
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])


class WebPost(Base):
    __tablename__ = "web_posts"

    id = Column(Integer, primary_key=True)
    title = Column(String(200), nullable=False)
    slug = Column(String(200), nullable=False, unique=True, index=True)
    excerpt = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    cover_media_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    event_id = Column(Integer, ForeignKey("scout_events.id", ondelete="SET NULL"), nullable=True, index=True)
    published = Column(Boolean, nullable=False, default=False)
    draft_version = Column(Integer, nullable=False, default=1)
    published_revision_id = Column(
        Integer, ForeignKey("web_post_revisions.id", ondelete="SET NULL"), nullable=True, index=True
    )
    published_at = Column(DateTime, nullable=True)
    deleted_at = Column(DateTime, nullable=True, index=True)
    seo_title = Column(String(200), nullable=True)
    meta_description = Column(String(300), nullable=True)
    canonical_url = Column(String(500), nullable=True)
    og_image_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    noindex = Column(Boolean, nullable=False, default=False)
    sitemap_include = Column(Boolean, nullable=False, default=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])
    cover = relationship("WebMedia", foreign_keys=[cover_media_id])
    event = relationship("ScoutEvent", foreign_keys=[event_id])


class WebPostRevision(Base):
    __tablename__ = "web_post_revisions"
    __table_args__ = (
        UniqueConstraint("post_id", "revision_number", name="uq_web_post_revision_number"),
    )

    id = Column(Integer, primary_key=True)
    post_id = Column(Integer, ForeignKey("web_posts.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(200), nullable=True)
    slug = Column(String(200), nullable=True)
    excerpt = Column(String(500), nullable=True)
    body = Column(Text, nullable=True)
    cover_media_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    event_id = Column(Integer, ForeignKey("scout_events.id", ondelete="SET NULL"), nullable=True)
    compiled_html = Column(Text, nullable=True)
    revision_number = Column(Integer, nullable=True)
    source_version = Column(Integer, nullable=False, default=1)
    reason = Column(String(32), nullable=True)
    is_publication = Column(Boolean, nullable=False, default=False)
    seo_title = Column(String(200), nullable=True)
    meta_description = Column(String(300), nullable=True)
    canonical_url = Column(String(500), nullable=True)
    og_image_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    noindex = Column(Boolean, nullable=False, default=False)
    sitemap_include = Column(Boolean, nullable=False, default=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    created_by = relationship("User", foreign_keys=[created_by_id])


class WebMenu(Base):
    __tablename__ = "web_menus"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    location = Column(String(50), nullable=False, unique=True)
    draft_version = Column(Integer, nullable=False, default=1)
    published_revision_id = Column(Integer, ForeignKey("web_menu_revisions.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class WebMenuItem(Base):
    __tablename__ = "web_menu_items"

    id = Column(Integer, primary_key=True)
    menu_id = Column(Integer, ForeignKey("web_menus.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(100), nullable=False)
    page_slug = Column(String(200), nullable=True)
    url = Column(String(500), nullable=True)
    parent_id = Column(Integer, ForeignKey("web_menu_items.id", ondelete="CASCADE"), nullable=True, index=True)
    position = Column(Integer, nullable=False, default=0)
    item_type = Column(String(32), nullable=False, default="external")
    page_id = Column(Integer, ForeignKey("web_pages.id", ondelete="SET NULL"), nullable=True)
    post_id = Column(Integer, ForeignKey("web_posts.id", ondelete="SET NULL"), nullable=True)
    target = Column(String(32), nullable=True)
    rel = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class WebMenuRevision(Base):
    __tablename__ = "web_menu_revisions"
    __table_args__ = (
        UniqueConstraint("menu_id", "revision_number", name="uq_web_menu_revision_number"),
    )

    id = Column(Integer, primary_key=True)
    menu_id = Column(Integer, ForeignKey("web_menus.id", ondelete="CASCADE"), nullable=False, index=True)
    revision_number = Column(Integer, nullable=False)
    source_version = Column(Integer, nullable=False, default=1)
    tree = Column(JSON, nullable=False, default=list)
    reason = Column(String(32), nullable=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class WebTheme(Base):
    __tablename__ = "web_themes"

    id = Column(Integer, primary_key=True)
    stable_key = Column(String(120), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    author = Column(String(200), nullable=True)
    description = Column(Text, nullable=True)
    license = Column(String(100), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class WebThemeVersion(Base):
    __tablename__ = "web_theme_versions"
    __table_args__ = (
        UniqueConstraint("theme_id", "version", name="uq_web_theme_version"),
    )

    id = Column(Integer, primary_key=True)
    theme_id = Column(Integer, ForeignKey("web_themes.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(String(50), nullable=False)
    schema_version = Column(Integer, nullable=False)
    manifest = Column(JSON, nullable=False, default=dict)
    default_tokens = Column(JSON, nullable=True)
    base_css = Column(Text, nullable=False, default="")
    package_hash = Column(String(64), nullable=False, unique=True)
    install_path = Column(String(500), nullable=False)
    installed_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    installed_at = Column(DateTime, default=func.now(), nullable=False)


class WebThemeAsset(Base):
    __tablename__ = "web_theme_assets"
    __table_args__ = (
        UniqueConstraint("theme_version_id", "relative_path", name="uq_web_theme_asset_path"),
    )

    id = Column(Integer, primary_key=True)
    theme_version_id = Column(Integer, ForeignKey("web_theme_versions.id", ondelete="CASCADE"), nullable=False, index=True)
    relative_path = Column(String(500), nullable=False)
    mime = Column(String(100), nullable=False)
    size = Column(Integer, nullable=False)
    sha256 = Column(String(64), nullable=False)


class WebSiteStyle(Base):
    __tablename__ = "web_site_styles"

    id = Column(Integer, primary_key=True, default=1)
    active_theme_version_id = Column(
        Integer, ForeignKey("web_theme_versions.id", ondelete="RESTRICT"), nullable=True
    )
    draft_tokens = Column(JSON, nullable=False, default=dict)
    draft_css = Column(Text, nullable=False, default="")
    draft_version = Column(Integer, nullable=False, default=1)
    published_tokens = Column(JSON, nullable=False, default=dict)
    published_css = Column(Text, nullable=False, default="")
    published_version = Column(Integer, nullable=False, default=1)
    updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class WebTemplate(Base):
    __tablename__ = "web_templates"

    id = Column(Integer, primary_key=True)
    key = Column(String(50), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(String(500), nullable=True)
    html = Column(Text, nullable=False)
    css = Column(Text, nullable=False, default="")
    qualified_key = Column(String(240), nullable=True, unique=True, index=True)
    template_kind = Column(String(32), nullable=False, default="layout", server_default="page")
    usage_mode = Column(String(20), nullable=False, default="linked_layout", server_default="linked_layout")
    project_data = Column(JSON, nullable=True)
    draft_version = Column(Integer, nullable=False, default=1, server_default="1")
    published_project_data = Column(JSON, nullable=True)
    published_css = Column(Text, nullable=False, default="", server_default="")
    published_version = Column(Integer, nullable=False, default=0, server_default="0")
    theme_version_id = Column(Integer, ForeignKey("web_theme_versions.id", ondelete="RESTRICT"), nullable=True)
    preview_media_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    forked_from_id = Column(Integer, ForeignKey("web_templates.id", ondelete="SET NULL"), nullable=True)
    is_system = Column(Boolean, nullable=False, default=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class WebReusableComponent(Base):
    __tablename__ = "web_reusable_components"

    id = Column(Integer, primary_key=True)
    qualified_key = Column(String(240), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    project_data = Column(JSON, nullable=False)
    css = Column(Text, nullable=False, default="")
    prop_schema = Column(JSON, nullable=False, default=list)
    default_props = Column(JSON, nullable=False, default=dict)
    variants = Column(JSON, nullable=False, default=list)
    published_project_data = Column(JSON, nullable=True)
    published_css = Column(Text, nullable=False, default="")
    published_prop_schema = Column(JSON, nullable=False, default=list)
    published_default_props = Column(JSON, nullable=False, default=dict)
    published_variants = Column(JSON, nullable=False, default=list)
    published_version = Column(Integer, nullable=False, default=0)
    theme_version_id = Column(Integer, ForeignKey("web_theme_versions.id", ondelete="RESTRICT"), nullable=True)
    preview_media_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    origin_resource_id = Column(Integer, ForeignKey("web_reusable_components.id", ondelete="SET NULL"), nullable=True)
    draft_version = Column(Integer, nullable=False, default=1)
    is_locked = Column(Boolean, nullable=False, default=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class WebSection(Base):
    __tablename__ = "web_sections"

    id = Column(Integer, primary_key=True)
    qualified_key = Column(String(240), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    project_data = Column(JSON, nullable=False)
    css = Column(Text, nullable=False, default="")
    prop_schema = Column(JSON, nullable=False, default=list)
    default_props = Column(JSON, nullable=False, default=dict)
    variants = Column(JSON, nullable=False, default=list)
    published_project_data = Column(JSON, nullable=True)
    published_css = Column(Text, nullable=False, default="")
    published_prop_schema = Column(JSON, nullable=False, default=list)
    published_default_props = Column(JSON, nullable=False, default=dict)
    published_variants = Column(JSON, nullable=False, default=list)
    published_version = Column(Integer, nullable=False, default=0)
    theme_version_id = Column(Integer, ForeignKey("web_theme_versions.id", ondelete="RESTRICT"), nullable=True)
    preview_media_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    origin_resource_id = Column(Integer, ForeignKey("web_sections.id", ondelete="SET NULL"), nullable=True)
    draft_version = Column(Integer, nullable=False, default=1)
    is_locked = Column(Boolean, nullable=False, default=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class WebPattern(Base):
    __tablename__ = "web_patterns"

    id = Column(Integer, primary_key=True)
    qualified_key = Column(String(240), nullable=False, unique=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    project_data = Column(JSON, nullable=False)
    css = Column(Text, nullable=False, default="")
    theme_version_id = Column(Integer, ForeignKey("web_theme_versions.id", ondelete="RESTRICT"), nullable=True)
    preview_media_id = Column(Integer, ForeignKey("web_media.id", ondelete="SET NULL"), nullable=True)
    origin_resource_id = Column(Integer, ForeignKey("web_patterns.id", ondelete="SET NULL"), nullable=True)
    draft_version = Column(Integer, nullable=False, default=1)
    is_locked = Column(Boolean, nullable=False, default=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class WebRedirect(Base):
    __tablename__ = "web_redirects"

    id = Column(Integer, primary_key=True)
    from_path = Column(String(500), nullable=False, unique=True, index=True)
    target_page_id = Column(Integer, ForeignKey("web_pages.id", ondelete="CASCADE"), nullable=False, index=True)
    status_code = Column(Integer, nullable=False, default=301)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class WebMediaFolder(Base):
    __tablename__ = "web_media_folders"

    id = Column(Integer, primary_key=True)
    name = Column(String(200), nullable=False)
    parent_id = Column(Integer, ForeignKey("web_media_folders.id", ondelete="CASCADE"), nullable=True, index=True)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class WebMedia(Base):
    __tablename__ = "web_media"

    id = Column(Integer, primary_key=True)
    filename = Column(String(255), nullable=False)
    path = Column(String(500), nullable=False)
    mime = Column(String(100), nullable=True)
    size = Column(Integer, nullable=False, default=0)
    album = Column(String(100), nullable=True, index=True)
    folder_id = Column(Integer, ForeignKey("web_media_folders.id", ondelete="SET NULL"), nullable=True, index=True)
    alt = Column(String(300), nullable=True)
    caption = Column(String(500), nullable=True)
    is_public = Column(Boolean, nullable=False, default=False, index=True)
    note = Column(String(1000), nullable=True)
    uploaded_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)


class WebPreviewArtifact(Base):
    __tablename__ = "web_preview_artifacts"

    id = Column(Integer, primary_key=True)
    resource_kind = Column(String(32), nullable=False)
    resource_id = Column(Integer, nullable=False)
    source_hash = Column(String(64), nullable=False, index=True)
    viewport = Column(String(20), nullable=False, default="1280x720")
    format = Column(String(10), nullable=False, default="png")
    storage_path = Column(String(500), nullable=False)
    mime = Column(String(50), nullable=False, default="image/png")
    width = Column(Integer, nullable=True)
    height = Column(Integer, nullable=True)
    status = Column(String(16), nullable=False, default="building", index=True)
    error = Column(Text, nullable=True)
    retry_count = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    __table_args__ = (
        Index("ix_web_preview_artifact_resource", "resource_kind", "resource_id"),
    )


class Config(Base):
    __tablename__ = "config"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    endpoint = Column(Text, nullable=False, unique=True)
    p256dh = Column(Text, nullable=False)
    auth = Column(Text, nullable=False)
    failure_count = Column(Integer, nullable=False, default=0)
    disabled_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="push_subscriptions")
    deliveries = relationship(
        "PushDelivery",
        back_populates="subscription",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class PushDelivery(Base):
    """Durable per-device Web Push delivery waiting for the dispatcher."""

    __tablename__ = "push_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    subscription_id = Column(
        Integer,
        ForeignKey("push_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    payload = Column(Text, nullable=False)
    attempt_count = Column(Integer, nullable=False, default=0)
    available_at = Column(DateTime, nullable=False, default=func.now(), index=True)
    locked_at = Column(DateTime, nullable=True)
    lock_token = Column(String(64), nullable=True, index=True)
    failed_at = Column(DateTime, nullable=True, index=True)
    last_status_code = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    subscription = relationship("PushSubscription", back_populates="deliveries")

    __table_args__ = (
        Index(
            "ix_push_deliveries_ready",
            "failed_at",
            "available_at",
            "locked_at",
        ),
    )
