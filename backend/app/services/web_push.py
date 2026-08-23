"""Best-effort Web Push delivery using a stable VAPID key pair."""
from __future__ import annotations

import json
import ipaddress
import logging
import re
import socket
from datetime import datetime, timezone
from html import unescape
from typing import Any, Iterable
from urllib.parse import urlsplit

from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..database import SessionLocal
from ..models import PushSubscription

try:  # Kept importable when an older development environment is not refreshed yet.
    from pywebpush import WebPushException, webpush
    from requests import Session as RequestsSession
except ImportError:  # pragma: no cover - production dependencies include pywebpush
    WebPushException = Exception
    webpush = None
    RequestsSession = None

logger = logging.getLogger(__name__)
_ACTION_ID = re.compile(r"^[a-z0-9_-]{1,32}$")


if RequestsSession is not None:
    class _NoRedirectSession(RequestsSession):
        def request(self, method, url, **kwargs):
            kwargs["allow_redirects"] = False
            return super().request(method, url, **kwargs)
else:  # pragma: no cover - used only before development dependencies are refreshed
    _NoRedirectSession = None


def push_enabled() -> bool:
    push = settings.app.push
    return bool(
        push.enabled
        and push.vapid_public_key
        and push.vapid_private_key
        and push.vapid_subject
    )


def notification_text(value: Any, *, limit: int = 180) -> str:
    """Project rich user content to a short, single-line OS notification."""
    text = re.sub(r"<[^>]*>", " ", str(value or ""))
    text = re.sub(r"[`*_>#~]", "", unescape(text))
    text = " ".join(text.split())
    if len(text) <= limit:
        return text
    shortened = text[: max(1, limit - 1)].rsplit(" ", 1)[0].rstrip()
    return f"{shortened or text[:limit - 1].rstrip()}…"


def notification_timestamp(value: datetime | None) -> int | None:
    """Return the millisecond epoch expected by NotificationOptions."""
    if value is None:
        return None
    aware = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
    return int(aware.timestamp() * 1000)


def _safe_rich_image(value: Any) -> str | None:
    """Allow only a published media route on this deployment's public site."""
    public_origin = settings.site.public_url
    if not value or not public_origin:
        return None
    candidate = urlsplit(str(value).strip())
    configured = urlsplit(public_origin)
    if (
        candidate.scheme != configured.scheme
        or candidate.netloc != configured.netloc
        or candidate.query
        or candidate.fragment
        or not re.fullmatch(r"/media/[1-9][0-9]{0,9}/file", candidate.path)
    ):
        return None
    return candidate.geturl()


def _payload_for_delivery(payload: dict[str, Any], *, show_previews: bool) -> dict[str, Any]:
    """Build a bounded browser payload without leaking an opted-out preview."""
    source = dict(payload)
    preview = source.pop("preview", None)
    if show_previews and isinstance(preview, dict):
        source.update(preview)

    result: dict[str, Any] = {
        "title": notification_text(source.get("title") or "ScoutComp", limit=100),
        "body": notification_text(source.get("body"), limit=240),
    }
    for key, limit in (("url", 700), ("tag", 80), ("kind", 32), ("lang", 12)):
        value = str(source.get(key) or "").strip()
        if value:
            result[key] = value[:limit]
    image = _safe_rich_image(source.get("image"))
    if image:
        result["image"] = image
    timestamp = source.get("timestamp")
    if isinstance(timestamp, (int, float)) and timestamp >= 0:
        result["timestamp"] = int(timestamp)

    actions: list[dict[str, str]] = []
    for raw_action in source.get("actions") or []:
        if not isinstance(raw_action, dict):
            continue
        action = str(raw_action.get("action") or "").strip()
        title = notification_text(raw_action.get("title"), limit=32)
        url = str(raw_action.get("url") or "").strip()[:700]
        if _ACTION_ID.fullmatch(action) and title and url:
            actions.append({"action": action, "title": title, "url": url})
        if len(actions) == 2:
            break
    if actions:
        result["actions"] = actions
    return result


def endpoint_host_allowed(endpoint: str) -> bool:
    """Accept only configured browser-vendor push-service hostnames."""
    hostname = (urlsplit(endpoint).hostname or "").lower().rstrip(".")
    for configured in settings.app.push.allowed_hosts:
        allowed = configured.strip().lower().rstrip(".")
        if not allowed:
            continue
        if allowed.startswith("."):
            if hostname.endswith(allowed) and hostname != allowed[1:]:
                return True
        elif hostname == allowed:
            return True
    return False


def send_to_subscriptions(
    db: Session,
    subscriptions: Iterable[PushSubscription],
    payload: dict[str, Any],
) -> None:
    """Deliver a small JSON payload; the caller owns the transaction.

    Expired endpoints are removed. Transient failures are retained and disabled
    only after repeated failures, so a temporary provider outage does not make
    users subscribe again.
    """
    if not push_enabled() or webpush is None:
        return

    push = settings.app.push
    serialized_payloads: dict[bool, str] = {}
    for subscription in subscriptions:
        if subscription.disabled_at is not None:
            continue
        if not endpoint_host_allowed(subscription.endpoint) or not _endpoint_resolves_public(subscription.endpoint):
            _record_failure(subscription)
            logger.warning("Push endpoint did not resolve to a public HTTPS address")
            continue
        try:
            show_previews = bool(
                subscription.user is not None
                and subscription.user.push_show_previews
            )
            data = serialized_payloads.get(show_previews)
            if data is None:
                data = json.dumps(
                    _payload_for_delivery(payload, show_previews=show_previews),
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
                serialized_payloads[show_previews] = data
            session = _NoRedirectSession() if _NoRedirectSession is not None else None
            try:
                webpush(
                    subscription_info={
                        "endpoint": subscription.endpoint,
                        "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth},
                    },
                    data=data,
                    vapid_private_key=push.vapid_private_key,
                    vapid_claims={"sub": push.vapid_subject},
                    requests_session=session,
                    timeout=5,
                )
            finally:
                if session is not None:
                    session.close()
            subscription.failure_count = 0
        except WebPushException as exc:
            response = getattr(exc, "response", None)
            status_code = getattr(response, "status_code", None)
            if status_code in {404, 410}:
                db.delete(subscription)
                logger.info("Removed an expired push subscription")
                continue
            _record_failure(subscription)
            logger.warning("Web Push provider rejected a notification (status=%s)", status_code)
        except Exception:
            _record_failure(subscription)
            logger.warning("Web Push delivery failed")


def _record_failure(subscription: PushSubscription) -> None:
    subscription.failure_count = (subscription.failure_count or 0) + 1
    if subscription.failure_count >= 5:
        subscription.disabled_at = datetime.now(timezone.utc).replace(tzinfo=None)


def _endpoint_resolves_public(endpoint: str) -> bool:
    """Re-check DNS at delivery time and reject every non-global A/AAAA answer."""
    parsed = urlsplit(endpoint)
    if parsed.scheme != "https" or not parsed.hostname or parsed.fragment:
        return False
    try:
        port = parsed.port or 443
        if port != 443:
            return False
        answers = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
        addresses = {ipaddress.ip_address(answer[4][0]) for answer in answers}
    except (OSError, ValueError):
        return False
    return bool(addresses) and all(address.is_global for address in addresses)


def deliver_push_to_user_ids(user_ids: Iterable[int], payload: dict[str, Any]) -> None:
    """Background-task entry point using its own short-lived DB session."""
    ids = {int(user_id) for user_id in user_ids}
    if not ids or not push_enabled():
        return
    with SessionLocal() as db:
        subscriptions = db.query(PushSubscription).filter(
            PushSubscription.user_id.in_(ids),
            PushSubscription.disabled_at.is_(None),
        ).options(joinedload(PushSubscription.user)).all()
        send_to_subscriptions(db, subscriptions, payload)
        db.commit()
