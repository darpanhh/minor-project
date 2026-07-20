import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.exam import Exam, ExamSession, SessionStatus
from app.models.event import ProctoringEvent, EventType, Alert
from app.schemas.exam_schema import ExamSessionOut
from app.services.suspicion_engine import evaluate_and_alert
from pydantic import BaseModel

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


class SessionSubmit(BaseModel):
    answers: dict[str, int]


class ProctoringEventCreate(BaseModel):
    event_type: str
    confidence: float = 0.0


class ProctoringEventOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    event_type: str
    confidence: float
    timestamp: datetime

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

    session.score = (correct / total * 100) if total > 0 else 0
    session.status = SessionStatus.submitted
    session.submitted_at = datetime.now(timezone.utc)
    db.commit()

    evaluate_and_alert(db, str(session_id))

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

    event = ProctoringEvent(
        session_id=session_id,
        event_type=etype,
        confidence=payload.confidence,
    )
    db.add(event)
    db.commit()
    db.refresh(event)

    evaluate_and_alert(db, str(session_id))

    return event


@router.get("/{session_id}/events", response_model=list[ProctoringEventOut])
def list_session_events(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if current_user.role != UserRole.admin and session.student_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    events = db.query(ProctoringEvent).filter(
        ProctoringEvent.session_id == session_id
    ).order_by(ProctoringEvent.timestamp.desc()).all()
    return events
