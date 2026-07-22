import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.event import ProctoringEvent, Alert, Severity, EventType

EVENT_WEIGHTS = {
    EventType.identity_mismatch: 40,
    EventType.multiple_faces: 25,
    EventType.phone_detected: 25,
    EventType.object_detected: 20,
    EventType.tab_switch: 10,
    EventType.gaze_away: 0,
    EventType.head_pose_abnormal: 0,
    EventType.person_absent: 15,
}

SEVERITY_THRESHOLDS = [
    (85, Severity.high),
    (60, Severity.medium),
    (30, Severity.low),
]


def compute_suspicion_score(db: Session, session_id: str | uuid.UUID) -> float:
    if isinstance(session_id, str):
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            return 0.0
    else:
        session_uuid = session_id

    events = db.query(ProctoringEvent).filter(
        ProctoringEvent.session_id == session_uuid
    ).all()

    if not events:
        return 0.0

    score = 0.0
    tab_count = 0

    for e in events:
        weight = EVENT_WEIGHTS.get(e.event_type, 5)
        contribution = weight * e.confidence
        score += contribution

        if e.event_type == EventType.tab_switch:
            tab_count += 1

    if tab_count > 1:
        score += (tab_count - 1) * 5

    return min(score, 100.0)


def get_severity(score: float) -> Severity:
    for threshold, severity in SEVERITY_THRESHOLDS:
        if score >= threshold:
            return severity
    return Severity.low


def evaluate_and_alert(db: Session, session_id: str | uuid.UUID) -> Alert | None:
    if isinstance(session_id, str):
        try:
            session_uuid = uuid.UUID(session_id)
        except ValueError:
            return None
    else:
        session_uuid = session_id

    score = compute_suspicion_score(db, session_uuid)
    if score < 30:
        return None

    existing = db.query(Alert).filter(
        Alert.session_id == session_uuid,
        Alert.severity == get_severity(score),
    ).order_by(Alert.created_at.desc()).first()

    if existing and (datetime.now(timezone.utc) - existing.created_at).total_seconds() < 60:
        return None

    severity = get_severity(score)
    alert = Alert(
        session_id=session_uuid,
        suspicion_score=score,
        severity=severity,
    )
    db.add(alert)
    db.commit()
    db.refresh(alert)
    return alert

