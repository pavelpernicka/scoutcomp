from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..core.security import (
    create_access_token,
    create_refresh_token,
    get_password_hash,
    verify_password,
)
from ..dependencies import get_db
from ..models import RefreshToken, RoleEnum, Team, User
from ..config import settings
from ..schemas import (
    LoginRequest,
    RegistrationRequest,
    RegistrationSettings,
    RefreshRequest,
    RefreshTokenResponse,
    TokenPair,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _allow_admin_bootstrap(db: Session) -> bool:
    admin_exists = db.query(User).filter(User.role == RoleEnum.ADMIN).first() is not None
    return settings.app.developer_mode or not admin_exists


@router.get("/options", response_model=RegistrationSettings)
def registration_options(db: Session = Depends(get_db)) -> RegistrationSettings:
    allow_member = settings.app.features.allow_self_registration
    allow_admin = _allow_admin_bootstrap(db)
    return RegistrationSettings(
        allow_member_registration=allow_member,
        allow_admin_bootstrap=allow_admin,
    )


@router.post("/register", response_model=TokenPair, status_code=status.HTTP_201_CREATED)
def register(payload: RegistrationRequest, db: Session = Depends(get_db)) -> TokenPair:
    role = payload.role or RoleEnum.MEMBER
    allow_admin = _allow_admin_bootstrap(db)
    allow_member = settings.app.features.allow_self_registration

    if role == RoleEnum.ADMIN:
        if not allow_admin:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin bootstrap is disabled")
        team_id = None
    else:
        if not allow_member:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Self registration is disabled")
        if not payload.join_code:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Join code is required")
        team = db.query(Team).filter(Team.join_code == payload.join_code).first()
        if not team:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid join code")
        team_id = team.id
        role = RoleEnum.MEMBER

    existing_user = (
        db.query(User)
        .filter(or_(User.username == payload.username, User.email == payload.email))
        .first()
    )
    if existing_user:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or email already exists")

    user = User(
        username=payload.username,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        preferred_language=payload.preferred_language or settings.app.default_language,
        role=role,
        team_id=team_id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    access_token, expires_in = create_access_token(user.id, user.role)
    refresh_token_value, refresh_expires = create_refresh_token()

    refresh_token = RefreshToken(user_id=user.id, token=refresh_token_value, expires_at=refresh_expires)
    db.add(refresh_token)
    db.commit()

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token_value,
        expires_in=expires_in,
    )


@router.post("/login", response_model=TokenPair)
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenPair:
    user = (
        db.query(User)
        .filter(or_(User.username == payload.username, User.email == payload.username))
        .first()
    )
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="User inactive")

    access_token, expires_in = create_access_token(user.id, user.role)
    refresh_token_value, refresh_expires = create_refresh_token()

    refresh_token = RefreshToken(user_id=user.id, token=refresh_token_value, expires_at=refresh_expires)
    db.add(refresh_token)
    db.commit()

    return TokenPair(
        access_token=access_token,
        refresh_token=refresh_token_value,
        expires_in=expires_in,
    )


@router.post("/refresh", response_model=RefreshTokenResponse)
def refresh_token(payload: RefreshRequest, db: Session = Depends(get_db)) -> RefreshTokenResponse:
    token_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token == payload.refresh_token)
        .first()
    )
    if not token_record or token_record.expires_at < datetime.utcnow():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = token_record.user
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    access_token, expires_in = create_access_token(user.id, user.role)
    return RefreshTokenResponse(access_token=access_token, expires_in=expires_in)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(payload: RefreshRequest, db: Session = Depends(get_db)) -> None:
    token_record = (
        db.query(RefreshToken)
        .filter(RefreshToken.token == payload.refresh_token)
        .first()
    )
    if token_record:
        db.delete(token_record)
        db.commit()
