from datetime import datetime, timedelta
from typing import Any, Dict, Tuple
import secrets

from jose import JWTError, jwt
from passlib.context import CryptContext

from ..config import settings
from ..models import RoleEnum


pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def _create_token(data: Dict[str, Any], expires_delta: timedelta) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + expires_delta
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.app.secret_key, algorithm=settings.app.token.algorithm)
    return encoded_jwt


def create_access_token(user_id: int, role: RoleEnum) -> Tuple[str, int]:
    expires_delta = timedelta(minutes=settings.app.token.access_expire_minutes)
    token = _create_token({"sub": str(user_id), "role": role.value}, expires_delta)
    return token, int(expires_delta.total_seconds())


def create_refresh_token() -> Tuple[str, datetime]:
    token = secrets.token_urlsafe(48)
    expires_at = datetime.utcnow() + timedelta(minutes=settings.app.token.refresh_expire_minutes)
    return token, expires_at


def decode_token(token: str) -> Dict[str, Any]:
    return jwt.decode(token, settings.app.secret_key, algorithms=[settings.app.token.algorithm])


def parse_subject(token: str) -> int:
    payload = decode_token(token)
    sub = payload.get("sub")
    if sub is None:
        raise JWTError("Missing subject")
    return int(sub)
