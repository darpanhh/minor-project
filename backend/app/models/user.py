import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import Column, String, Enum, DateTime, Float, func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlmodel import SQLModel, Field, Relationship


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    student = "student"
    admin = "admin"


class User(SQLModel, table=True):
    __tablename__ = "users"

    full_name: str = Field(sa_column=Column(String(255), nullable=False))
    email: str = Field(sa_column=Column(String(255), unique=True, nullable=False, index=True))
    password_hash: str = Field(sa_column=Column(String(255), nullable=False))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    role: UserRole = Field(
        default=UserRole.student,
        sa_column=Column(Enum(UserRole), default=UserRole.student, nullable=False),
    )
    registered_photo: str | None = Field(default=None, sa_column=Column(String(500), nullable=True))
    face_embedding: list[float] | None = Field(
        default=None,
        sa_column=Column(ARRAY(Float), nullable=True),
    )
    student_id: str | None = Field(default=None, sa_column=Column(String(100), nullable=True))
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )

    exams_created: list["Exam"] = Relationship(back_populates="creator")
    exam_sessions: list["ExamSession"] = Relationship(back_populates="student")