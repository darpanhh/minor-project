import base64
import os
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.core.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.exam import Exam, ExamSession, SessionStatus, ResultStatus
from app.models.event import ProctoringEvent, EventType
from app.schemas.exam_schema import ExamSessionOut
import cv2
import numpy as np
from pydantic import BaseModel

router = APIRouter(prefix="/api/sessions", tags=["sessions"])

SNAPSHOT_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))),
    "snapshots",
)
os.makedirs(SNAPSHOT_DIR, exist_ok=True)


def _decode_frame(data_url_or_b64: str) -> np.ndarray | None:
    """Decode a base64 (or data-URL) string to an OpenCV BGR image."""
    try:
        if "," in data_url_or_b64:
            data_url_or_b64 = data_url_or_b64.split(",", 1)[1]
        img_bytes = base64.b64decode(data_url_or_b64)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _save_snapshot(session_id: uuid.UUID, frame: np.ndarray, reason: str) -> str | None:
    """Write a JPEG snapshot and return the public URL, or None on failure."""
    try:
        fname = (
            f"{session_id}_{reason}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
        )
        if not cv2.imwrite(os.path.join(SNAPSHOT_DIR, fname), frame):
            return None
        return f"/snapshots/{fname}"
    except Exception:
        return None


class SessionSubmit(BaseModel):
    answers: dict[str, int]


class ProctoringEventCreate(BaseModel):
    event_type: str
    confidence: float = 0.0
    snapshot: str | None = None
    # Client-side event metadata (tab switches): exact hidden-at timestamp,
    # occurrence number, seconds away, and action taken.
    timestamp: datetime | None = None
    occurrence: int | None = None
    duration: float | None = None
    action: str | None = None


class ProctoringEventOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    event_type: str
    confidence: float
    timestamp: datetime
    snapshot_path: str | None = None
    occurrence: int | None = None
    duration: float | None = None
    action: str | None = None

    model_config = {"from_attributes": True}


@router.post("/{session_id}/start", response_model=ExamSessionOut)
def start_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.student_id != student.id:
        raise HTTPException(status_code=403, detail="Not your session")
    if session.status != SessionStatus.registered:
        raise HTTPException(status_code=400, detail=f"Session already {session.status.value}")

    exam = db.query(Exam).filter(Exam.id == session.exam_id).first()
    now = datetime.now(timezone.utc)
    if now < exam.start_time:
        raise HTTPException(status_code=400, detail="Exam has not started yet")

    session.status = SessionStatus.in_progress
    session.started_at = now
    db.commit()
    db.refresh(session)
    return session


@router.post("/{session_id}/submit", response_model=ExamSessionOut)
def submit_session(
    session_id: uuid.UUID,
    payload: SessionSubmit,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.student_id != student.id:
        raise HTTPException(status_code=403, detail="Not your session")
    if session.status != SessionStatus.in_progress:
        raise HTTPException(status_code=400, detail="Session is not in progress")

    exam = db.query(Exam).filter(Exam.id == session.exam_id).first()
    correct = 0
    total = len(exam.questions)
    for i, q in enumerate(exam.questions):
        key = str(i)
        if key in payload.answers and payload.answers[key] == q.get("correct_answer"):
            correct += 1

    session.answers = payload.answers
    session.score = (correct / total * 100) if total > 0 else 0
    session.status = SessionStatus.submitted
    session.submitted_at = datetime.now(timezone.utc)
    session.result_status = ResultStatus.pending
    session.final_score = None
    db.commit()

    db.refresh(session)
    return session


@router.get("/{session_id}", response_model=ExamSessionOut)
def get_session(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.role != UserRole.admin and session.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    return session


@router.post("/{session_id}/events", response_model=ProctoringEventOut, status_code=201)
def log_proctoring_event(
    session_id: uuid.UUID,
    payload: ProctoringEventCreate,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.student_id != student.id:
        raise HTTPException(status_code=403, detail="Not your session")

    try:
        etype = EventType(payload.event_type)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid event type: {payload.event_type}")

    snapshot_path = None
    # tab_switch and fullscreen_exit are client-side events and intentionally
    # get NO snapshot.
    if payload.snapshot and etype not in (EventType.tab_switch, EventType.fullscreen_exit):
        frame = _decode_frame(payload.snapshot)
        if frame is not None:
            snapshot_path = _save_snapshot(session_id, frame, etype.value)

    event = ProctoringEvent(
        session_id=session_id,
        event_type=etype,
        confidence=payload.confidence,
        snapshot_path=snapshot_path,
        # For client-side events the client supplies the exact timestamp of
        # the occurrence (e.g. when the tab was hidden) plus metadata.
        timestamp=payload.timestamp or datetime.now(timezone.utc),
        occurrence=payload.occurrence,
        duration=payload.duration,
        action=payload.action,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    return event


@router.get("/{session_id}/events", response_model=list[ProctoringEventOut])
def list_session_events(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_role(UserRole.admin)),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    events = db.query(ProctoringEvent).filter(
        ProctoringEvent.session_id == session_id
    ).order_by(ProctoringEvent.timestamp.desc()).all()
    return events
