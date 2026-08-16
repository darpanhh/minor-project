import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Integer, Enum, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import SQLModel, Field, Relationship


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class EventType(str, enum.Enum):
    identity_mismatch = "identity_mismatch"
    gaze_away = "gaze_away"
    head_pose_abnormal = "head_pose_abnormal"
    multiple_faces = "multiple_faces"
    object_detected = "object_detected"
    tab_switch = "tab_switch"
    phone_detected = "phone_detected"
    person_absent = "person_absent"
    fullscreen_exit = "fullscreen_exit"


class ProctoringEvent(SQLModel, table=True):
    __tablename__ = "proctoring_events"

    session_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("exam_sessions.id"),
            nullable=False,
            index=True,
        )
    )
    event_type: EventType = Field(
        sa_column=Column(Enum(EventType), nullable=False, index=True)
    )
    timestamp: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now(), index=True),
    )
    confidence: float = Field(
        default=0.0,
        sa_column=Column(Float, nullable=False, default=0.0),
    )
    snapshot_path: str | None = Field(default=None, sa_column=Column(String(500), nullable=True))

    # Tab-switch metadata (client-side events): which occurrence in the
    # session, how long the student stayed away (seconds), and what the
    # system/student did (e.g. "warning issued", "incident recorded").
    occurrence: int | None = Field(default=None, sa_column=Column(Integer, nullable=True))
    duration: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    action: str | None = Field(default=None, sa_column=Column(String(200), nullable=True))
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )

    session: "ExamSession" = Relationship(back_populates="proctoring_events")