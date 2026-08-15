import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Float, Integer, Enum, DateTime, Boolean, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


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


class ProctoringEvent(Base):
    __tablename__ = "proctoring_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exam_sessions.id"), nullable=False, index=True
    )
    event_type: Mapped[EventType] = mapped_column(
        Enum(EventType), nullable=False, index=True
    )
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    snapshot_path: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # Tab-switch metadata (client-side events): which occurrence in the
    # session, how long the student stayed away (seconds), and what the
    # system/student did (e.g. "warning issued", "incident recorded").
    occurrence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration: Mapped[float | None] = mapped_column(Float, nullable=True)
    action: Mapped[str | None] = mapped_column(String(200), nullable=True)

    session = relationship("ExamSession", back_populates="proctoring_events")
