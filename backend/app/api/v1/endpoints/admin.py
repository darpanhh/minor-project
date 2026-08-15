import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.database import get_db
from app.auth.dependencies import require_role
from app.models.user import User, UserRole
from app.models.exam import ExamSession, SessionStatus, ResultStatus
from app.models.event import ProctoringEvent
from app.models.exam import Exam
from app.models.report import CheatingLog
from pydantic import BaseModel

router = APIRouter(prefix="/api/admin", tags=["admin"])


class GradeRequest(BaseModel):
    final_score: float
    notes: str | None = None


@router.get("/sessions", response_model=list[dict])
def list_all_sessions(
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    sessions = db.query(ExamSession).order_by(ExamSession.started_at.desc()).limit(50).all()
    result = []
    for s in sessions:
        student = db.query(User).filter(User.id == s.student_id).first()
        result.append({
            "id": str(s.id),
            "exam_id": str(s.exam_id),
            "student_id": str(s.student_id),
            "student_name": student.full_name if student else "Unknown",
            "student_email": student.email if student else "",
            "status": s.status.value,
            "score": s.score,
            "final_score": s.final_score,
            "result_status": s.result_status.value if s.result_status else "pending",
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        })
    return result


@router.get("/reports", response_model=list[dict])
def list_reports(
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    sessions = db.query(ExamSession).order_by(ExamSession.started_at.desc()).limit(50).all()
    result = []
    for s in sessions:
        student = db.query(User).filter(User.id == s.student_id).first()
        exam = db.query(Exam).filter(Exam.id == s.exam_id).first()
        event_count = db.query(ProctoringEvent).filter(ProctoringEvent.session_id == s.id).count()
        result.append({
            "session_id": str(s.id),
            "exam_id": str(s.exam_id),
            "exam_title": exam.title if exam else "Unknown",
            "student_name": student.full_name if student else "Unknown",
            "student_email": student.email if student else "",
            "status": s.status.value if s.status else "unknown",
            "score": s.score,
            "final_score": s.final_score,
            "result_status": s.result_status.value if s.result_status else "pending",
            "event_count": event_count,
            "started_at": s.started_at.isoformat() if s.started_at else None,
            "submitted_at": s.submitted_at.isoformat() if s.submitted_at else None,
        })
    return result


@router.get("/sessions/{session_id}")
def get_session_detail(
    session_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    student = db.query(User).filter(User.id == session.student_id).first()
    exam = db.query(Exam).filter(Exam.id == session.exam_id).first()
    events = db.query(ProctoringEvent).filter(
        ProctoringEvent.session_id == session_id
    ).order_by(ProctoringEvent.timestamp.desc()).all()
    cheating_logs = db.query(CheatingLog).filter(
        CheatingLog.session_id == session_id
    ).order_by(CheatingLog.created_at.desc()).all()

    return {
        "session": {
            "id": str(session.id),
            "exam_id": str(session.exam_id),
            "exam_title": exam.title if exam else "Unknown",
            "student_id": str(session.student_id),
            "student_name": student.full_name if student else "Unknown",
            "student_email": student.email if student else "",
            "student_display_id": student.student_id if student else "",
            "status": session.status.value,
            "score": session.score,
            "final_score": session.final_score,
            "result_status": session.result_status.value if session.result_status else "pending",
            "admin_notes": session.admin_notes,
            "reviewed_at": session.reviewed_at.isoformat() if session.reviewed_at else None,
            "started_at": session.started_at.isoformat() if session.started_at else None,
            "submitted_at": session.submitted_at.isoformat() if session.submitted_at else None,
        },
        "answers": session.answers or {},
        "questions": exam.questions if exam else [],
        "events": [{
            "id": str(e.id),
            "event_type": e.event_type.value,
            "confidence": round(e.confidence, 2),
            "timestamp": e.timestamp.isoformat(),
            "snapshot_path": e.snapshot_path,
            "occurrence": e.occurrence,
            "duration": round(e.duration, 1) if e.duration is not None else None,
            "action": e.action,
        } for e in events],
        "cheating_logs": [{
            "id": str(c.id),
            "evidence_path": c.evidence_path,
            "description": c.description,
            "created_at": c.created_at.isoformat(),
        } for c in cheating_logs],
    }


@router.post("/sessions/{session_id}/grade")
def grade_session(
    session_id: uuid.UUID,
    payload: GradeRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role(UserRole.admin)),
):
    """
    Admin releases the final result for a submitted session.

    The student only sees the result (final_score + admin notes + violation
    report) once this endpoint has been called — until then the session's
    result_status remains "pending".
    """
    session = db.query(ExamSession).filter(ExamSession.id == session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.status != SessionStatus.submitted:
        raise HTTPException(
            status_code=400,
            detail="Only submitted sessions can be graded",
        )

    if payload.final_score < 0 or payload.final_score > 100:
        raise HTTPException(
            status_code=400,
            detail="final_score must be between 0 and 100",
        )

    session.final_score = round(payload.final_score, 2)
    session.admin_notes = payload.notes
    session.result_status = ResultStatus.reviewed
    session.reviewed_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(session)

    return {
        "id": str(session.id),
        "final_score": session.final_score,
        "result_status": session.result_status.value,
        "admin_notes": session.admin_notes,
        "reviewed_at": session.reviewed_at.isoformat() if session.reviewed_at else None,
    }
