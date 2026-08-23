"""Push subscription boundary and delivery regressions."""
from datetime import datetime, timezone
import socket

import pytest
from fastapi import HTTPException

from app.config import settings
from app.core.security import get_password_hash
from app.models import PushSubscription, RoleEnum, Team, User
from app.routers.push import (
    MAX_SUBSCRIPTIONS_PER_USER,
    PushSubscriptionPayload,
    PushPreferencesPayload,
    PushUnsubscribePayload,
    get_push_config,
    unsubscribe,
    update_push_preferences,
    upsert_subscription,
)
from app.services import web_push


def _user(username: str, team: Team) -> User:
    return User(
        username=username,
        real_name=username,
        password_hash=get_password_hash("secret"),
        role=RoleEnum.MEMBER,
        preferred_language="cs",
        is_active=True,
        team=team,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


def _enable_push(monkeypatch) -> None:
    monkeypatch.setattr(settings.app.push, "enabled", True)
    monkeypatch.setattr(settings.app.push, "vapid_public_key", "public-key")
    monkeypatch.setattr(settings.app.push, "vapid_private_key", "private-key")
    monkeypatch.setattr(settings.app.push, "vapid_subject", "mailto:admin@example.test")
    monkeypatch.setattr(settings.app.push, "allowed_hosts", ["updates.example"])
    monkeypatch.setattr(settings.site, "public_url", "https://site.example")


def test_push_config_is_disabled_without_complete_vapid_configuration(db_session):
    team = Team(name="Beta", join_code="JOINBETA")
    alice = _user("alice", team)
    db_session.add_all([team, alice])
    db_session.commit()

    response = get_push_config(current_user=alice)
    assert response.model_dump() == {
        "enabled": False,
        "vapid_public_key": None,
        "show_previews": False,
    }
    assert update_push_preferences(
        PushPreferencesPayload(show_previews=True), db_session, alice,
    ) == {"show_previews": True}
    assert get_push_config(current_user=alice).show_previews is True


def test_subscription_upsert_delete_and_owner_boundary(db_session, monkeypatch):
    _enable_push(monkeypatch)
    team = Team(name="Gamma", join_code="JOINGAMMA")
    alice, bob, eve = _user("alice", team), _user("bob", team), _user("eve", team)
    db_session.add_all([team, alice, bob, eve])
    db_session.commit()
    payload = PushSubscriptionPayload.model_validate({
        "endpoint": "https://updates.example/push/device-a",
        "keys": {"p256dh": "p" * 65, "auth": "a" * 16},
    })

    assert upsert_subscription(payload, db_session, alice) == {"created": True}

    payload.keys.auth = "b" * 16
    assert upsert_subscription(payload, db_session, alice) == {"created": False}
    assert db_session.query(PushSubscription).one().auth == "b" * 16

    # A shared browser profile can safely rebind the complete browser-created
    # capability to the newly authenticated account.
    assert upsert_subscription(payload, db_session, bob) == {"created": False}
    assert db_session.query(PushSubscription).one().user_id == bob.id

    payload.keys.auth = "c" * 16
    with pytest.raises(HTTPException) as mismatch:
        upsert_subscription(payload, db_session, eve)
    assert mismatch.value.status_code == 409
    assert db_session.query(PushSubscription).one().user_id == bob.id

    unsubscribe(PushUnsubscribePayload(endpoint=payload.endpoint), db_session, bob)
    assert db_session.query(PushSubscription).count() == 0
    # Device cleanup is best effort and safe to retry after logout races.
    unsubscribe(PushUnsubscribePayload(endpoint=payload.endpoint), db_session, bob)


def test_subscription_rejects_private_endpoint(db_session, monkeypatch):
    _enable_push(monkeypatch)
    team = Team(name="Delta", join_code="JOINDELTA")
    alice = _user("alice", team)
    db_session.add_all([team, alice])
    db_session.commit()
    payload = PushSubscriptionPayload.model_validate({
            "endpoint": "https://127.0.0.1/push",
            "keys": {"p256dh": "p" * 65, "auth": "a" * 16},
    })
    with pytest.raises(HTTPException) as invalid:
        upsert_subscription(payload, db_session, alice)
    assert invalid.value.status_code == 422


def test_subscription_rejects_attacker_controlled_public_provider(db_session, monkeypatch):
    _enable_push(monkeypatch)
    team = Team(name="Provider", join_code="JOINPROVIDER")
    alice = _user("alice", team)
    db_session.add_all([team, alice])
    db_session.commit()
    payload = PushSubscriptionPayload.model_validate({
        "endpoint": "https://attacker.example/push",
        "keys": {"p256dh": "p" * 65, "auth": "a" * 16},
    })

    with pytest.raises(HTTPException) as invalid:
        upsert_subscription(payload, db_session, alice)
    assert invalid.value.status_code == 422


def test_delivery_prunes_gone_endpoint_and_tracks_transient_failure(db_session, monkeypatch):
    _enable_push(monkeypatch)
    monkeypatch.setattr(web_push, "_endpoint_resolves_public", lambda endpoint: True)
    team = Team(name="Zeta", join_code="JOINZETA")
    alice = _user("alice", team)
    db_session.add_all([team, alice])
    db_session.commit()
    gone = PushSubscription(
        user_id=alice.id,
        endpoint="https://updates.example/push/gone",
        p256dh="p" * 65,
        auth="a" * 16,
    )
    db_session.add(gone)
    db_session.commit()

    class Gone(Exception):
        response = type("Response", (), {"status_code": 410})()

    monkeypatch.setattr(web_push, "WebPushException", Gone)
    monkeypatch.setattr(web_push, "webpush", lambda **kwargs: (_ for _ in ()).throw(Gone()))
    web_push.send_to_subscriptions(db_session, [gone], {"title": "Test"})
    db_session.commit()
    assert db_session.query(PushSubscription).count() == 0

    flaky = PushSubscription(
        user_id=alice.id,
        endpoint="https://updates.example/push/flaky",
        p256dh="p" * 65,
        auth="a" * 16,
    )
    db_session.add(flaky)
    db_session.commit()
    monkeypatch.setattr(web_push, "webpush", lambda **kwargs: (_ for _ in ()).throw(RuntimeError()))
    web_push.send_to_subscriptions(db_session, [flaky], {"title": "Test"})
    assert flaky.failure_count == 1
    assert flaky.disabled_at is None
    rich_payload = {
        "title": "Generic",
        "body": "Generic body",
        "preview": {
            "title": "Private title",
            "body": "Private body",
            "image": "https://site.example/media/1/file",
        },
        "actions": [{"action": "open", "title": "Open", "url": "/messages"}],
    }
    generic = web_push._payload_for_delivery(rich_payload, show_previews=False)
    preview = web_push._payload_for_delivery(rich_payload, show_previews=True)
    assert generic["title"] == "Generic"
    assert "image" not in generic
    assert preview["title"] == "Private title"
    assert preview["image"] == "https://site.example/media/1/file"


def test_subscription_limit_is_bounded_per_user(db_session, monkeypatch):
    _enable_push(monkeypatch)
    team = Team(name="Limit", join_code="JOINLIMIT")
    alice = _user("alice", team)
    db_session.add_all([team, alice])
    db_session.commit()
    for index in range(MAX_SUBSCRIPTIONS_PER_USER):
        db_session.add(PushSubscription(
            user_id=alice.id,
            endpoint=f"https://updates.example/push/{index}",
            p256dh="p" * 65,
            auth="a" * 16,
        ))
    db_session.commit()
    payload = PushSubscriptionPayload.model_validate({
        "endpoint": "https://updates.example/push/too-many",
        "keys": {"p256dh": "p" * 65, "auth": "a" * 16},
    })
    with pytest.raises(HTTPException) as limited:
        upsert_subscription(payload, db_session, alice)
    assert limited.value.status_code == 409


def test_delivery_rejects_dns_that_resolves_to_private_address(db_session, monkeypatch):
    monkeypatch.setattr(
        web_push.socket,
        "getaddrinfo",
        lambda *args, **kwargs: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("127.0.0.1", 443))],
    )
    assert web_push._endpoint_resolves_public("https://push.example/device") is False


def test_post_recipients_respect_granular_posts_deny(db_session, monkeypatch):
    from app import permissions
    from app.web.routes_content import _active_reader_ids

    team = Team(name="Readers", join_code="JOINREAD")
    denied, allowed = _user("denied", team), _user("allowed", team)
    db_session.add_all([team, denied, allowed])
    db_session.commit()
    monkeypatch.setattr(
        permissions,
        "permission_keys",
        lambda _db, user: (
            {"web.manage"}
            if user.id == denied.id
            else {"web.manage", "web.posts.manage"}
        ),
    )
    assert _active_reader_ids(db_session) == {allowed.id}
