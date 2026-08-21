"""Authenticated browser Push API subscription management."""
from __future__ import annotations

import ipaddress
from hmac import compare_digest
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..config import settings
from ..dependencies import get_current_active_user, get_db
from ..models import PushSubscription, User
from ..services.web_push import endpoint_host_allowed, push_enabled

router = APIRouter(prefix="/push", tags=["push"])
MAX_SUBSCRIPTIONS_PER_USER = 5


class PushConfigResponse(BaseModel):
    enabled: bool
    vapid_public_key: str | None = None


class PushSubscriptionKeys(BaseModel):
    model_config = ConfigDict(extra="forbid")

    p256dh: str = Field(min_length=16, max_length=256)
    auth: str = Field(min_length=8, max_length=128)


class PushSubscriptionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=12, max_length=2048)
    keys: PushSubscriptionKeys


class PushUnsubscribePayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoint: str = Field(min_length=12, max_length=2048)


def _validate_endpoint(endpoint: str) -> None:
    """Reject endpoints that could turn delivery into a direct SSRF primitive."""
    parsed = urlsplit(endpoint)
    try:
        port = parsed.port
    except ValueError:
        port = -1
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.fragment
        or port not in {None, 443}
    ):
        raise HTTPException(422, "Push endpoint must be an HTTPS URL without credentials")
    if parsed.hostname.lower() == "localhost":
        raise HTTPException(422, "Private push endpoints are not allowed")
    if not endpoint_host_allowed(endpoint):
        raise HTTPException(422, "Unsupported Web Push provider")
    try:
        address = ipaddress.ip_address(parsed.hostname.strip("[]"))
    except ValueError:
        return
    if not address.is_global:
        raise HTTPException(422, "Private push endpoints are not allowed")


@router.get("/config", response_model=PushConfigResponse)
def get_push_config(
    current_user: User = Depends(get_current_active_user),
) -> PushConfigResponse:
    del current_user
    enabled = push_enabled()
    return PushConfigResponse(
        enabled=enabled,
        vapid_public_key=settings.app.push.vapid_public_key if enabled else None,
    )


@router.post("", status_code=status.HTTP_201_CREATED)
@router.put("", status_code=status.HTTP_200_OK)
def upsert_subscription(
    payload: PushSubscriptionPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> dict:
    if not push_enabled():
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Push is not configured")
    _validate_endpoint(payload.endpoint)

    subscription = db.query(PushSubscription).filter_by(endpoint=payload.endpoint).one_or_none()
    created = subscription is None
    if subscription is not None and subscription.user_id != current_user.id:
        if not (
            compare_digest(subscription.p256dh, payload.keys.p256dh)
            and compare_digest(subscription.auth, payload.keys.auth)
        ):
            raise HTTPException(status.HTTP_409_CONFLICT, "Push subscription ownership mismatch")
    if subscription is None or subscription.user_id != current_user.id:
        subscription_count = db.query(PushSubscription).filter_by(
            user_id=current_user.id,
        ).count()
        if subscription_count >= MAX_SUBSCRIPTIONS_PER_USER:
            raise HTTPException(status.HTTP_409_CONFLICT, "Push subscription limit reached")
    if subscription is None:
        subscription = PushSubscription(user_id=current_user.id, endpoint=payload.endpoint)
        db.add(subscription)
    else:
        # Possession of the endpoint and both browser-generated keys is the
        # capability needed to rebind a shared browser profile after logout.
        subscription.user_id = current_user.id
    subscription.p256dh = payload.keys.p256dh
    subscription.auth = payload.keys.auth
    subscription.failure_count = 0
    subscription.disabled_at = None
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Push endpoint is already registered") from None
    return {"created": created}


@router.post("/unsubscribe", status_code=status.HTTP_204_NO_CONTENT)
def unsubscribe(
    payload: PushUnsubscribePayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    subscription = db.query(PushSubscription).filter_by(
        user_id=current_user.id,
        endpoint=payload.endpoint,
    ).one_or_none()
    if subscription is not None:
        db.delete(subscription)
        db.commit()


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_subscriptions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
) -> None:
    db.query(PushSubscription).filter_by(user_id=current_user.id).delete(
        synchronize_session=False,
    )
    db.commit()
