"""
Pytest configuration.

Tests run against an ISOLATED PostgreSQL schema ("proctor_test") inside the
same database as development, so shared Postgres types (UUID / JSONB / ARRAY /
enums) work without touching any real data. Environment overrides must happen
BEFORE any app module is imported, hence the module-level setup here.
"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))
sys.path.insert(0, str(Path(__file__).resolve().parent))

# No credentials live in this file. Prefer an explicit TEST_DATABASE_URL;
# otherwise reuse the app's DATABASE_URL from backend/.env (loaded below, with
# an already-set environment taking precedence). The test URL forces an
# isolated schema via the connection's search_path, so tests never touch real
# data.
load_dotenv(BACKEND_DIR / ".env", override=False)

_base_url = os.getenv("TEST_DATABASE_URL") or os.getenv("DATABASE_URL")
if not _base_url:
    raise RuntimeError(
        "TEST_DATABASE_URL or DATABASE_URL must be set (see backend/.env.sample)"
    )
_SEARCH_PATH_OPT = "options=-csearch_path%3Dproctor_test"
if "options=" in _base_url:
    TEST_DATABASE_URL = _base_url
else:
    _sep = "&" if "?" in _base_url else "?"
    TEST_DATABASE_URL = f"{_base_url}{_sep}{_SEARCH_PATH_OPT}"
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ["JWT_SECRET"] = "pytest-secret-key"
os.environ["JWT_ALGORITHM"] = "HS256"
os.environ["JWT_ACCESS_EXPIRE_MINUTES"] = "30"
os.environ["JWT_REFRESH_EXPIRE_DAYS"] = "7"
os.environ["MODEL_PATH"] = "best.pt"
os.environ["DEBUG"] = "true"

import pytest  # noqa: E402
import bcrypt  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402

from app.core.database import Base, SessionLocal, engine  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402

_ALL_TABLES = (
    "users",
    "exams",
    "exam_sessions",
    "proctoring_events",
    "calibrations",
    "cheating_logs",
)


@pytest.fixture(scope="session", autouse=True)
def _reset_schema():
    """Fresh schema for the whole run: drop + recreate all tables."""
    Base.drop_all(bind=engine)
    Base.create_all(bind=engine)
    yield


@pytest.fixture(autouse=True)
def _clean_tables():
    """Wipe all rows before each test so tests are independent."""
    yield
    with engine.begin() as conn:
        conn.exec_driver_sql(
            "TRUNCATE TABLE {tables} RESTART IDENTITY CASCADE".format(
                tables=", ".join(_ALL_TABLES)
            )
        )


@pytest.fixture()
def client():
    from app.main import app

    with TestClient(app) as c:
        yield c


@pytest.fixture()
def admin() -> dict:
    """Create an admin user and return login credentials."""
    db = SessionLocal()
    try:
        user = User(
            full_name="Admin",
            email="admin@test.com",
            password_hash=bcrypt.hashpw(b"adminpass", bcrypt.gensalt()).decode(),
            role=UserRole.admin,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {"email": "admin@test.com", "password": "adminpass", "id": user.id}
    finally:
        db.close()


@pytest.fixture()
def student() -> dict:
    """Create a student user and return login credentials."""
    db = SessionLocal()
    try:
        user = User(
            full_name="Student",
            email="student@test.com",
            password_hash=bcrypt.hashpw(b"studentpass", bcrypt.gensalt()).decode(),
            role=UserRole.student,
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        return {"email": "student@test.com", "password": "studentpass", "id": user.id}
    finally:
        db.close()