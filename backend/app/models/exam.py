import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, Enum, DateTime, Float, ForeignKey, Text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlmodel import SQLModel, Field, Relationship


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class SessionStatus(str, enum.Enum):
    registered = "registered"
    in_progress = "in_progress"
    submitted = "submitted"
    flagged = "flagged"


class ResultStatus(str, enum.Enum):
    pending = "pending"
    reviewed = "reviewed"


class Exam(SQLModel, table=True):
    __tablename__ = "exams"

    title: str = Field(sa_column=Column(String(255), nullable=False))
    created_by: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    )
    start_time: datetime = Field(sa_column=Column(DateTime(timezone=True), nullable=False))
    duration_min: int = Field(sa_column=Column(Integer, nullable=False))
    questions: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, default=dict),
    )
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )

    creator: "User" = Relationship(back_populates="exams_created")
    sessions: list["ExamSession"] = Relationship(back_populates="exam")


class ExamSession(SQLModel, table=True):
    __tablename__ = "exam_sessions"

    exam_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), ForeignKey("exams.id"), nullable=False)
    )
    student_id: uuid.UUID = Field(
        sa_column=Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    )
    started_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    submitted_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    score: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    answers: dict = Field(
        default_factory=dict,
        sa_column=Column(JSONB, nullable=False, default=dict),
    )
    result_status: ResultStatus = Field(
        default=ResultStatus.pending,
        sa_column=Column(Enum(ResultStatus), default=ResultStatus.pending, nullable=False),
    )
    final_score: float | None = Field(default=None, sa_column=Column(Float, nullable=True))
    admin_notes: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    reviewed_at: datetime | None = Field(default=None, sa_column=Column(DateTime(timezone=True), nullable=True))
    status: SessionStatus = Field(
        default=SessionStatus.registered,
        sa_column=Column(Enum(SessionStatus), default=SessionStatus.registered, nullable=False),
    )
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )

    exam: "Exam" = Relationship(back_populates="sessions")
    student: "User" = Relationship(back_populates="exam_sessions")
    proctoring_events: list["ProctoringEvent"] = Relationship(back_populates="session")
    cheating_logs: list["CheatingLog"] = Relationship(back_populates="session")
    calibration: "Calibration" = Relationship(back_populates="exam_session")