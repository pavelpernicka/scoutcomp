import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.migrations import run_migrations
from app.dependencies import get_db
from app.main import app

@pytest.fixture(scope="function")
def db_session():
    # Create a temporary database for each test
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    os.close(db_fd)  # Close the file descriptor, we just need the path

    test_database_url = f"sqlite:///{db_path}"
    test_engine = create_engine(
        test_database_url,
        connect_args={"check_same_thread": False},
        future=True,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine, future=True)

    try:
        Base.metadata.create_all(bind=test_engine)
        run_migrations(test_engine)
        session = TestingSessionLocal()
        try:
            yield session
        finally:
            session.close()
    finally:
        # Clean up the test database
        test_engine.dispose()
        if os.path.exists(db_path):
            os.unlink(db_path)


@pytest.fixture(scope="function")
def client(db_session):
    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()
