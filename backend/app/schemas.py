import base64
import binascii
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator

from .usernames import USERNAME_HELP, USERNAME_PATTERN
from .models import (
    CompletionStatus,
    InventoryHistoryAction,
    InventoryItemStatus,
    RoleEnum,
    StatMetricEnum,
    TaskAutoCloseScope,
    TaskPeriodUnit,
)


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int = Field(..., description="Access token expiration in seconds")


class LoginRequest(BaseModel):
    username: str
    password: str
    remember_me: bool = False


class RefreshRequest(BaseModel):
    refresh_token: str


class RegistrationRequest(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=USERNAME_PATTERN, description=USERNAME_HELP)
    real_name: str = Field(min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    password: str = Field(min_length=8)
    join_code: Optional[str] = None
    preferred_language: Optional[str] = Field(default=None, max_length=8)
    role: Optional[RoleEnum] = Field(default=RoleEnum.MEMBER)


class RegistrationSettings(BaseModel):
    allow_member_registration: bool
    allow_admin_bootstrap: bool


class TokenPayload(BaseModel):
    sub: int
    exp: int
    role: RoleEnum


class RefreshTokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int


class PasswordChangeRequired(BaseModel):
    requires_password_change: bool = True
    message: str = "Password change required"


class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=8)


class ForcePasswordChangeRequest(BaseModel):
    username: str
    old_password: str
    new_password: str = Field(min_length=8)
    remember_me: bool = False


class UserBase(BaseModel):
    username: str = Field(min_length=3, max_length=64, pattern=USERNAME_PATTERN, description=USERNAME_HELP)
    real_name: str = Field(min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    preferred_language: str = Field(default="cs", max_length=8)


class UserCreate(UserBase):
    password: str = Field(min_length=8)
    team_id: Optional[int] = None
    role: RoleEnum = RoleEnum.MEMBER
    managed_team_ids: Optional[List[int]] = None


class BulkUserRegistration(BaseModel):
    names: List[str] = Field(min_length=1, max_length=100)
    team_id: Optional[int] = None
    role: RoleEnum = RoleEnum.MEMBER
    preferred_language: str = Field(default="cs", max_length=8)


class UserUpdate(BaseModel):
    username: Optional[str] = Field(default=None, min_length=3, max_length=64, pattern=USERNAME_PATTERN, description=USERNAME_HELP)
    real_name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    email: Optional[EmailStr] = None
    password: Optional[str] = Field(default=None, min_length=8)
    preferred_language: Optional[str] = Field(default=None, max_length=8)
    avatar: Optional[str] = Field(default=None, max_length=200000)
    team_id: Optional[int] = None
    role: Optional[RoleEnum] = None
    is_active: Optional[bool] = None
    managed_team_ids: Optional[List[int]] = None


class PasswordChangeRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=1)


class UserPublic(UserBase):
    id: int
    role: RoleEnum
    team_id: Optional[int]
    team_name: Optional[str] = None
    is_active: bool
    receive_messages: bool = True
    avatar: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    needs_password_change: bool = False  # True if this is first login and password should be changed
    managed_team_ids: List[int] = Field(default_factory=list)
    permission_group_ids: List[int] = Field(default_factory=list)
    permission_group_names: List[str] = Field(default_factory=list)
    permissions: List[str] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class UserWithPassword(UserPublic):
    password: str  # Plain text password - only returned during creation


class BulkRegistrationResult(BaseModel):
    success_count: int
    failed_count: int
    created_users: List[UserWithPassword]
    errors: List[str]


class ScoreSummary(BaseModel):
    total_points: float
    member_rank: Optional[int]
    team_rank: Optional[int]


class MeResponse(BaseModel):
    user: UserPublic


class TeamBase(BaseModel):
    name: str
    description: Optional[str] = None
    logo: Optional[str] = None


class TeamCreate(TeamBase):
    pass


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    logo: Optional[str] = None


class TeamPublic(TeamBase):
    id: int
    join_code: str
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TeamJoinRequest(BaseModel):
    join_code: str


class TaskBase(BaseModel):
    name: str
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    points_per_completion: float
    max_per_period: Optional[int] = Field(default=None, ge=1)
    period_unit: Optional[TaskPeriodUnit] = None
    period_count: Optional[int] = Field(default=None, ge=1)
    requires_approval: bool = False
    hot_deal: bool = False
    auto_close_after_completions: Optional[int] = Field(default=None, ge=1)
    auto_close_scope: Optional[TaskAutoCloseScope] = None
    team_id: Optional[int] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    points_per_completion: Optional[float] = None
    max_per_period: Optional[int] = Field(default=None, ge=1)
    period_unit: Optional[TaskPeriodUnit] = None
    period_count: Optional[int] = Field(default=None, ge=1)
    requires_approval: Optional[bool] = None
    is_archived: Optional[bool] = None
    hot_deal: Optional[bool] = None
    auto_close_after_completions: Optional[int] = Field(default=None, ge=1)
    auto_close_scope: Optional[TaskAutoCloseScope] = None
    team_id: Optional[int] = None


class TaskPublic(TaskBase):
    id: int
    is_archived: bool
    is_closed_for_user: bool = False
    auto_close_current_count: Optional[int] = None
    auto_closed_at: Optional[datetime] = None
    auto_close_reset_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    progress: Optional["TaskProgress"] = None
    variants: List["TaskVariantPublic"] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class CompletionSubmission(BaseModel):
    member_note: Optional[str] = Field(default=None, max_length=5000)
    count: int = Field(default=1, ge=1, le=999)


class CompletionCreate(CompletionSubmission):
    task_id: int
    variant_id: Optional[int] = None


class CompletionAdminCreate(CompletionSubmission):
    task_id: int
    variant_id: Optional[int] = None
    status: Optional[CompletionStatus] = CompletionStatus.APPROVED
    admin_note: Optional[str] = Field(default=None, max_length=5000)


class CompletionReview(BaseModel):
    status: CompletionStatus
    admin_note: Optional[str] = Field(default=None, max_length=5000)

    @field_validator("status")
    @classmethod
    def only_terminal_status(cls, value: CompletionStatus) -> CompletionStatus:
        if value == CompletionStatus.PENDING:
            raise ValueError("status must be approved or rejected")
        return value


class MemberInfo(BaseModel):
    id: int
    username: str
    real_name: str
    team_id: Optional[int]
    team_name: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CompletionPublic(BaseModel):
    id: int
    task_id: int
    member_id: int
    variant_id: Optional[int] = None
    status: CompletionStatus
    submitted_at: datetime
    reviewed_at: Optional[datetime]
    reviewer_id: Optional[int]
    member_note: Optional[str]
    admin_note: Optional[str]
    points_awarded: float
    count: int
    task: Optional[TaskPublic] = None
    member: Optional[MemberInfo] = None
    variant: Optional["TaskVariantPublic"] = None

    model_config = ConfigDict(from_attributes=True)


class CompletionAdminUpdate(BaseModel):
    count: Optional[int] = Field(default=None, ge=1, le=999)
    status: Optional[CompletionStatus] = None
    admin_note: Optional[str] = Field(default=None, max_length=5000)


class TaskProgress(BaseModel):
    current: int
    remaining: Optional[int]
    limit: Optional[int]
    period_start: Optional[datetime]
    period_end: Optional[datetime]
    lifetime: int

    model_config = ConfigDict(from_attributes=True)


class TaskVariantBase(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: Optional[str] = None
    points: float = Field(gt=0)
    position: int = Field(ge=0, default=0)


class TaskVariantCreate(TaskVariantBase):
    pass


class TaskVariantUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=100)
    description: Optional[str] = None
    points: Optional[float] = Field(default=None, gt=0)
    position: Optional[int] = Field(default=None, ge=0)


class TaskVariantPublic(TaskVariantBase):
    id: int
    task_id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LeaderboardEntry(BaseModel):
    entity_id: int
    name: str
    score: float
    rank: int
    member_count: Optional[int] = None
    total_points: Optional[float] = None

    model_config = ConfigDict(from_attributes=True)


class AuditLogEntry(BaseModel):
    id: int
    actor_id: Optional[int]
    action: str
    target_type: str
    target_id: Optional[str]
    payload: Optional[dict]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class NotificationCreate(BaseModel):
    message: str = Field(min_length=1, max_length=5000)


class NotificationPublic(BaseModel):
    id: int
    message: str
    created_at: datetime
    read_at: Optional[datetime]
    sender_id: Optional[int]
    sender_username: Optional[str]
    sender_real_name: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class AnnouncementCreate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=150)
    body: str = Field(min_length=1, max_length=1000)
    team_id: Optional[int] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(default=None, max_length=150)
    body: Optional[str] = Field(default=None, min_length=1, max_length=1000)
    team_id: Optional[int] = None


class AnnouncementPublic(BaseModel):
    id: int
    title: Optional[str]
    body: str
    team_id: Optional[int]
    team_name: Optional[str]
    created_at: datetime
    created_by_id: Optional[int]
    created_by_username: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class StaticPagePublic(BaseModel):
    slug: str
    content: str
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StaticPageUpdate(BaseModel):
    content: str = Field(min_length=0, max_length=20000)


MAX_ICON_DATA_LENGTH = 200_000  # ~150 KB when base64 encoded


def _normalize_icon_value(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.startswith("data:"):
        if not cleaned.startswith("data:image/"):
            raise ValueError("Icon data URL must be an image")
        if ";base64," not in cleaned:
            raise ValueError("Icon data URL must be base64 encoded")
        if len(cleaned) > MAX_ICON_DATA_LENGTH:
            raise ValueError("Icon data URL is too large (limit ~150 KB)")
        _, _, encoded = cleaned.partition(",")
        try:
            base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ValueError("Icon data URL contains invalid base64 content") from exc
    return cleaned


class StatCategoryComponentBase(BaseModel):
    task_id: int
    metric: StatMetricEnum = StatMetricEnum.POINTS
    weight: float = Field(default=1.0)
    position: Optional[int] = Field(default=None, ge=0)


class StatCategoryComponentCreate(StatCategoryComponentBase):
    pass


class StatCategoryComponentUpdate(BaseModel):
    task_id: Optional[int] = None
    metric: Optional[StatMetricEnum] = None
    weight: Optional[float] = None
    position: Optional[int] = Field(default=None, ge=0)


class StatCategoryComponentPublic(BaseModel):
    id: int
    task_id: int
    metric: StatMetricEnum
    weight: float
    position: int
    task_name: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class StatCategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: Optional[str] = None
    icon: Optional[str] = None

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_icon_value(value)


class StatCategoryCreate(StatCategoryBase):
    components: Optional[List[StatCategoryComponentCreate]] = None


class StatCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=150)
    description: Optional[str] = None
    icon: Optional[str] = None

    @field_validator("icon")
    @classmethod
    def validate_icon(cls, value: Optional[str]) -> Optional[str]:
        return _normalize_icon_value(value)


class StatCategorySummary(BaseModel):
    id: int
    name: str
    description: Optional[str]
    icon: Optional[str]
    component_count: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class StatCategoryManage(BaseModel):
    id: int
    name: str
    description: Optional[str]
    icon: Optional[str]
    components: List[StatCategoryComponentPublic]
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedResponse(BaseModel):
    total: int
    items: List[dict]
    page: int
    size: int


class ConfigUpdate(BaseModel):
    app_name: Optional[str] = None
    app_icon: Optional[str] = None
    leaderboard_default_view: Optional[str] = Field(default=None, pattern="^(total|average)$")
    leaderboard_show_only_default_mode: Optional[bool] = None
    allow_self_registration: Optional[bool] = None


class ConfigResponse(BaseModel):
    app_name: str
    app_icon: str
    leaderboard_default_view: str
    leaderboard_show_only_default_mode: bool
    allow_self_registration: bool


class InventoryPhotoCreate(BaseModel):
    image_url: str = Field(min_length=1)
    caption: Optional[str] = None


class InventoryPhotoPublic(BaseModel):
    id: int
    image_url: str
    caption: Optional[str]
    position: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InventoryItemBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=120)
    flag_id: Optional[int] = None
    set_id: Optional[int] = None
    quantity: int = Field(default=1, ge=0)
    quantity_unit: str = Field(default="ks", min_length=1, max_length=32)
    default_location: Optional[str] = Field(default=None, max_length=200)
    current_location: Optional[str] = Field(default=None, max_length=200)
    status: InventoryItemStatus = InventoryItemStatus.AVAILABLE
    notes: Optional[str] = None


class InventoryItemLocationInput(BaseModel):
    location: str = Field(min_length=1, max_length=200)
    quantity: int = Field(ge=0)


class InventoryItemLocationPublic(InventoryItemLocationInput):
    id: int

    model_config = ConfigDict(from_attributes=True)


class InventoryItemCreate(InventoryItemBase):
    photos: List[InventoryPhotoCreate] = Field(default_factory=list)
    locations: List[InventoryItemLocationInput] = Field(default_factory=list)


class InventoryItemUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[str] = Field(default=None, max_length=120)
    flag_id: Optional[int] = None
    set_id: Optional[int] = None
    quantity: Optional[int] = Field(default=None, ge=0)
    quantity_unit: Optional[str] = Field(default=None, min_length=1, max_length=32)
    default_location: Optional[str] = Field(default=None, max_length=200)
    current_location: Optional[str] = Field(default=None, max_length=200)
    status: Optional[InventoryItemStatus] = None
    notes: Optional[str] = None
    locations: Optional[List[InventoryItemLocationInput]] = None


class InventoryHistoryPublic(BaseModel):
    id: int
    action: InventoryHistoryAction
    payload: Optional[dict]
    created_at: datetime
    actor_id: Optional[int]
    event_id: Optional[int]

    model_config = ConfigDict(from_attributes=True)


class InventoryLoanCreate(BaseModel):
    borrower_name: str = Field(min_length=1, max_length=200)
    borrowed_at: Optional[datetime] = None
    due_at: Optional[datetime] = None
    quantity: int = Field(default=1, ge=1)
    location: Optional[str] = Field(default=None, max_length=200)
    note: Optional[str] = None


class InventoryLoanReturn(BaseModel):
    returned_at: Optional[datetime] = None
    note: Optional[str] = None


class InventoryLoanPublic(BaseModel):
    id: int
    borrower_name: str
    borrowed_at: datetime
    due_at: Optional[datetime]
    returned_at: Optional[datetime]
    quantity: int
    source_location: Optional[str]
    note: Optional[str]

    model_config = ConfigDict(from_attributes=True)


class InventoryLabelTemplateBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    width_mm: float = Field(default=62, gt=0)
    height_mm: float = Field(default=29, gt=0)
    qr_size_mm: float = Field(default=18, gt=0)
    fields: str = Field(default='{"visibleFields":["category","current_location"],"columns":3,"gapMm":2}')


class InventoryLabelTemplateCreate(InventoryLabelTemplateBase):
    pass


class InventoryLabelTemplateUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    width_mm: Optional[float] = Field(default=None, gt=0)
    height_mm: Optional[float] = Field(default=None, gt=0)
    qr_size_mm: Optional[float] = Field(default=None, gt=0)
    fields: Optional[str] = None


class InventoryLabelTemplatePublic(InventoryLabelTemplateBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InventoryLocationBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: int = Field(default=0, ge=0)


class InventoryLocationCreate(InventoryLocationBase):
    pass


class InventoryLocationUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    sort_order: Optional[int] = Field(default=None, ge=0)


class InventoryLocationPublic(BaseModel):
    id: int
    parent_id: Optional[int]
    name: str
    description: Optional[str]
    path: str
    sort_order: int
    created_at: datetime
    updated_at: datetime
    children: List["InventoryLocationPublic"] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class InventoryCategoryBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    color: str = Field(default="#5b8def", min_length=4, max_length=16)
    sort_order: int = Field(default=0, ge=0)


class InventoryCategoryCreate(InventoryCategoryBase):
    pass


class InventoryCategoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    parent_id: Optional[int] = None
    color: Optional[str] = Field(default=None, min_length=4, max_length=16)
    sort_order: Optional[int] = Field(default=None, ge=0)


class InventoryCategoryPublic(BaseModel):
    id: int
    parent_id: Optional[int]
    name: str
    description: Optional[str]
    path: str
    color: str
    sort_order: int
    created_at: datetime
    updated_at: datetime
    children: List["InventoryCategoryPublic"] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class InventoryFlagBase(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: Optional[str] = None
    color: str = Field(default="neutral", min_length=3, max_length=32)
    sort_order: int = Field(default=0, ge=0)


class InventoryFlagCreate(InventoryFlagBase):
    pass


class InventoryFlagUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    description: Optional[str] = None
    color: Optional[str] = Field(default=None, min_length=3, max_length=32)
    sort_order: Optional[int] = Field(default=None, ge=0)


class InventoryFlagPublic(BaseModel):
    id: int
    name: str
    description: Optional[str]
    color: str
    is_system: bool = False
    sort_order: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InventoryItemPublic(BaseModel):
    id: int
    name: str
    description: Optional[str]
    category: Optional[str]
    flag_id: Optional[int]
    set_id: Optional[int] = None
    flag: Optional[InventoryFlagPublic] = None
    quantity: int
    quantity_unit: str
    default_location: Optional[str]
    current_location: Optional[str]
    status: InventoryItemStatus
    notes: Optional[str]
    qr_identifier: str
    created_at: datetime
    updated_at: datetime
    available_quantity: int = 0
    open_loan_quantity: int = 0
    photos: List[InventoryPhotoPublic] = Field(default_factory=list)
    locations: List[InventoryItemLocationPublic] = Field(default_factory=list)
    loans: List[InventoryLoanPublic] = Field(default_factory=list)
    history_entries: List[InventoryHistoryPublic] = Field(default_factory=list)


class InventorySetBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None
    flag_id: Optional[int] = None
    default_location: Optional[str] = None
    current_location: Optional[str] = None
    status: InventoryItemStatus = InventoryItemStatus.AVAILABLE
    notes: Optional[str] = None


class InventorySetCreate(InventorySetBase):
    pass


class InventorySetUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = None
    flag_id: Optional[int] = None
    default_location: Optional[str] = None
    current_location: Optional[str] = None
    status: Optional[InventoryItemStatus] = None
    notes: Optional[str] = None


class InventorySetPublic(InventorySetBase):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class InventorySetItemsUpdate(BaseModel):
    item_ids: List[int] = Field(default_factory=list)


class InventoryOverviewResponse(BaseModel):
    items: List[InventoryItemPublic]
    label_templates: List[InventoryLabelTemplatePublic]
    locations: List[InventoryLocationPublic]
    categories: List[InventoryCategoryPublic]
    flags: List[InventoryFlagPublic]
    sets: List[InventorySetPublic]


class InventoryBulkUpdateRequest(BaseModel):
    item_ids: List[int] = Field(min_length=1)
    set_status: Optional[InventoryItemStatus] = None
    set_default_location: Optional[str] = Field(default=None, max_length=200)
    set_current_location: Optional[str] = Field(default=None, max_length=200)
    set_category: Optional[str] = Field(default=None, max_length=120)
    set_flag_id: Optional[int] = None


class InventoryBulkLoanRequest(BaseModel):
    item_ids: List[int] = Field(min_length=1)
    borrower_name: str = Field(min_length=1, max_length=200)
    due_at: Optional[datetime] = None
    note: Optional[str] = None


TaskPublic.model_rebuild()
CompletionPublic.model_rebuild()
InventoryLocationPublic.model_rebuild()
InventoryCategoryPublic.model_rebuild()
