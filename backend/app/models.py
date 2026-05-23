from datetime import datetime
from enum import Enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Enum as SAEnum,
    Float,
    ForeignKey,
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


class InventoryEventStatus(str, Enum):
    PLANNED = "planned"
    ACTIVE = "active"
    COMPLETED = "completed"
    ARCHIVED = "archived"


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
    inventory_event_scans = relationship(
        "InventoryEventScan",
        back_populates="actor",
        foreign_keys="InventoryEventScan.actor_id",
    )


class Team(Base):
    __tablename__ = "teams"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(150), unique=True, nullable=False)
    join_code = Column(String(32), unique=True, nullable=False)
    description = Column(Text, nullable=True)
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
    inventory_items = relationship(
        "InventoryItem",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    inventory_events = relationship(
        "InventoryEvent",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    inventory_label_templates = relationship(
        "InventoryLabelTemplate",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    inventory_locations = relationship(
        "InventoryLocation",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    inventory_categories = relationship(
        "InventoryCategory",
        back_populates="team",
        cascade="all, delete-orphan",
    )
    inventory_flags = relationship(
        "InventoryFlag",
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


class InventoryItem(Base):
    __tablename__ = "inventory_items"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=True)
    category = Column(String(120), nullable=True, index=True)
    flag_id = Column(Integer, ForeignKey("inventory_flags.id", ondelete="SET NULL"), nullable=True, index=True)
    quantity = Column(Integer, nullable=False, default=1)
    quantity_unit = Column(String(32), nullable=False, default="ks")
    default_location = Column(String(200), nullable=True)
    current_location = Column(String(200), nullable=True)
    status = Column(SAEnum(InventoryItemStatus), nullable=False, default=InventoryItemStatus.AVAILABLE)
    notes = Column(Text, nullable=True)
    qr_identifier = Column(String(64), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="inventory_items")
    flag = relationship("InventoryFlag", back_populates="items")
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
    event_assignments = relationship(
        "InventoryEventItem",
        back_populates="item",
        cascade="all, delete-orphan",
    )
    scans = relationship(
        "InventoryEventScan",
        back_populates="item",
        cascade="all, delete-orphan",
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


class InventoryEvent(Base):
    __tablename__ = "inventory_events"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False, index=True)
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    note = Column(Text, nullable=True)
    status = Column(SAEnum(InventoryEventStatus), nullable=False, default=InventoryEventStatus.PLANNED)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="inventory_events")
    items = relationship(
        "InventoryEventItem",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="InventoryEventItem.id.desc()",
    )
    history_entries = relationship("InventoryHistory", back_populates="event")
    scans = relationship(
        "InventoryEventScan",
        back_populates="event",
        cascade="all, delete-orphan",
        order_by="InventoryEventScan.created_at.desc()",
    )


class InventoryEventItem(Base):
    __tablename__ = "inventory_event_items"
    __table_args__ = (
        UniqueConstraint("event_id", "item_id", name="uq_inventory_event_item"),
    )

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("inventory_events.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    planned_quantity = Column(Integer, nullable=False, default=1)
    returned_quantity = Column(Integer, nullable=False, default=0)
    damaged_quantity = Column(Integer, nullable=False, default=0)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    event = relationship("InventoryEvent", back_populates="items")
    item = relationship("InventoryItem", back_populates="event_assignments")


class InventoryLoan(Base):
    __tablename__ = "inventory_loans"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    borrower_name = Column(String(200), nullable=False)
    borrowed_at = Column(DateTime, nullable=False, default=func.now())
    due_at = Column(DateTime, nullable=True)
    returned_at = Column(DateTime, nullable=True)
    quantity = Column(Integer, nullable=False, default=1)
    note = Column(Text, nullable=True)
    item = relationship("InventoryItem", back_populates="loans")


class InventoryHistory(Base):
    __tablename__ = "inventory_history"

    id = Column(Integer, primary_key=True, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id = Column(Integer, ForeignKey("inventory_events.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    action = Column(SAEnum(InventoryHistoryAction), nullable=False, index=True)
    payload = Column(JSON, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    item = relationship("InventoryItem", back_populates="history_entries")
    event = relationship("InventoryEvent", back_populates="history_entries")
    actor = relationship("User", back_populates="inventory_history_entries")


class InventoryEventScan(Base):
    __tablename__ = "inventory_event_scans"

    id = Column(Integer, primary_key=True, index=True)
    event_id = Column(Integer, ForeignKey("inventory_events.id", ondelete="CASCADE"), nullable=False, index=True)
    item_id = Column(Integer, ForeignKey("inventory_items.id", ondelete="SET NULL"), nullable=True, index=True)
    actor_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    qr_identifier = Column(String(64), nullable=False, index=True)
    result = Column(String(32), nullable=False, default="returned")
    condition = Column(String(32), nullable=True)
    note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    event = relationship("InventoryEvent", back_populates="scans")
    item = relationship("InventoryItem", back_populates="scans")
    actor = relationship("User", back_populates="inventory_event_scans")


class InventoryLabelTemplate(Base):
    __tablename__ = "inventory_label_templates"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(200), nullable=False)
    width_mm = Column(Float, nullable=False, default=62)
    height_mm = Column(Float, nullable=False, default=29)
    qr_x_mm = Column(Float, nullable=False, default=3)
    qr_y_mm = Column(Float, nullable=False, default=3)
    qr_size_mm = Column(Float, nullable=False, default=18)
    title_font_size = Column(Float, nullable=False, default=14)
    meta_font_size = Column(Float, nullable=False, default=9)
    fields = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="inventory_label_templates")


class InventoryLocation(Base):
    __tablename__ = "inventory_locations"

    id = Column(Integer, primary_key=True, index=True)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("inventory_locations.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    path = Column(String(500), nullable=False, index=True)
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="inventory_locations")
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
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("inventory_categories.id", ondelete="CASCADE"), nullable=True, index=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    path = Column(String(500), nullable=False, index=True)
    color = Column(String(16), nullable=False, default="#5b8def")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="inventory_categories")
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
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    color = Column(String(32), nullable=False, default="neutral")
    sort_order = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="inventory_flags")
    items = relationship("InventoryItem", back_populates="flag")


class Config(Base):
    __tablename__ = "config"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
