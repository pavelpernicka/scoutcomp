from datetime import datetime, timedelta, timezone
import threading

from sqlalchemy.orm import sessionmaker

from app.models import (
    RoleEnum,
    ScoutEvent,
    User,
    WebArtifactInvalidation,
    WebArtifactInvalidationFence,
    WebPage,
    WebPageRevision,
    WebPost,
    WebPostRevision,
)
from app.modules import registry
from app.routers.activity import delete_event
from app.web import artifact_queue, pages
from app.web.artifact_queue import enqueue_artifact_invalidations
from app.web.pages import publish_page
from app.web.routes_content import delete_post, unpublish_post


def _queue_session_factory(db_session):
    return sessionmaker(
        bind=db_session.bind,
        autocommit=False,
        autoflush=False,
        future=True,
    )


def _project(*components):
    return {
        "assets": [],
        "styles": [],
        "pages": [{
            "id": "page-1",
            "frames": [{
                "id": "frame-1",
                "component": {"type": "wrapper", "components": list(components)},
                "styles": [],
            }],
        }],
        "scoutcomp": {"schemaVersion": 2},
    }


def test_dispatcher_coalesces_dependency_keys_in_one_durable_batch(db_session, monkeypatch):
    factory = _queue_session_factory(db_session)
    monkeypatch.setattr(artifact_queue, "SessionLocal", factory)
    calls = []

    def rebuild(_db, *, dependency_keys, artifact_generation, prepare_commit):
        assert prepare_commit() is True
        calls.append((dependency_keys, artifact_generation))
        return 3

    monkeypatch.setattr(pages, "rebuild_published_page_artifacts", rebuild)
    enqueue_artifact_invalidations(db_session, {"source:core.events"})
    enqueue_artifact_invalidations(
        db_session, {"source:core.events", "source:core.posts"},
    )
    db_session.commit()
    newest = db_session.query(WebArtifactInvalidation.id).order_by(
        WebArtifactInvalidation.id.desc(),
    ).first()[0]

    assert artifact_queue.process_artifact_invalidation_batch() is True
    assert calls == [({"source:core.events", "source:core.posts"}, newest)]
    db_session.expire_all()
    assert db_session.query(WebArtifactInvalidation).count() == 0


def test_enqueue_and_worker_prepare_share_cross_dialect_fence(db_session, monkeypatch):
    factory = _queue_session_factory(db_session)
    monkeypatch.setattr(artifact_queue, "SessionLocal", factory)
    initial_generation = db_session.get(WebArtifactInvalidationFence, 1).generation

    enqueue_artifact_invalidations(db_session, {"source:core.events"})

    # autoflush=False proves the fence UPDATE happened before the pending job
    # INSERT; both are committed by the surrounding source-mutation tx.
    pending_jobs = [
        row for row in db_session.new
        if isinstance(row, WebArtifactInvalidation)
    ]
    assert len(pending_jobs) == 1
    assert pending_jobs[0].id is None
    db_session.expire_all()
    assert db_session.get(WebArtifactInvalidationFence, 1).generation == initial_generation + 1
    db_session.commit()

    batch = artifact_queue._claim_batch()
    assert batch is not None
    with factory() as worker_db:
        before_prepare = worker_db.get(WebArtifactInvalidationFence, 1).generation
        assert artifact_queue._prepare_batch_commit(worker_db, batch) is True
        worker_db.flush()
        worker_db.expire_all()
        assert worker_db.get(WebArtifactInvalidationFence, 1).generation == before_prepare + 1
        worker_db.rollback()


def test_dispatcher_keeps_failed_jobs_for_retry(db_session, monkeypatch):
    factory = _queue_session_factory(db_session)
    monkeypatch.setattr(artifact_queue, "SessionLocal", factory)

    def fail(*_args, **_kwargs):
        raise RuntimeError("renderer failed")

    monkeypatch.setattr(pages, "rebuild_published_page_artifacts", fail)
    enqueue_artifact_invalidations(db_session, {"source:core.events"})
    db_session.commit()

    assert artifact_queue.process_artifact_invalidation_batch() is True
    db_session.expire_all()
    job = db_session.query(WebArtifactInvalidation).one()
    assert job.attempt_count == 1
    assert job.lock_token is None
    assert job.locked_at is None
    assert job.available_at > datetime.now(timezone.utc).replace(tzinfo=None)
    assert job.last_error == "renderer failed"


def test_stale_lease_is_requeued_with_a_newer_generation(db_session, monkeypatch):
    factory = _queue_session_factory(db_session)
    monkeypatch.setattr(artifact_queue, "SessionLocal", factory)
    stale = WebArtifactInvalidation(
        dependency_key="source:core.events",
        locked_at=(datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)),
        lock_token="abandoned",
    )
    db_session.add(stale)
    db_session.commit()
    old_generation = stale.id

    claimed = artifact_queue._claim_batch()

    assert claimed is not None
    assert claimed.generation > old_generation
    assert claimed.dependency_keys == {"source:core.events"}


def test_newer_invalidation_during_render_prevents_stale_artifact_commit(db_session, monkeypatch):
    factory = _queue_session_factory(db_session)
    monkeypatch.setattr(artifact_queue, "SessionLocal", factory)
    page = WebPage(slug="race", title="Race", published=True)
    db_session.add(page)
    db_session.flush()
    revision = WebPageRevision(
        page_id=page.id,
        revision_number=1,
        source_version=1,
        title=page.title,
        is_publication=True,
        rendered_html="stable",
        rendered_variants={},
        render_dependencies=["source:core.events"],
        artifact_generation=0,
    )
    db_session.add(revision)
    db_session.flush()
    page.published_revision_id = revision.id
    enqueue_artifact_invalidations(db_session, {"source:core.events"})
    db_session.commit()
    old_generation = db_session.query(WebArtifactInvalidation.id).scalar()
    inserted = False

    def render(*_args, **_kwargs):
        nonlocal inserted
        if not inserted:
            with factory() as other:
                enqueue_artifact_invalidations(other, {"source:core.events"})
                other.commit()
            inserted = True
        return {
            WebPageRevision.rendered_html: "stale candidate",
            WebPageRevision.rendered_variants: {},
            WebPageRevision.rendered_at: datetime.now(timezone.utc),
            WebPageRevision.render_dependencies: ["source:core.events"],
        }

    monkeypatch.setattr(pages, "_render_publication_artifacts", render)
    assert artifact_queue.process_artifact_invalidation_batch() is True

    db_session.expire_all()
    stored = db_session.get(WebPageRevision, revision.id)
    jobs = db_session.query(WebArtifactInvalidation).all()
    assert stored.rendered_html == "stable"
    assert stored.artifact_generation == 0
    assert len(jobs) == 1
    assert jobs[0].id > old_generation
    assert jobs[0].lock_token is None


def test_shutdown_releases_owned_lease_and_blocks_late_commit(db_session, monkeypatch):
    factory = _queue_session_factory(db_session)
    monkeypatch.setattr(artifact_queue, "SessionLocal", factory)
    page = WebPage(slug="shutdown", title="Shutdown", published=True)
    db_session.add(page)
    db_session.flush()
    revision = WebPageRevision(
        page_id=page.id,
        revision_number=1,
        source_version=1,
        title=page.title,
        is_publication=True,
        rendered_html="stable",
        rendered_variants={},
        render_dependencies=["source:core.events"],
        artifact_generation=0,
    )
    db_session.add(revision)
    db_session.flush()
    page.published_revision_id = revision.id
    enqueue_artifact_invalidations(db_session, {"source:core.events"})
    db_session.commit()

    rendering = threading.Event()
    resume = threading.Event()

    def slow_render(*_args, **_kwargs):
        rendering.set()
        assert resume.wait(timeout=5)
        return {
            WebPageRevision.rendered_html: "late candidate",
            WebPageRevision.rendered_variants: {},
            WebPageRevision.rendered_at: datetime.now(timezone.utc),
            WebPageRevision.render_dependencies: ["source:core.events"],
        }

    monkeypatch.setattr(pages, "_render_publication_artifacts", slow_render)
    dispatcher = artifact_queue._ArtifactDispatcher(join_timeout=0.05)
    dispatcher.start()
    assert rendering.wait(timeout=2)

    dispatcher.stop()
    db_session.expire_all()
    released = db_session.query(WebArtifactInvalidation).one()
    assert released.lock_token is None
    assert released.locked_at is None
    reclaimed = artifact_queue._claim_batch()
    assert reclaimed is not None

    resume.set()
    dispatcher._thread.join(timeout=2)
    assert not dispatcher._thread.is_alive()
    db_session.expire_all()
    assert db_session.get(WebPageRevision, revision.id).rendered_html == "stable"
    still_owned_by_replacement = db_session.query(WebArtifactInvalidation).one()
    assert still_owned_by_replacement.lock_token == reclaimed.lock_token


def test_older_artifact_generation_cannot_overwrite_newer_output(db_session, monkeypatch):
    page = WebPage(slug="front", title="Front", published=True)
    db_session.add(page)
    db_session.flush()
    revision = WebPageRevision(
        page_id=page.id,
        revision_number=1,
        source_version=1,
        title=page.title,
        is_publication=True,
        artifact_generation=0,
    )
    db_session.add(revision)
    db_session.flush()
    page.published_revision_id = revision.id
    db_session.commit()

    rendered = {"document": "new"}

    def render(*_args, dependency_sink, **_kwargs):
        dependency_sink.add("source:core.events")
        return rendered["document"]

    import app.site_app as site_app
    monkeypatch.setattr(site_app, "_render_revision", render)

    assert pages._build_publication_artifacts(
        db_session, page, revision, artifact_generation=2,
    ) is True
    db_session.commit()
    rendered["document"] = "old"
    assert pages._build_publication_artifacts(
        db_session, page, revision, artifact_generation=1,
    ) is False
    db_session.commit()

    db_session.expire_all()
    stored = db_session.get(WebPageRevision, revision.id)
    assert stored.rendered_html == "new"
    assert stored.artifact_generation == 2


def test_post_unpublish_and_delete_commit_state_with_invalidations(db_session):
    registry.seed(db_session)
    admin = User(
        username="artifact-admin",
        real_name="Artifact Admin",
        password_hash="x",
        role=RoleEnum.ADMIN,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    post = WebPost(title="Live", slug="live", published=True)
    deleted_post = WebPost(title="Delete", slug="delete", published=True)
    db_session.add_all([admin, post, deleted_post])
    db_session.flush()
    revision = WebPostRevision(
        post_id=post.id,
        revision_number=1,
        source_version=1,
        title=post.title,
        slug=post.slug,
        reason="publish",
        is_publication=True,
    )
    db_session.add(revision)
    deleted_revision = WebPostRevision(
        post_id=deleted_post.id,
        revision_number=1,
        source_version=1,
        title=deleted_post.title,
        slug=deleted_post.slug,
        reason="publish",
        is_publication=True,
    )
    db_session.add(deleted_revision)
    db_session.flush()
    post.published_revision_id = revision.id
    deleted_post.published_revision_id = deleted_revision.id
    db_session.commit()

    result = unpublish_post(post.id, db_session, admin)
    delete_post(deleted_post.id, db_session, admin)

    assert result["published"] is False
    db_session.refresh(deleted_post)
    assert deleted_post.published is False
    assert deleted_post.deleted_at is not None
    jobs = db_session.query(WebArtifactInvalidation).all()
    assert len(jobs) == 4
    assert {
        row.dependency_key
        for row in jobs
    } == {"source:core.posts", "source:web.posts"}


def test_deleted_event_disappears_from_published_artifact_after_queue(db_session, monkeypatch):
    registry.seed(db_session)
    admin = User(
        username="event-artifact-admin",
        real_name="Event Artifact Admin",
        password_hash="x",
        role=RoleEnum.ADMIN,
        first_login_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )
    event = ScoutEvent(
        title="Akce ke smazání",
        kind="meeting",
        starts_at=datetime.now(timezone.utc).replace(tzinfo=None),
        is_public=True,
    )
    page = WebPage(
        slug="events",
        path_segment="events",
        path="/events",
        title="Events",
        draft_version=1,
        data=_project({
            "type": "sc-repeat",
            "source": "core.events",
            "components": [{
                "type": "text",
                "tagName": "h2",
                "scBindings": {
                    "text": {"scope": "context", "field": "title"},
                },
            }],
        }),
    )
    db_session.add_all([admin, event, page])
    db_session.flush()
    event.created_by_id = admin.id
    db_session.commit()
    revision = publish_page(
        db_session, page, expected_version=1, user_id=admin.id,
    )
    assert "Akce ke smazání" in revision.rendered_html
    assert revision.render_dependencies == ["source:core.events"]

    delete_event(event.id, db_session, admin)
    factory = _queue_session_factory(db_session)
    monkeypatch.setattr(artifact_queue, "SessionLocal", factory)
    assert artifact_queue.process_artifact_invalidation_batch() is True

    db_session.expire_all()
    rebuilt = db_session.get(WebPageRevision, revision.id)
    assert rebuilt is not None
    assert "Akce ke smazání" not in rebuilt.rendered_html
    from app.site_app import _render_revision
    assert "Akce ke smazání" not in _render_revision(
        db_session, db_session.get(WebPage, page.id), rebuilt,
    )
