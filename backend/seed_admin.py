import bcrypt
from app.core.database import SessionLocal
from app.models.user import User, UserRole


def seed_admin():
    db = SessionLocal()
    existing = db.query(User).filter(User.email == "admin@visionproctor.com").first()
    if existing:
        print("Admin already exists")
        return

    admin = User(
        full_name="Admin",
        email="admin@visionproctor.com",
        password_hash=bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode(),
        role=UserRole.admin,
        student_id=None,
    )
    db.add(admin)
    db.commit()
    print("Admin created: admin@visionproctor.com / admin123")

if __name__ == "__main__":
    seed_admin()
