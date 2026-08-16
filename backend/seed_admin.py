import os

import bcrypt
from app.core.database import SessionLocal
from app.models.user import User, UserRole

# Bootstrap admin credentials come from the environment, never from the repo.
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@visionproctor.com")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD")


def seed_admin():
    if not ADMIN_PASSWORD:
        print("ADMIN_PASSWORD must be set (e.g. ADMIN_PASSWORD=<strong> python seed_admin.py)")
        return
    db = SessionLocal()
    existing = db.query(User).filter(User.email == ADMIN_EMAIL).first()
    if existing:
        print("Admin already exists")
        return

    admin = User(
        full_name="Admin",
        email=ADMIN_EMAIL,
        password_hash=bcrypt.hashpw(ADMIN_PASSWORD.encode(), bcrypt.gensalt()).decode(),
        role=UserRole.admin,
        student_id=None,
    )
    db.add(admin)
    db.commit()
    print(f"Admin created: {ADMIN_EMAIL}")

if __name__ == "__main__":
    seed_admin()
