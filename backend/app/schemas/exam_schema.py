import uuid
from datetime import datetime
from pydantic import BaseModel
from typing import Any


class ExamOut(BaseModel):
    id: uuid.UUID
    title: str
    created_by: uuid.UUID
    start_time: datetime
    duration_min: int
    questions: Any

    model_config = {"from_attributes": True}


class ExamSessionOut(BaseModel):
    id: uuid.UUID
    exam_id: uuid.UUID
    student_id: uuid.UUID
    status: str
    started_at: datetime | None
    submitted_at: datetime | None
    result_status: str
    final_score: float | None
    admin_notes: str | None = None

    model_config = {"from_attributes": True}


class ExamSessionDetailOut(ExamSessionOut):
    student_name: str = ""
    student_email: str = ""
    student_display_id: str = ""
