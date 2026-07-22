import uuid
from datetime import datetime
from pydantic import BaseModel


class ProctoringEventOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    event_type: str
    confidence: float
    timestamp: datetime
    snapshot_path: str | None

    model_config = {"from_attributes": True}


class AlertOut(BaseModel):
    id: uuid.UUID
    session_id: uuid.UUID
    suspicion_score: float
    severity: str
    reviewed: bool
    created_at: datetime

    model_config = {"from_attributes": True}
