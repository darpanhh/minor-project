from fastapi import FastAPI
from sqlalchemy import text
from app.core.config import settings
from app.core.database import engine, Base

app = FastAPI(
    title="Proctored Exam API",
    debug=settings.DEBUG
)

@app.get("/")
def root():
    return {"message": "Proctored Exam API"}

@app.get("/health")
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ok", "database": "connected"}
    except Exception as e:
        return {"status": "error", "database": str(e)}
