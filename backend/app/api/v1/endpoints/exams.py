import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.exam import Exam, ExamSession, SessionStatus
from app.models.event import ProctoringEvent, EventType
from app.models.report import CheatingLog
from app.schemas.exam_schema import ExamCreate, ExamOut, ExamSessionOut, ExamSessionDetailOut
from pydantic import BaseModel

router = APIRouter(prefix="/api/exams", tags=["exams"])


class MCQQuestion(BaseModel):
    question: str
    options: list[str]
    correct_answer: int


class ExamCreateMCQ(BaseModel):
    title: str
    start_time: datetime
    duration_min: int
    questions: list[MCQQuestion]


class ExamOutWithSessions(ExamOut):
    sessions: list[ExamSessionDetailOut] = []


class SessionSubmit(BaseModel):
    answers: dict[str, int]


class ProctoringEventCreate(BaseModel):
    event_type: str
    confidence: float = 0.0


@router.post("", response_model=ExamOut, status_code=status.HTTP_201_CREATED)
def create_exam(
    payload: ExamCreateMCQ,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    exam = Exam(
        title=payload.title,
        created_by=admin.id,
        start_time=payload.start_time,
        duration_min=payload.duration_min,
        questions=[q.model_dump() for q in payload.questions],
    )
    db.add(exam)
    db.commit()
    db.refresh(exam)
    return exam


@router.get("", response_model=list[ExamOut])
def list_exams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.role == UserRole.admin:
        exams = db.query(Exam).order_by(Exam.start_time.desc()).all()
    else:
        exams = db.query(Exam).order_by(Exam.start_time.desc()).all()
    return exams


@router.get("/{exam_id}", response_model=ExamOutWithSessions)
def get_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    if current_user.role == UserRole.admin:
        sessions = db.query(ExamSession).filter(ExamSession.exam_id == exam_id).all()
        result = ExamOutWithSessions.model_validate(exam)
        result.sessions = []
        for s in sessions:
            dto = ExamSessionDetailOut.model_validate(s)
            student = db.query(User).filter(User.id == s.student_id).first()
            if student:
                dto.student_name = student.full_name
                dto.student_email = student.email
                dto.student_display_id = student.student_id or ""
            result.sessions.append(dto)
    else:
        sessions = db.query(ExamSession).filter(
            ExamSession.exam_id == exam_id,
            ExamSession.student_id == current_user.id,
        ).all()
        result = ExamOutWithSessions.model_validate(exam)
        result.sessions = [ExamSessionOut.model_validate(s) for s in sessions]
    return result


@router.delete("/{exam_id}")
def delete_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    sessions = db.query(ExamSession).filter(ExamSession.exam_id == exam_id).all()
    for s in sessions:
        db.query(ProctoringEvent).filter(ProctoringEvent.session_id == s.id).delete()
        db.query(CheatingLog).filter(CheatingLog.session_id == s.id).delete()
        db.delete(s)

    db.delete(exam)
    db.commit()
    return {"message": "Exam deleted successfully"}


@router.post("/{exam_id}/register", response_model=ExamSessionOut)
def register_for_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    exam = db.query(Exam).filter(Exam.id == exam_id).first()
    if not exam:
        raise HTTPException(status_code=404, detail="Exam not found")

    existing = db.query(ExamSession).filter(
        ExamSession.exam_id == exam_id,
        ExamSession.student_id == student.id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already registered for this exam")

    session = ExamSession(
        exam_id=exam_id,
        student_id=student.id,
        status=SessionStatus.registered,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/{exam_id}/sessions/me", response_model=ExamSessionOut | None)
def my_session_for_exam(
    exam_id: uuid.UUID,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    session = db.query(ExamSession).filter(
        ExamSession.exam_id == exam_id,
        ExamSession.student_id == student.id,
    ).first()
    return session
