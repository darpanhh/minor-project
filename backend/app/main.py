from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from app.core.config import settings
from app.core.database import engine, Base
from app.models import *
from app.auth.routes import router as auth_router
from app.api.v1.endpoints.exams import router as exam_router
from app.api.v1.endpoints.sessions import router as session_router
from app.api.v1.endpoints.admin import router as admin_router
from app.api.v1.endpoints.student import router as student_router
from app.proctoring.ws_proctor import router as proctor_ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create all tables from the SQLModel metadata on startup (no Alembic).
    # create_all only creates missing tables; it never alters existing ones.
    Base.create_all(bind=engine)
    yield


app = FastAPI(
    title="Proctored Exam API",
    debug=settings.DEBUG,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

uploads_path = Path(settings.UPLOAD_DIR)
uploads_path.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(uploads_path)), name="uploads")

# Snapshots directory for proctoring violation images
snapshots_path = Path(__file__).resolve().parent.parent / "snapshots"
snapshots_path.mkdir(parents=True, exist_ok=True)
app.mount("/snapshots", StaticFiles(directory=str(snapshots_path)), name="snapshots")

app.include_router(auth_router)
app.include_router(exam_router)
app.include_router(session_router)
app.include_router(admin_router)
app.include_router(student_router)
app.include_router(proctor_ws_router)

@app.get("/")
def root():
    return {"message": "Proctored Exam API"}

@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.exec_driver_sql("SELECT 1")
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}
