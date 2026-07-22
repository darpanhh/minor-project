import uuid
import enum
from datetime import datetime
from sqlalchemy import String, Enum, DateTime, Float, func
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class UserRole(str, enum.Enum):
    student = "student"
    admin = "admin"


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(
        Enum(UserRole), default=UserRole.student, nullable=False
    )
    registered_photo: Mapped[str | None] = mapped_column(String(500), nullable=True)
    face_embedding: Mapped[list[float] | None] = mapped_column(
        ARRAY(Float), nullable=True
    )
    student_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    exams_created = relationship("Exam", back_populates="creator")
    exam_sessions = relationship("ExamSession", back_populates="student")
