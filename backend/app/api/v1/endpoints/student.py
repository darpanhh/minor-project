import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session
from app.core.database import get_db
from app.auth.dependencies import require_role
from app.models.user import User, UserRole
from app.models.exam import Exam, ExamSession, ResultStatus
from app.models.event import ProctoringEvent
from app.models.report import CheatingLog
from app.schemas.exam_schema import ExamOut, ExamSessionOut

router = APIRouter(prefix="/api/my", tags=["student"])


@router.get("/exams", response_model=list[ExamOut])
def my_available_exams(
    db: Session = Depends(get_db),
    student: User = Depends(require_role(UserRole.student)),
):
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


@router.get("/sessions/{session_id}", response_model=dict)
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

    # Evidence is released to the student only together with the administrator's
    # final result. Before then, retain the existing session-only response.
    result = {
        "id": str(session.id),
        "exam_id": str(session.exam_id),
        "student_id": str(session.student_id),
        "status": session.status.value,
        "started_at": session.started_at.isoformat() if session.started_at else None,
        "submitted_at": session.submitted_at.isoformat() if session.submitted_at else None,
        "result_status": session.result_status.value if session.result_status else "pending",
        "final_score": session.final_score,
        "admin_notes": session.admin_notes,
        "events": [],
        "cheating_logs": [],
    }

    if session.result_status != ResultStatus.reviewed or session.final_score is None:
        return result

    from app.models.event import EventType
    events = db.query(ProctoringEvent).filter(
        ProctoringEvent.session_id == session_id
    ).filter(
        (ProctoringEvent.snapshot_path != None) |
        (ProctoringEvent.event_type.in_([EventType.tab_switch, EventType.fullscreen_exit]))
    ).order_by(ProctoringEvent.timestamp.desc()).all()
    cheating_logs = db.query(CheatingLog).filter(
        CheatingLog.session_id == session_id
    ).order_by(CheatingLog.created_at.desc()).all()

    # Deduplicate per-episode events: consecutive events of same type within 15s
    # are grouped to prioritize the record that captured a snapshot.
    EPISODE_GAP = 15.0
    episodes: dict[str, dict] = {}
    result_order: list = []
    from datetime import timezone as _tz
    for ev in sorted(events, key=lambda x: x.timestamp):
        key = ev.event_type.value
        ts = ev.timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=_tz.utc)
        ep = episodes.get(key)
        if ep is None or (ts - ep["last_ts"]).total_seconds() > EPISODE_GAP:
            ep = {"best": ev, "last_ts": ts}
            episodes[key] = ep
            result_order.append(ep)
        else:
            ep["last_ts"] = ts
            if ep["best"].snapshot_path is None and ev.snapshot_path is not None:
                ep["best"] = ev

    kept_events = [ep["best"] for ep in result_order]
    kept_events.sort(key=lambda x: x.timestamp, reverse=True)

    result["events"] = [{
        "id": str(event.id),
        "event_type": event.event_type.value,
        "confidence": round(event.confidence, 2),
        "timestamp": event.timestamp.isoformat(),
        "snapshot_path": event.snapshot_path,
        "occurrence": event.occurrence,
        "duration": round(event.duration, 1) if event.duration is not None else None,
        "action": event.action,
    } for event in kept_events]
    result["cheating_logs"] = [{
        "id": str(log.id),
        "evidence_path": log.evidence_path,
        "description": log.description,
        "created_at": log.created_at.isoformat(),
    } for log in cheating_logs]
    return result
