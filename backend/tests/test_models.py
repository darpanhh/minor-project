"""Tests for the SQLModel definitions: table construction + default values."""

import uuid
from datetime import datetime, timezone


def test_sqlmodel_metadata_registers_all_tables():
    from app.core.database import Base

    assert {"users", "exams", "exam_sessions", "proctoring_events",
            "calibrations", "cheating_logs"} <= set(Base.tables)


def test_user_defaults():
    from app.models.user import User, UserRole

    u = User(full_name="A", email="a@b.com", password_hash="x")
    assert isinstance(u.id, uuid.UUID)
    assert u.role == UserRole.student
    assert u.created_at is not None
    assert u.student_id is None
    assert u.registered_photo is None


def test_exam_defaults():
    from app.models.exam import Exam

    e = Exam(title="t", created_by=uuid.uuid4(),
             start_time=datetime.now(timezone.utc), duration_min=30)
    assert isinstance(e.id, uuid.UUID)
    assert e.questions == {}


def test_exam_session_defaults():
    from app.models.exam import ExamSession, SessionStatus, ResultStatus

    s = ExamSession(exam_id=uuid.uuid4(), student_id=uuid.uuid4())
    assert s.status == SessionStatus.registered
    assert s.result_status == ResultStatus.pending
    assert s.answers == {}
    assert s.started_at is None
    assert s.score is None


def test_event_defaults():
    from app.models.event import ProctoringEvent, EventType

    e = ProctoringEvent(session_id=uuid.uuid4(), event_type=EventType.phone_detected)
    assert isinstance(e.id, uuid.UUID)
    assert e.confidence == 0.0
    assert e.timestamp is not None
    assert e.snapshot_path is None
    assert e.occurrence is None


def test_calibration_and_log_defaults():
    from app.models.calibration import Calibration
    from app.models.report import CheatingLog

    c = Calibration(exam_session_id=uuid.uuid4())
    assert c.completed is False
    assert c.profile == {}

    cl = CheatingLog(session_id=uuid.uuid4(), evidence_path="/e.png")
    assert isinstance(cl.id, uuid.UUID)
    assert cl.description is None


def test_roundtrip_persist_and_read():
    """Persist a User via a real session and re-read it from the test DB."""
    import bcrypt
    from app.core.database import SessionLocal
    from app.models.user import User

    db = SessionLocal()
    try:
        password_hash = bcrypt.hashpw(b"pw", bcrypt.gensalt()).decode()
        u = User(full_name="Round", email="round@b.com", password_hash=password_hash)
        db.add(u)
        db.commit()
        db.refresh(u)
        uid = u.id

        loaded = db.get(User, uid)
        assert loaded is not None
        assert loaded.id == uid
        assert loaded.email == "round@b.com"
        assert loaded.role.value == "student"
    finally:
        db.close()