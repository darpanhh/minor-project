import uuid
import logging

from app.core.database import SessionLocal
from app.models.calibration import Calibration
from app.models.exam import ExamSession

logger = logging.getLogger(__name__)

CALIBRATION_POINTS = [
    "top_left", "top_center", "top_right",
    "middle_left", "center", "middle_right",
    "bottom_left", "bottom_center", "bottom_right",
]


class CalibrationService:

    def get_or_create(self, exam_session_id: str | uuid.UUID) -> Calibration:
        db = SessionLocal()
        try:
            cal = db.query(Calibration).filter(
                Calibration.exam_session_id == exam_session_id
            ).first()
            if cal:
                return cal

            session_exists = db.query(ExamSession).filter(
                ExamSession.id == exam_session_id
            ).first()
            if not session_exists:
                raise ValueError(f"ExamSession {exam_session_id} not found")

            cal = Calibration(exam_session_id=exam_session_id, profile={})
            db.add(cal)
            db.commit()
            db.refresh(cal)
            logger.info("Created Calibration for session %s", exam_session_id)
            return cal
        finally:
            db.close()

    def save_point(
        self,
        exam_session_id: str | uuid.UUID,
        point_name: str,
        averaged_features: dict,
    ) -> Calibration:
        if point_name not in CALIBRATION_POINTS:
            raise ValueError(f"Invalid calibration point: {point_name}")

        db = SessionLocal()
        try:
            cal = db.query(Calibration).filter(
                Calibration.exam_session_id == exam_session_id
            ).first()
            if not cal:
                session_exists = db.query(ExamSession).filter(
                    ExamSession.id == exam_session_id
                ).first()
                if not session_exists:
                    print(f"[CalibrationService] Session {exam_session_id} not found — skipping persistence")
                    return None
                cal = Calibration(exam_session_id=exam_session_id, profile={})
                db.add(cal)

            profile = dict(cal.profile) if cal.profile else {}
            profile[point_name] = dict(averaged_features)
            cal.profile = profile

            print(f"[CalibrationService] Saved {point_name} to database")
            print(f"[CalibrationService] Current profile keys: {list(profile.keys())}")

            if len(profile) >= len(CALIBRATION_POINTS) and not cal.completed:
                cal.completed = True
                print("[CalibrationService] All 9 points saved — calibration marked complete")

            db.commit()
            db.refresh(cal)
            return cal
        finally:
            db.close()

    def mark_completed(self, exam_session_id: str | uuid.UUID) -> Calibration:
        db = SessionLocal()
        try:
            cal = db.query(Calibration).filter(
                Calibration.exam_session_id == exam_session_id
            ).first()
            if cal:
                cal.completed = True
                db.commit()
                db.refresh(cal)
                logger.info("Calibration marked complete for session %s", exam_session_id)
            return cal
        finally:
            db.close()
