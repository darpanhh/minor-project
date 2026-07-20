import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.dependencies import get_current_user, require_role
from app.models.user import User, UserRole
from app.models.exam import Exam, ExamSession, SessionStatus
from app.schemas.exam_schema import ExamOut, ExamSessionOut

router = APIRouter(prefix="/api/my", tags=["student"])


@router.get("/exams", response_model=list[ExamOut])
def my_available_exams(
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    registered_ids = [
        r.exam_id for r in db.query(ExamSession.exam_id).filter(
            ExamSession.student_id == student.id
        ).all()
    ]
    exams = db.query(Exam).order_by(Exam.start_time.desc()).all()
    return exams


@router.get("/sessions", response_model=list[ExamSessionOut])
def my_sessions(
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    sessions = db.query(ExamSession).filter(
        ExamSession.student_id == student.id
    ).order_by(ExamSession.started_at.desc()).all()
    return sessions


@router.get("/sessions/{session_id}", response_model=ExamSessionOut)
def my_session_detail(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
    session = db.query(ExamSession).filter(
        ExamSession.id == session_id,
        ExamSession.student_id == student.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return session
