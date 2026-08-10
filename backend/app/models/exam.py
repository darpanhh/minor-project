import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Integer, Enum, DateTime, Float, ForeignKey, Text, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class SessionStatus(str, enum.Enum):
    registered = "registered"
    in_progress = "in_progress"
    submitted = "submitted"
    flagged = "flagged"


class ResultStatus(str, enum.Enum):
    pending = "pending"
    reviewed = "reviewed"


class Exam(Base):
    __tablename__ = "exams"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    duration_min: Mapped[int] = mapped_column(Integer, nullable=False)
    questions: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    creator = relationship("User", back_populates="exams_created")
    sessions = relationship("ExamSession", back_populates="exam")


class ExamSession(Base):
    __tablename__ = "exam_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    exam_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False
    )
    student_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    status: Mapped[SessionStatus] = mapped_column(
        Enum(SessionStatus), default=SessionStatus.registered, nullable=False
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    score: Mapped[float | None] = mapped_column(Float, nullable=True)
    answers: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    result_status: Mapped[ResultStatus] = mapped_column(
        Enum(ResultStatus), default=ResultStatus.pending, nullable=False
    )
    final_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    exam = relationship("Exam", back_populates="sessions")
    student = relationship("User", back_populates="exam_sessions")
    proctoring_events = relationship("ProctoringEvent", back_populates="session")
    alerts = relationship("Alert", back_populates="session")
    cheating_logs = relationship("CheatingLog", back_populates="session")
    calibration = relationship("Calibration", back_populates="exam_session", uselist=False)
