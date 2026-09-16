"""Durable background invalidation of immutable public page artifacts.

Dynamic event/article writes only enqueue dependency keys in their own
transaction.  A dispatcher coalesces a burst, leases it for one API worker and
atomically replaces the affected artifacts after rendering succeeds.
"""
from __future__ import annotations

import logging
import threading
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..database import SessionLocal
from ..models import WebArtifactInvalidation, WebArtifactInvalidationFence

logger = logging.getLogger(__name__)

_BATCH_SIZE = 500
_LEASE_TIMEOUT = timedelta(minutes=15)
_POLL_SECONDS = 1.0
_MAX_RETRY_SECONDS = 5 * 60


@dataclass(frozen=True)
class _ClaimedBatch:
    ids: tuple[int, ...]
    dependency_keys: frozenset[str]
    generation: int
    lock_token: str


def _utcnow() -> datetime:
    # The project stores UTC timestamps without tzinfo in SQLite.
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _lock_artifact_fence(db: Session) -> None:
    """Take the cross-dialect singleton write fence until caller commit.

    An actual UPDATE is used rather than dialect-specific lock syntax.  SQLite
    serialises writers while PostgreSQL and MariaDB take an exclusive row lock.
    """
    updated = db.query(WebArtifactInvalidationFence).filter(
        WebArtifactInvalidationFence.id == 1,
    ).update(
        {
            WebArtifactInvalidationFence.generation:
                WebArtifactInvalidationFence.generation + 1,
            WebArtifactInvalidationFence.updated_at: _utcnow(),
        },
        synchronize_session=False,
    )
    if updated != 1:
        raise RuntimeError("Public artifact invalidation fence is not initialized")


def enqueue_artifact_invalidations(db: Session, dependency_keys: set[str]) -> int:
    """Add source invalidations to the caller's current transaction.

    One row per distinct key keeps enqueueing portable and cheap.  Bursts are
    coalesced by the dispatcher, so routes never wait for rendering.
    """
    keys = sorted({key.strip() for key in dependency_keys if key.strip()})
    if not keys:
        return 0
    # This happens before the job INSERT. The fence remains held until the
    # caller commits the source mutation and its invalidation together,
    # ordering that transaction against the worker's final write.
    _lock_artifact_fence(db)
    db.add_all([
        WebArtifactInvalidation(dependency_key=key)
        for key in keys
    ])
    return len(keys)


def _claim_batch(limit: int = _BATCH_SIZE) -> _ClaimedBatch | None:
    """Lease one coalesced batch, allowing only one fresh global lease."""
    now = _utcnow()
    stale_before = now - _LEASE_TIMEOUT
    token = uuid.uuid4().hex
    with SessionLocal() as db:
        # Serialising rebuild batches avoids duplicate expensive renders.  The
        # generation CAS remains the correctness guard if a stale lease is
        # recovered while its original worker is merely slow rather than dead.
        fresh_lease = db.query(WebArtifactInvalidation.id).filter(
            WebArtifactInvalidation.lock_token.is_not(None),
            WebArtifactInvalidation.locked_at >= stale_before,
        ).first()
        if fresh_lease is not None:
            return None

        # Do not reuse the generation of an abandoned lease.  Replacing it by
        # a new row gives the recovering worker a strictly newer generation;
        # the original worker will also fail its final token-guarded delete
        # and roll back any artifact writes if it eventually resumes.
        stale_rows = db.query(
            WebArtifactInvalidation.id,
            WebArtifactInvalidation.dependency_key,
            WebArtifactInvalidation.lock_token,
        ).filter(
            WebArtifactInvalidation.lock_token.is_not(None),
            WebArtifactInvalidation.locked_at < stale_before,
        ).order_by(WebArtifactInvalidation.id).limit(limit).all()
        replaced = 0
        for row_id, dependency_key, old_token in stale_rows:
            deleted = db.query(WebArtifactInvalidation).filter(
                WebArtifactInvalidation.id == row_id,
                WebArtifactInvalidation.lock_token == old_token,
                WebArtifactInvalidation.locked_at < stale_before,
            ).delete(synchronize_session=False)
            if deleted:
                db.add(WebArtifactInvalidation(dependency_key=dependency_key))
                replaced += 1
        if replaced:
            db.commit()
            return _claim_batch(limit)

        ready = (
            WebArtifactInvalidation.available_at <= now,
            or_(
                WebArtifactInvalidation.locked_at.is_(None),
                WebArtifactInvalidation.locked_at < stale_before,
            ),
        )
        candidate_ids = [
            row_id
            for (row_id,) in db.query(WebArtifactInvalidation.id)
            .filter(*ready)
            .order_by(WebArtifactInvalidation.id)
            .limit(limit)
            .all()
        ]
        if not candidate_ids:
            return None
        db.query(WebArtifactInvalidation).filter(
            WebArtifactInvalidation.id.in_(candidate_ids),
            *ready,
        ).update(
            {
                WebArtifactInvalidation.locked_at: now,
                WebArtifactInvalidation.lock_token: token,
            },
            synchronize_session=False,
        )
        db.commit()
        rows = db.query(WebArtifactInvalidation).filter(
            WebArtifactInvalidation.lock_token == token,
        ).order_by(WebArtifactInvalidation.id).all()
        if not rows:
            return None
        return _ClaimedBatch(
            ids=tuple(row.id for row in rows),
            dependency_keys=frozenset(row.dependency_key for row in rows),
            generation=max(row.id for row in rows),
            lock_token=token,
        )


def _retry_batch(batch: _ClaimedBatch, exc: Exception) -> None:
    """Release a failed lease with bounded exponential backoff."""
    now = _utcnow()
    with SessionLocal() as db:
        rows = db.query(WebArtifactInvalidation).filter(
            WebArtifactInvalidation.id.in_(batch.ids),
            WebArtifactInvalidation.lock_token == batch.lock_token,
        ).all()
        for row in rows:
            row.attempt_count = int(row.attempt_count or 0) + 1
            row.available_at = now + timedelta(
                seconds=min(2 ** min(row.attempt_count, 12), _MAX_RETRY_SECONDS)
            )
            row.locked_at = None
            row.lock_token = None
            row.last_error = str(exc)[:2000]
        db.commit()


def _release_batch_lease(batch: _ClaimedBatch) -> int:
    """Release only this exact worker's lease, invalidating its later commit."""
    with SessionLocal() as db:
        released = db.query(WebArtifactInvalidation).filter(
            WebArtifactInvalidation.id.in_(batch.ids),
            WebArtifactInvalidation.lock_token == batch.lock_token,
        ).update(
            {
                WebArtifactInvalidation.locked_at: None,
                WebArtifactInvalidation.lock_token: None,
            },
            synchronize_session=False,
        )
        db.commit()
        return released


def _prepare_batch_commit(db: Session, batch: _ClaimedBatch) -> bool:
    """Acquire the short write fence and reject a superseded render."""
    _lock_artifact_fence(db)
    owned = db.query(WebArtifactInvalidation).filter(
        WebArtifactInvalidation.id.in_(batch.ids),
        WebArtifactInvalidation.lock_token == batch.lock_token,
    ).update(
        {WebArtifactInvalidation.locked_at: _utcnow()},
        synchronize_session=False,
    )
    if owned != len(batch.ids):
        return False
    newer = db.query(WebArtifactInvalidation.id).filter(
        WebArtifactInvalidation.id > batch.generation,
        WebArtifactInvalidation.dependency_key.in_(batch.dependency_keys),
    ).first()
    return newer is None


def _process_claimed_batch(batch: _ClaimedBatch) -> None:
    try:
        from .pages import rebuild_published_page_artifacts

        with SessionLocal() as db:
            # Rows can disappear or be re-leased after a very long/stalled
            # render.  Only the current lease may finalize them.
            owned = db.query(WebArtifactInvalidation.id).filter(
                WebArtifactInvalidation.id.in_(batch.ids),
                WebArtifactInvalidation.lock_token == batch.lock_token,
            ).count()
            if owned != len(batch.ids):
                db.rollback()
                return
            rebuilt = rebuild_published_page_artifacts(
                db,
                dependency_keys=set(batch.dependency_keys),
                artifact_generation=batch.generation,
                prepare_commit=lambda: _prepare_batch_commit(db, batch),
            )
            deleted = db.query(WebArtifactInvalidation).filter(
                WebArtifactInvalidation.id.in_(batch.ids),
                WebArtifactInvalidation.lock_token == batch.lock_token,
            ).delete(synchronize_session=False)
            if deleted != len(batch.ids):
                db.rollback()
                return
            db.commit()
        logger.info(
            "Public artifact invalidations processed: jobs=%s keys=%s pages=%s generation=%s",
            len(batch.ids), len(batch.dependency_keys), rebuilt, batch.generation,
        )
    except Exception as exc:  # noqa: BLE001 - durable queue records and retries every failure
        logger.exception("Public artifact invalidation batch failed")
        _retry_batch(batch, exc)


def process_artifact_invalidation_batch() -> bool:
    """Process one available batch; return whether work was claimed.

    Exposed as a small deterministic seam for tests and administrative tooling.
    Failures are persisted for retry and deliberately do not remove the last
    complete public artifacts.
    """
    batch = _claim_batch()
    if batch is None:
        return False
    _process_claimed_batch(batch)
    return True


class _ArtifactDispatcher:
    def __init__(self, *, join_timeout: float = 20) -> None:
        self._stop = threading.Event()
        self._wake = threading.Event()
        self._active_lock = threading.Lock()
        self._active_batch: _ClaimedBatch | None = None
        self._join_timeout = join_timeout
        self._thread = threading.Thread(
            target=self._run,
            name="scoutcomp-artifact-dispatcher",
            daemon=True,
        )

    def start(self) -> None:
        self._thread.start()

    def wake(self) -> None:
        self._wake.set()

    def stop(self) -> None:
        self._stop.set()
        self._wake.set()
        self._thread.join(timeout=self._join_timeout)
        if self._thread.is_alive():
            with self._active_lock:
                active_batch = self._active_batch
            released = _release_batch_lease(active_batch) if active_batch is not None else 0
            logger.warning(
                "Public artifact dispatcher is still rendering; released %s owned jobs",
                released,
            )

    def _run(self) -> None:
        while not self._stop.is_set():
            try:
                batch = _claim_batch()
                if batch is not None:
                    if self._stop.is_set():
                        _release_batch_lease(batch)
                        break
                    with self._active_lock:
                        self._active_batch = batch
                    try:
                        _process_claimed_batch(batch)
                    finally:
                        with self._active_lock:
                            if self._active_batch == batch:
                                self._active_batch = None
                    continue
            except Exception:  # pragma: no cover - final protection for the daemon
                logger.exception("Public artifact dispatcher cycle failed")
            self._wake.wait(timeout=_POLL_SECONDS)
            self._wake.clear()


_dispatcher: _ArtifactDispatcher | None = None
_dispatcher_lock = threading.Lock()


def start_artifact_dispatcher() -> _ArtifactDispatcher:
    global _dispatcher
    with _dispatcher_lock:
        if _dispatcher is None:
            _dispatcher = _ArtifactDispatcher()
            _dispatcher.start()
        return _dispatcher


def stop_artifact_dispatcher(dispatcher: _ArtifactDispatcher | None) -> None:
    global _dispatcher
    if dispatcher is None:
        return
    with _dispatcher_lock:
        if _dispatcher is dispatcher:
            _dispatcher = None
    dispatcher.stop()


def wake_artifact_dispatcher() -> None:
    with _dispatcher_lock:
        dispatcher = _dispatcher
    if dispatcher is not None:
        dispatcher.wake()
