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


class StatMetricEnum(str, Enum):
    POINTS = "points"
    COMPLETIONS = "completions"


class CompletionStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(100), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    password_hash = Column(String(255), nullable=False)
    role = Column(SAEnum(RoleEnum), default=RoleEnum.MEMBER, nullable=False)
    preferred_language = Column(String(8), default="cs", nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    team_id = Column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True)
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
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    team = relationship("Team", back_populates="tasks")
    completions = relationship("Completion", back_populates="task")


class Completion(Base):
    __tablename__ = "completions"

    id = Column(Integer, primary_key=True, index=True)
    member_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    task_id = Column(Integer, ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False)
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


class Config(Base):
    __tablename__ = "config"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
