from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel, create_engine, Session

from app.core.config import settings

engine = create_engine(settings.DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(
    bind=engine,
    class_=Session,
    autocommit=False,
    autoflush=False,
)

Base = SQLModel.metadata


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()