import uuid
from datetime import datetime
from pydantic import BaseModel


class UserLogin(BaseModel):
    email: str
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    role: str
    student_id: str | None
    registered_photo: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserRegisterResponse(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str
    student_id: str | None
    message: str = "Registration successful. Please upload a face photo."
