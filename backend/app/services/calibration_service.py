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

# How strongly each calibration point is nudged away from the exact value the
# student produced while looking at the dot. The stored reference for every zone
# is set *slightly different* from what was actually measured so the proctor has
# a small buffer: e.g. the "top_left" reference gets a bit more "top" and a bit
# more "left". Increase this value to make the offset more pronounced.
CALIBRATION_OFFSET_DEG = 3.0

# Per-zone offset multipliers applied to the head-pose features before the
# calibration profile is persisted. Feature sign conventions (see gaze_service /
# head_pose):
#   yaw   + = toward the student's LEFT,  - = toward the student's RIGHT
#   pitch + = UP (top),                   - = DOWN (bottom)
CALIBRATION_OFFSETS = {
    "top_left":      {"yaw": 1.0, "pitch": 1.0},
    "top_center":    {"yaw": 0.0, "pitch": 1.0},
    "top_right":     {"yaw": -1.0, "pitch": 1.0},
    "middle_left":   {"yaw": 1.0, "pitch": 0.0},
    "center":        {"yaw": 0.0, "pitch": 0.0},
    "middle_right":  {"yaw": -1.0, "pitch": 0.0},
    "bottom_left":   {"yaw": 1.0, "pitch": -1.0},
    "bottom_center": {"yaw": 0.0, "pitch": -1.0},
    "bottom_right":  {"yaw": -1.0, "pitch": -1.0},
}


def apply_point_offset(point_name: str, averaged_features: dict) -> dict:
    """Return a copy of *averaged_features* nudged slightly toward its zone.

    Keeps the raw measured values untouched — the offset is only applied to the
    stored calibration profile so it differs slightly from what was taken.
    """
    adjusted = dict(averaged_features)
    offsets = CALIBRATION_OFFSETS.get(point_name, {})
    yaw = adjusted.get("yaw")
    pitch = adjusted.get("pitch")
    if yaw is not None:
        adjusted["yaw"] = yaw + offsets.get("yaw", 0.0) * CALIBRATION_OFFSET_DEG
    if pitch is not None:
        adjusted["pitch"] = pitch + offsets.get("pitch", 0.0) * CALIBRATION_OFFSET_DEG
    return adjusted


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
            profile[point_name] = apply_point_offset(point_name, averaged_features)
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
