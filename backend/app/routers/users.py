from typing import List, Optional
import secrets
import string
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from ..dependencies import (
    get_current_active_user,
    get_db,
    require_action,
)
from ..models import RoleEnum, Team, User
from ..schemas import BulkRegistrationResult, BulkUserRegistration, MeResponse, PasswordChangeRequest, UserCreate, UserPublic, UserUpdate, UserWithPassword
from ..core.security import get_password_hash, verify_password
from ..usernames import is_canonical_username, normalize_legacy_username
from ..permissions import allows_team, effective_permission_scopes, managed_team_ids, permission_keys, permission_scopes

router = APIRouter(prefix="/users", tags=["users"])


def _user_to_public(user: User, db: Session | None = None) -> UserPublic:
    # A migration persists this conversion at startup. Keep this boundary
    # defensive as well, so a legacy record cannot turn the users list into a
    # 500 error before the migration is applied.
    username = user.username if is_canonical_username(user.username) else normalize_legacy_username(user.username, user.id)
    scopes = effective_permission_scopes(db, user) if db is not None else {}
    return UserPublic(
        id=user.id,
        username=username,
        real_name=user.real_name,
        email=user.email,
        preferred_language=user.preferred_language,
        team_id=user.team_id,
        is_active=user.is_active,
        receive_messages=user.receive_messages,
        avatar=user.avatar,
        created_at=user.created_at,
        updated_at=user.updated_at,
        needs_password_change=user.first_login_at is None,  # First login requires password change
        managed_team_ids=[team.id for team in getattr(user, "managed_teams", [])],
        team_name=user.team.name if hasattr(user, 'team') and user.team else None,
        permission_group_ids=sorted(group.id for group in getattr(user, "permission_groups", [])),
        permission_group_names=sorted(group.name for group in getattr(user, "permission_groups", [])),
        permissions=sorted(scopes),
        permission_scopes={action: sorted(values) for action, values in scopes.items()},
    )


@router.get("/me", response_model=MeResponse)
def read_current_user(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> MeResponse:
    if current_user.team_id:
        current_user = db.query(User).options(joinedload(User.team)).filter(User.id == current_user.id).first()
    return MeResponse(user=_user_to_public(current_user, db))


class UserPreferenceUpdate(BaseModel):
    receive_messages: bool


@router.patch("/me", response_model=MeResponse)
def update_own_preferences(
    payload: UserPreferenceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> MeResponse:
    current_user.receive_messages = payload.receive_messages
    db.commit()
    return MeResponse(user=_user_to_public(current_user, db))


@router.get("/", response_model=List[UserPublic])
@router.get("", response_model=List[UserPublic], include_in_schema=False)
def list_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.users.read")),
    team_id: Optional[int] = Query(default=None),
) -> List[UserPublic]:
    query = db.query(User).options(joinedload(User.team), joinedload(User.managed_teams))
    managed_ids = managed_team_ids(current_user)
    if "any" not in permission_scopes(db, current_user, "core.users.read"):
        query = query.filter(User.team_id.in_(managed_ids))

    if team_id is not None:
        if "any" not in permission_scopes(db, current_user, "core.users.read") and team_id not in managed_ids:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team outside managed scope")
        query = query.filter(User.team_id == team_id)

    return [_user_to_public(user) for user in query.all()]


@router.get("/{user_id}", response_model=UserPublic)
def get_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.users.read")),
) -> UserPublic:
    user = (
        db.query(User)
        .options(joinedload(User.team), joinedload(User.managed_teams))
        .filter(User.id == user_id)
        .first()
    )
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not allows_team(db, current_user, "core.users.read", user.team_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside permitted scope")

    return _user_to_public(user)


@router.post("/", response_model=UserPublic, status_code=status.HTTP_201_CREATED)
@router.post("", response_model=UserPublic, status_code=status.HTTP_201_CREATED, include_in_schema=False)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.users.create")),
) -> UserPublic:
    if "any" not in permission_scopes(db, current_user, "core.users.create"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Creating users requires global scope")
    if payload.team_id is not None:
        team = db.get(Team, payload.team_id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    user = User(
        username=payload.username,
        real_name=payload.real_name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        preferred_language=payload.preferred_language,
        team_id=payload.team_id,
        role=RoleEnum.MEMBER,
    )
    from ..modules import registry
    member = registry.member_group(db)
    if member:
        user.permission_groups.append(member)
    db.add(user)
    try:
        db.flush()
        if payload.managed_team_ids is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Managed teams are administered through permission groups",
            )
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists") from exc
    db.refresh(user)
    return _user_to_public(user)


@router.patch("/{user_id}", response_model=UserPublic)
def update_user(
    user_id: int,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.users.edit")),
) -> UserPublic:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not allows_team(db, current_user, "core.users.edit", user.team_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside permitted scope")
    security_changes = any(value is not None for value in [payload.username, payload.email, payload.password, payload.is_active])
    if security_changes and "any" not in permission_scopes(db, current_user, "core.users.credentials.manage"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing core.users.credentials.manage")
    if payload.username is not None:
        user.username = payload.username

    if payload.real_name is not None:
        user.real_name = payload.real_name

    if payload.email is not None:
        user.email = payload.email

    if payload.password:
        user.password_hash = get_password_hash(payload.password)
        # If admin is changing someone else's password, require password change on next login
        if current_user.id != user.id:
            user.first_login_at = None
    if payload.preferred_language is not None:
        user.preferred_language = payload.preferred_language
    if payload.team_id is not None:
        if payload.team_id:
            team = db.get(Team, payload.team_id)
            if not team:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
            if not allows_team(db, current_user, "core.users.edit", payload.team_id):
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Target team outside permitted scope")
        user.team_id = payload.team_id
    elif "team_id" in payload.model_fields_set:
        if "any" not in permission_scopes(db, current_user, "core.users.edit"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Team assignment cannot be removed")
        user.team_id = None
    if payload.managed_team_ids is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Managed teams are administered through permission groups")
    if payload.is_active is not None:
        user.is_active = payload.is_active

    if "avatar" in payload.model_fields_set:
        if current_user.id != user.id and "core.avatar.manage" not in permission_keys(db, current_user):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Missing core.avatar.manage")
        user.avatar = payload.avatar

    db.add(user)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists") from exc
    db.refresh(user)
    return _user_to_public(user)


def generate_password(length: int = 12) -> str:
    """Generate a secure random password."""
    characters = string.ascii_letters + string.digits
    # Ensure password has at least one uppercase, one lowercase, and one digit
    password = [
        secrets.choice(string.ascii_uppercase),
        secrets.choice(string.ascii_lowercase),
        secrets.choice(string.digits)
    ]
    # Fill the rest with random characters
    for _ in range(length - 3):
        password.append(secrets.choice(characters))

    # Shuffle to avoid predictable pattern
    secrets.SystemRandom().shuffle(password)
    return ''.join(password)


@router.post("/{user_id}/generate-password")
def generate_and_set_password(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.users.edit")),
) -> dict:
    """Generate a random password for a user and require them to change it on next login."""
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not allows_team(db, current_user, "core.users.edit", user.team_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside permitted scope")

    if current_user.id == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot generate password for yourself")

    new_password = generate_password()
    user.password_hash = get_password_hash(new_password)
    user.first_login_at = None  # Require password change on next login

    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "password": new_password,
        "message": "Password generated. User will be required to change it on next login."
    }


def transliterate_text(text: str) -> str:
    """Convert accented characters to their ASCII equivalents using unidecode."""
    from unidecode import unidecode
    return unidecode(text)


@router.post("/bulk-register", response_model=BulkRegistrationResult)
def bulk_register_users(
    payload: BulkUserRegistration,
    db: Session = Depends(get_db),
    _: User = Depends(require_action("core.users.create")),
) -> BulkRegistrationResult:
    def generate_username(real_name: str) -> str:
        value = transliterate_text(real_name).lower().replace(" ", "_")
        value = re.sub(r"[^a-z0-9._-]", "", value).strip("._-")
        return value[:50]

    created_users = []
    errors = []

    if payload.team_id is not None:
        team = db.get(Team, payload.team_id)
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")

    for name in payload.names:
        name = name.strip()
        if not name:
            errors.append(f"Empty name provided")
            continue

        username = generate_username(name)
        if not username:
            errors.append(f"Could not generate username for '{name}'")
            continue

        existing_user = db.query(User).filter(User.username == username).first()
        if existing_user:
            counter = 1
            base_username = username
            while existing_user and counter < 100:
                username = f"{base_username}_{counter}"
                existing_user = db.query(User).filter(User.username == username).first()
                counter += 1

            if existing_user:
                errors.append(f"Could not generate unique username for '{name}'")
                continue

        try:
            # Generate unique password for each user
            plain_password = generate_password()

            user = User(
                username=username,
                real_name=name,
                email=None,
                password_hash=get_password_hash(plain_password),
                preferred_language=payload.preferred_language,
                team_id=payload.team_id,
                role=RoleEnum.MEMBER,
            )
            from ..modules import registry
            member = registry.member_group(db)
            if member:
                user.permission_groups.append(member)
            db.add(user)
            db.flush()

            # Create user with password for response
            user_public = _user_to_public(user)
            user_with_password = {**user_public.__dict__, "password": plain_password}
            created_users.append(UserWithPassword(**user_with_password))

        except IntegrityError:
            db.rollback()
            errors.append(f"Failed to create user for '{name}' due to database constraint")
            continue

    if created_users:
        db.commit()

    return BulkRegistrationResult(
        success_count=len(created_users),
        failed_count=len(errors),
        created_users=created_users,
        errors=errors
    )


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_action("core.users.delete")),
) -> None:
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if current_user.id == user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")
    if not allows_team(db, current_user, "core.users.delete", user.team_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside permitted scope")
    if any(group.name == "Superadmin" for group in user.permission_groups):
        from ..models import PermissionGroup
        admin = db.query(PermissionGroup).filter_by(name="Superadmin").one_or_none()
        if admin is not None and not any(other.id != user.id and other.is_active for other in admin.members):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Nelze smazat posledního superadmina")
    db.delete(user)
    db.commit()


@router.put("/me/password", response_model=UserPublic)
def change_own_password(
    payload: PasswordChangeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> UserPublic:
    """Change current user's password."""
    # Verify current password
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

    # Update password
    current_user.password_hash = get_password_hash(payload.new_password)

    # Mark as having completed first login (no longer needs password change)
    if current_user.first_login_at is None:
        from datetime import datetime, timezone
        current_user.first_login_at = datetime.now(timezone.utc).replace(tzinfo=None)

    db.commit()
    db.refresh(current_user)

    return _user_to_public(current_user)
    if not allows_team(db, current_user, "core.users.delete", user.team_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User outside permitted scope")
