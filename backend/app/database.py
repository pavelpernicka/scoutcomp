from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

from .config import settings


def _build_engine() -> create_engine:
    url = settings.database.url
    connect_args = {}
    if settings.database.engine.startswith("sqlite") or url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    return create_engine(url, connect_args=connect_args, future=True)


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
