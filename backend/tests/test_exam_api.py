"""End-to-end exam lifecycle: admin creates exam, student registers/attends/submits."""

from datetime import datetime, timedelta, timezone


def _new_client():
    from fastapi.testclient import TestClient
    from app.main import app

    return TestClient(app)


def _login(client, email, password):
    r = client.post("/api/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return r


def _create_exam(client, title="Intro to CS"):
    future = datetime.now(timezone.utc) + timedelta(minutes=5)
    payload = {
        "title": title,
        "start_time": future.isoformat(),
        "duration_min": 60,
        "questions": [
            {"question": "1+1?", "options": ["1", "2", "3"], "correct_answer": 1},
            {"question": "2+2?", "options": ["3", "4", "5"], "correct_answer": 1},
        ],
    }
    r = client.post("/api/exams", json=payload)
    assert r.status_code == 201, r.text
    return r.json()


def test_student_cannot_create_exam(student):
    client = _new_client()
    _login(client, "student@test.com", "studentpass")
    r = client.post("/api/exams", json={"title": "x", "start_time": "2026-01-01T00:00:00Z",
                                        "duration_min": 10, "questions": []})
    assert r.status_code == 403


def test_admin_can_create_and_list_exam(admin):
    client = _new_client()
    _login(client, "admin@test.com", "adminpass")
    exam = _create_exam(client, title="Algorithms")
    assert exam["title"] == "Algorithms"
    assert len(exam["questions"]) == 2

    listed = client.get("/api/exams")
    assert listed.status_code == 200
    assert any(e["id"] == exam["id"] for e in listed.json())


def test_student_registers_starts_and_submits(admin, student):
    admin = _new_client()
    _login(admin, "admin@test.com", "adminpass")
    exam = _create_exam(admin, title="Calculus")
    admin_cookie = admin.cookies.get("access_token")
    assert admin_cookie

    # The exam starts a few minutes in the future — need it started to submit.
    # Move start_time into the past via direct DB update, then register + start.
    from app.core.database import SessionLocal
    from app.models.exam import Exam

    db = SessionLocal()
    try:
        rec = db.get(Exam, exam["id"])
        rec.start_time = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()

    student = _new_client()
    _login(student, "student@test.com", "studentpass")
    reg = student.post(f"/api/exams/{exam['id']}/register")
    assert reg.status_code == 200, reg.text
    session_id = reg.json()["id"]

    start = student.post(f"/api/sessions/{session_id}/start")
    assert start.status_code == 200, start.text
    assert start.json()["status"] == "in_progress"

    submit = student.post(
        f"/api/sessions/{session_id}/submit",
        json={"answers": {"0": 1, "1": 1}},
    )
    assert submit.status_code == 200, submit.text
    assert submit.json()["status"] == "submitted"

    # Score lives on the row (not in the response schema) — verify via DB.
    from sqlmodel import select
    from app.models.exam import ExamSession
    from app.core.database import SessionLocal

    db = SessionLocal()
    try:
        row = db.exec(select(ExamSession).where(ExamSession.id == session_id)).one()
        assert row.status == "submitted"
        assert row.score == 100.0  # both answers correct
    finally:
        db.close()

    # Admin can grade the submitted session.
    admin_client = _new_client()
    _login(admin_client, "admin@test.com", "adminpass")
    graded = admin_client.post(
        f"/api/admin/sessions/{session_id}/grade",
        json={"final_score": 95.0, "notes": "well done"},
    )
    assert graded.status_code == 200, graded.text
    assert graded.json()["result_status"] == "reviewed"


def test_student_session_ownership_enforced(admin, student):
    admin = _new_client()
    _login(admin, "admin@test.com", "adminpass")
    exam = _create_exam(admin, title="Ownership")
    from app.core.database import SessionLocal
    from app.models.exam import Exam

    db = SessionLocal()
    try:
        rec = db.get(Exam, exam["id"])
        rec.start_time = datetime.now(timezone.utc) - timedelta(minutes=1)
        db.commit()
    finally:
        db.close()

    # A second student (created via register endpoint) must not touch the first.
    other = _new_client()
    other.post("/api/auth/register", data={
        "full_name": "Other", "email": "other@test.com", "password": "pw12345",
    })
    _login(other, "other@test.com", "pw12345")

    student = _new_client()
    _login(student, "student@test.com", "studentpass")
    reg = student.post(f"/api/exams/{exam['id']}/register")
    session_id = reg.json()["id"]

    r = other.post(f"/api/sessions/{session_id}/start")
    assert r.status_code == 403