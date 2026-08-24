"""Best-effort Web Push delivery using a stable VAPID key pair."""
from __future__ import annotations

import json
import ipaddress
import logging
import re
import socket
import threading
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from time import monotonic
from typing import Any, Iterable
from urllib.parse import urlsplit

from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from ..config import settings
from ..database import SessionLocal
from ..models import PushDelivery, PushSubscription, User

try:  # Kept importable when an older development environment is not refreshed yet.
    from pywebpush import WebPushException, webpush
    from requests import Session as RequestsSession
except ImportError:  # pragma: no cover - production dependencies include pywebpush
    WebPushException = Exception
    webpush = None
    RequestsSession = None

logger = logging.getLogger(__name__)
_ACTION_ID = re.compile(r"^[a-z0-9_-]{1,32}$")
_MIN_DELIVERY_LOCK_TIMEOUT = timedelta(minutes=5)
_FAILED_DELIVERY_RETENTION = timedelta(days=7)
_RETRY_DELAYS_SECONDS = (15, 60, 300, 1800, 7200, 21600)


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
        and webpush is not None
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
                    ttl=push.delivery_ttl_seconds,
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


def _queued_payload(payload: dict[str, Any]) -> str:
    """Store bounded generic and preview variants, not arbitrary rich content."""
    envelope = {
        "version": 1,
        "generic": _payload_for_delivery(payload, show_previews=False),
        "preview": _payload_for_delivery(payload, show_previews=True),
    }
    return json.dumps(envelope, ensure_ascii=False, separators=(",", ":"))


def _payload_from_queue(value: str, *, show_previews: bool) -> str | None:
    try:
        envelope = json.loads(value)
    except (TypeError, ValueError):
        return None
    if not isinstance(envelope, dict) or envelope.get("version") != 1:
        return None
    payload = envelope.get("preview" if show_previews else "generic")
    if not isinstance(payload, dict):
        return None
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":"))


@dataclass(frozen=True)
class _ClaimedDelivery:
    delivery_id: int
    lock_token: str
    subscription_id: int
    endpoint: str
    p256dh: str
    auth: str
    user_active: bool
    show_previews: bool
    payload: str


@dataclass(frozen=True)
class _DeliveryResult:
    delivery_id: int
    lock_token: str
    subscription_id: int
    outcome: str
    status_code: int | None = None
    retry_after_seconds: int | None = None


def _retry_after_seconds(response: Any) -> int | None:
    """Read a bounded delta-seconds or HTTP-date Retry-After provider value."""
    headers = getattr(response, "headers", None)
    value = headers.get("Retry-After") if headers is not None else None
    text = str(value or "").strip()
    try:
        seconds = int(text)
    except ValueError:
        try:
            retry_at = parsedate_to_datetime(text)
            if retry_at.tzinfo is None:
                retry_at = retry_at.replace(tzinfo=timezone.utc)
            seconds = int((retry_at - datetime.now(timezone.utc)).total_seconds())
        except (TypeError, ValueError, OverflowError):
            return None
    return min(max(seconds, 0), 24 * 60 * 60)


def _send_claimed_delivery(delivery: _ClaimedDelivery) -> _DeliveryResult:
    """Perform one network request without holding a database connection."""
    if not delivery.user_active:
        return _DeliveryResult(
            delivery.delivery_id,
            delivery.lock_token,
            delivery.subscription_id,
            "discard",
        )
    if not endpoint_host_allowed(delivery.endpoint) or not _endpoint_resolves_public(delivery.endpoint):
        return _DeliveryResult(
            delivery.delivery_id,
            delivery.lock_token,
            delivery.subscription_id,
            "retry",
        )
    data = _payload_from_queue(delivery.payload, show_previews=delivery.show_previews)
    if data is None:
        return _DeliveryResult(
            delivery.delivery_id,
            delivery.lock_token,
            delivery.subscription_id,
            "invalid",
        )

    push = settings.app.push
    session = _NoRedirectSession() if _NoRedirectSession is not None else None
    try:
        webpush(
            subscription_info={
                "endpoint": delivery.endpoint,
                "keys": {"p256dh": delivery.p256dh, "auth": delivery.auth},
            },
            data=data,
            vapid_private_key=push.vapid_private_key,
            vapid_claims={"sub": push.vapid_subject},
            requests_session=session,
            timeout=5,
            ttl=push.delivery_ttl_seconds,
        )
        return _DeliveryResult(
            delivery.delivery_id,
            delivery.lock_token,
            delivery.subscription_id,
            "success",
        )
    except WebPushException as exc:
        response = getattr(exc, "response", None)
        status_code = getattr(response, "status_code", None)
        outcome = "gone" if status_code in {404, 410} else "retry"
        return _DeliveryResult(
            delivery.delivery_id,
            delivery.lock_token,
            delivery.subscription_id,
            outcome,
            status_code,
            _retry_after_seconds(response),
        )
    except Exception:
        return _DeliveryResult(
            delivery.delivery_id,
            delivery.lock_token,
            delivery.subscription_id,
            "retry",
        )
    finally:
        if session is not None:
            session.close()


def _claim_due_deliveries(limit: int) -> list[_ClaimedDelivery]:
    """Atomically lease one batch; stale leases are recovered after a restart."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    workers = settings.app.push.delivery_workers
    network_waves = (limit + workers - 1) // workers
    lock_timeout = max(
        _MIN_DELIVERY_LOCK_TIMEOUT,
        timedelta(seconds=network_waves * 6 + 60),
    )
    stale_before = now - lock_timeout
    lock_token = uuid.uuid4().hex
    with SessionLocal() as db:
        ready = (
            PushDelivery.failed_at.is_(None),
            PushDelivery.available_at <= now,
            or_(PushDelivery.locked_at.is_(None), PushDelivery.locked_at < stale_before),
        )
        candidate_ids = [
            delivery_id
            for (delivery_id,) in db.query(PushDelivery.id)
            .filter(*ready)
            .order_by(PushDelivery.available_at, PushDelivery.id)
            .limit(limit)
            .all()
        ]
        if not candidate_ids:
            return []
        db.query(PushDelivery).filter(
            PushDelivery.id.in_(candidate_ids),
            *ready,
        ).update(
            {PushDelivery.locked_at: now, PushDelivery.lock_token: lock_token},
            synchronize_session=False,
        )
        db.commit()
        rows = db.query(PushDelivery).filter(
            PushDelivery.lock_token == lock_token,
        ).options(
            joinedload(PushDelivery.subscription).joinedload(PushSubscription.user),
        ).all()
        return [
            _ClaimedDelivery(
                delivery_id=row.id,
                lock_token=lock_token,
                subscription_id=row.subscription.id,
                endpoint=row.subscription.endpoint,
                p256dh=row.subscription.p256dh,
                auth=row.subscription.auth,
                user_active=bool(
                    row.subscription.user is not None
                    and row.subscription.user.is_active
                ),
                show_previews=bool(
                    row.subscription.user is not None
                    and row.subscription.user.is_active
                    and row.subscription.user.push_show_previews
                ),
                payload=row.payload,
            )
            for row in rows
            if row.subscription is not None
        ]


def _release_delivery_leases(deliveries: list[_ClaimedDelivery]) -> None:
    """Make an interrupted, not-yet-processed batch immediately claimable."""
    delivery_ids = [delivery.delivery_id for delivery in deliveries]
    if not delivery_ids:
        return
    lock_tokens = {delivery.lock_token for delivery in deliveries}
    with SessionLocal() as db:
        db.query(PushDelivery).filter(
            PushDelivery.id.in_(delivery_ids),
            PushDelivery.lock_token.in_(lock_tokens),
        ).update(
            {PushDelivery.locked_at: None, PushDelivery.lock_token: None},
            synchronize_session=False,
        )
        db.commit()


def _retry_delay(attempt_count: int, provider_delay: int | None) -> int:
    configured = _RETRY_DELAYS_SECONDS[
        min(max(attempt_count - 1, 0), len(_RETRY_DELAYS_SECONDS) - 1)
    ]
    return max(configured, provider_delay or 0)


def _cleanup_expired_failed_deliveries(now: datetime | None = None) -> int:
    cutoff = (now or datetime.now(timezone.utc).replace(tzinfo=None)) - _FAILED_DELIVERY_RETENTION
    with SessionLocal() as db:
        deleted = db.query(PushDelivery).filter(
            PushDelivery.failed_at.is_not(None),
            PushDelivery.failed_at < cutoff,
        ).delete(synchronize_session=False)
        db.commit()
    return deleted


def _apply_delivery_results(results: list[_DeliveryResult]) -> dict[str, int]:
    """Persist a whole network batch in one short write transaction."""
    counts = {"success": 0, "gone": 0, "discard": 0, "retry": 0, "failed": 0}
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    max_attempts = settings.app.push.delivery_max_attempts
    with SessionLocal() as db:
        results_by_id = {result.delivery_id: result for result in results}
        deliveries = db.query(PushDelivery).filter(
            PushDelivery.id.in_(results_by_id),
        ).options(joinedload(PushDelivery.subscription)).all()
        gone_subscription_ids: set[int] = set()
        for delivery in deliveries:
            result = results_by_id[delivery.id]
            if delivery.lock_token != result.lock_token:
                continue
            subscription = delivery.subscription
            if result.outcome == "success":
                if subscription is not None:
                    subscription.failure_count = 0
                db.delete(delivery)
                counts["success"] += 1
                continue
            if result.outcome == "discard":
                db.delete(delivery)
                counts["discard"] += 1
                continue
            if result.outcome == "gone":
                if subscription is not None and subscription.id not in gone_subscription_ids:
                    db.delete(subscription)
                    gone_subscription_ids.add(subscription.id)
                else:
                    db.delete(delivery)
                counts["gone"] += 1
                continue

            delivery.attempt_count = (delivery.attempt_count or 0) + 1
            delivery.last_status_code = result.status_code
            delivery.locked_at = None
            delivery.lock_token = None
            if result.outcome == "invalid" or delivery.attempt_count >= max_attempts:
                delivery.failed_at = now
                if subscription is not None:
                    subscription.failure_count = (subscription.failure_count or 0) + 1
                counts["failed"] += 1
            else:
                delivery.available_at = now + timedelta(seconds=_retry_delay(
                    delivery.attempt_count,
                    result.retry_after_seconds,
                ))
                counts["retry"] += 1

        db.commit()
    return counts


class _PushDispatcher:
    """Single bounded dispatcher; DB leases also make multiple API workers safe."""

    def __init__(self) -> None:
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._thread = threading.Thread(
            target=self._run,
            name="scoutcomp-push-dispatcher",
            daemon=True,
        )

    def start(self) -> None:
        self._thread.start()

    def wake(self) -> None:
        self._wake.set()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        self._thread.join(timeout=15)
        if self._thread.is_alive():
            logger.warning("Push dispatcher did not stop within the graceful timeout")

    def _run(self) -> None:
        push = settings.app.push
        next_cleanup_at = 0.0
        with ThreadPoolExecutor(
            max_workers=push.delivery_workers,
            thread_name_prefix="scoutcomp-webpush",
        ) as executor:
            while not self._stop.is_set():
                try:
                    if monotonic() >= next_cleanup_at:
                        deleted = _cleanup_expired_failed_deliveries()
                        if deleted:
                            logger.info("Removed %s expired failed Web Push deliveries", deleted)
                        next_cleanup_at = monotonic() + 60 * 60
                    deliveries = _claim_due_deliveries(push.delivery_batch_size)
                    if deliveries:
                        results: list[_DeliveryResult] = []
                        processed_ids: set[int] = set()
                        for offset in range(0, len(deliveries), push.delivery_workers):
                            if self._stop.is_set():
                                break
                            chunk = deliveries[offset:offset + push.delivery_workers]
                            futures = [
                                executor.submit(_send_claimed_delivery, item)
                                for item in chunk
                            ]
                            chunk_results = [
                                future.result()
                                for future in as_completed(futures)
                            ]
                            results.extend(chunk_results)
                            processed_ids.update(result.delivery_id for result in chunk_results)
                        try:
                            counts = _apply_delivery_results(results) if results else {
                                "success": 0,
                                "gone": 0,
                                "discard": 0,
                                "retry": 0,
                                "failed": 0,
                            }
                        except Exception:
                            _release_delivery_leases(deliveries)
                            raise
                        pending = [
                            item for item in deliveries
                            if item.delivery_id not in processed_ids
                        ]
                        _release_delivery_leases(pending)
                        logger.info(
                            "Web Push batch processed: claimed=%s released=%s "
                            "success=%s gone=%s discard=%s retry=%s failed=%s",
                            len(deliveries),
                            len(pending),
                            counts["success"],
                            counts["gone"],
                            counts["discard"],
                            counts["retry"],
                            counts["failed"],
                        )
                        continue
                except Exception:
                    logger.exception("Web Push dispatcher cycle failed")
                self._wake.wait(timeout=push.delivery_poll_seconds)
                self._wake.clear()


_dispatcher: _PushDispatcher | None = None
_dispatcher_lock = threading.Lock()


def start_push_dispatcher() -> _PushDispatcher | None:
    """Start the durable queue worker when Web Push is fully configured."""
    global _dispatcher
    if not push_enabled() or webpush is None:
        return None
    with _dispatcher_lock:
        if _dispatcher is None:
            _dispatcher = _PushDispatcher()
            _dispatcher.start()
        return _dispatcher


def stop_push_dispatcher(dispatcher: _PushDispatcher | None) -> None:
    global _dispatcher
    if dispatcher is None:
        return
    with _dispatcher_lock:
        if _dispatcher is dispatcher:
            _dispatcher = None
    dispatcher.stop()


def _wake_dispatcher() -> None:
    with _dispatcher_lock:
        dispatcher = _dispatcher
    if dispatcher is not None:
        dispatcher.wake()


def deliver_push_to_user_ids(user_ids: Iterable[int], payload: dict[str, Any]) -> None:
    """Durably enqueue one notification for every active recipient device."""
    ids = {int(user_id) for user_id in user_ids}
    if not ids or not push_enabled():
        return
    queued_payload = _queued_payload(payload)
    with SessionLocal() as db:
        subscriptions = db.query(PushSubscription).filter(
            PushSubscription.user_id.in_(ids),
            PushSubscription.disabled_at.is_(None),
        ).join(PushSubscription.user).filter(User.is_active.is_(True)).all()
        db.add_all([
            PushDelivery(subscription_id=subscription.id, payload=queued_payload)
            for subscription in subscriptions
        ])
        db.commit()
    if subscriptions:
        _wake_dispatcher()


def deliver_personalized_pushes(payloads_by_user_id: dict[int, dict[str, Any]]) -> None:
    """Durably enqueue per-recipient payloads in one short DB transaction."""
    payloads = {
        int(user_id): payload
        for user_id, payload in payloads_by_user_id.items()
        if isinstance(payload, dict)
    }
    if not payloads or not push_enabled():
        return
    with SessionLocal() as db:
        subscriptions = db.query(PushSubscription).filter(
            PushSubscription.user_id.in_(payloads),
            PushSubscription.disabled_at.is_(None),
        ).join(PushSubscription.user).filter(User.is_active.is_(True)).all()
        serialized = {
            user_id: _queued_payload(payload)
            for user_id, payload in payloads.items()
        }
        db.add_all([
            PushDelivery(
                subscription_id=subscription.id,
                payload=serialized[subscription.user_id],
            )
            for subscription in subscriptions
        ])
        db.commit()
    if subscriptions:
        _wake_dispatcher()
