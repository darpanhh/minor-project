import uuid
from datetime import datetime
from pydantic import BaseModel


class CalibrationOut(BaseModel):
    id: uuid.UUID
    exam_session_id: uuid.UUID
    profile: dict
    completed: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
