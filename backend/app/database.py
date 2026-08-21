from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import settings


def _build_engine() -> create_engine:
    url = settings.database.url
    connect_args = {}
    sqlite = settings.database.engine.startswith("sqlite") or url.startswith("sqlite")
    if sqlite:
        # Let short write bursts wait instead of immediately surfacing
        # "database is locked" while the public process continues serving
        # concurrent reads from WAL.
        connect_args = {"check_same_thread": False, "timeout": 30}
    engine = create_engine(url, connect_args=connect_args, pool_pre_ping=True, future=True)
    if sqlite:
        @event.listens_for(engine, "connect")
        def _configure_sqlite(dbapi_connection, _connection_record):
            cursor = dbapi_connection.cursor()
            try:
                cursor.execute("PRAGMA foreign_keys=ON")
                cursor.execute("PRAGMA busy_timeout=30000")
                cursor.execute("PRAGMA journal_mode=WAL")
                cursor.execute("PRAGMA synchronous=NORMAL")
            finally:
                cursor.close()
    return engine


def _build_session_factory(engine):
    return sessionmaker(autocommit=False, autoflush=False, bind=engine, future=True)


def get_engine():
    global engine
    try:
        return engine
    except NameError:
        engine = _build_engine()
        return engine


def get_session_factory():
    global SessionLocal
    try:
        return SessionLocal
    except NameError:
        SessionLocal = _build_session_factory(get_engine())
        return SessionLocal


engine = get_engine()
SessionLocal = get_session_factory()
Base = declarative_base()
