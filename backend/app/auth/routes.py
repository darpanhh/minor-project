import os
import uuid
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.orm import Session
from app.core.config import settings
from app.core.database import get_db
from app.auth.jwt_handler import create_access_token, create_refresh_token, verify_token
from app.auth.dependencies import get_current_user
from app.models.user import User, UserRole
from app.schemas.user_schema import UserRegister, UserLogin, UserOut, UserRegisterResponse
import bcrypt

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=UserRegisterResponse, status_code=status.HTTP_201_CREATED)
def register(
    full_name: str = Form(...),
    email: str = Form(...),
    password: str = Form(...),
    student_id: str = Form(None),
    photo: UploadFile | None = File(None),
    db: Session = Depends(get_db),
):
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email already registered")

    photo_path = None
    if photo:
        ext = os.path.splitext(photo.filename or "face.jpg")[1] or ".jpg"
        filename = f"face_{uuid.uuid4().hex}{ext}"
        photo_path = os.path.join(settings.UPLOAD_DIR, "photos", filename).replace(chr(92), "/")
        os.makedirs(os.path.dirname(photo_path), exist_ok=True)
        with open(photo_path, "wb") as f:
            f.write(photo.file.read())

    user = User(
        full_name=full_name,
        email=email,
        password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        student_id=student_id,
        registered_photo=photo_path,
        role=UserRole.student,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return UserRegisterResponse(
        id=user.id,
        full_name=user.full_name,
        email=user.email,
        student_id=user.student_id,
    )


@router.post("/login")
def login(payload: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not bcrypt.checkpw(payload.password.encode(), user.password_hash.encode()):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password")

    token_data = {"sub": str(user.id), "role": user.role.value}
    access_token = create_access_token(token_data)
    refresh_token = create_refresh_token(token_data)

    user_out = UserOut.model_validate(user)
    if user.registered_photo:
        user_out.registered_photo = f"http://localhost:8000/{user.registered_photo.replace(chr(92), '/')}"

    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "user": user_out,
    }


@router.post("/token/refresh")
def refresh_token(refresh_token: str, db: Session = Depends(get_db)):
    payload = verify_token(refresh_token)
    if payload is None or payload.get("type") != "refresh":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")

    user = db.query(User).filter(User.id == payload.get("sub")).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    token_data = {"sub": str(user.id), "role": user.role.value}
    return {
        "access_token": create_access_token(token_data),
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserOut)
def me(current_user: User = Depends(get_current_user)):
    user_out = UserOut.model_validate(current_user)
    if current_user.registered_photo:
        user_out.registered_photo = f"http://localhost:8000/{current_user.registered_photo.replace(chr(92), '/')}"
    return user_out
