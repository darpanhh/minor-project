import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Any


class ExamCreate(BaseModel):
    title: str
    start_time: datetime
    duration_min: int
    questions: Any


class ExamOut(BaseModel):
    id: uuid.UUID
    title: str
    created_by: uuid.UUID
    start_time: datetime
    duration_min: int
    questions: Any

    model_config = {"from_attributes": True}


class ExamSessionStart(BaseModel):
    session_id: uuid.UUID


class ExamSessionOut(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    student_id: uuid.UUID
    status: str
    started_at: datetime | None
    submitted_at: datetime | None
    score: float | None

    model_config = {"from_attributes": True}


class ExamSessionDetailOut(ExamSessionOut):
    student_name: str = ""
    student_email: str = ""
    student_display_id: str = ""
