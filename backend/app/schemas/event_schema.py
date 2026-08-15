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
