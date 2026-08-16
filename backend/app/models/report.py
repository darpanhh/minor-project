import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, func
from sqlalchemy.dialects.postgresql import UUID
from sqlmodel import SQLModel, Field, Relationship


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class CheatingLog(SQLModel, table=True):
    __tablename__ = "cheating_logs"

    session_id: uuid.UUID = Field(
        sa_column=Column(
            UUID(as_uuid=True),
            ForeignKey("exam_sessions.id"),
            nullable=False,
            index=True,
        )
    )
    evidence_path: str = Field(sa_column=Column(String(500), nullable=False))
    created_at: datetime = Field(
        default_factory=_utcnow,
        sa_column=Column(DateTime(timezone=True), server_default=func.now()),
    )
    description: str | None = Field(default=None, sa_column=Column(Text, nullable=True))
    id: uuid.UUID = Field(
        default_factory=uuid.uuid4,
        sa_column=Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4),
    )

    session: "ExamSession" = Relationship(back_populates="cheating_logs")