from app.core.database import SessionLocal
from app.models.user import User, UserRole
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

def seed_admin():
    db = SessionLocal()
    existing = db.query(User).filter(User.email == "admin@visionproctor.com").first()
    if existing:
        print("Admin already exists")
        return

    admin = User(
        full_name="Admin",
        email="admin@visionproctor.com",
        password_hash=pwd_context.hash("admin123"),
        role=UserRole.admin,
        student_id=None,
    )
    db.add(admin)
    db.commit()
    print("Admin created: admin@visionproctor.com / admin123")

if __name__ == "__main__":
    seed_admin()
