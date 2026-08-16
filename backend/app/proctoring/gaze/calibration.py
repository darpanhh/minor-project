from .feature_extractor import FeatureExtractor
from .mediapipe_detector import MediaPipeDetector
from .calibration_store import CalibrationStore, SAMPLES_PER_POINT
from app.services.calibration_service import CalibrationService


class CalibrationProcessor:

    def __init__(self):
        self.detector = MediaPipeDetector()
        self.extractor = FeatureExtractor()
        self.store = CalibrationStore()
        self.service = CalibrationService()

    def process(self, frame, point, frame_number, session_id=None):

        results = self.detector.process(frame)

        if not results.multi_face_landmarks:
            return {
                "success": False,
                "message": "No face detected"
            }

        face = results.multi_face_landmarks[0]

        features = self.extractor.extract(face, frame)
        self.store.add_sample(point, features)

        count = self.store.sample_count(point)
        print(f"Point: {point}")
        print(f"Frame: {frame_number}")
        print(f"Samples: {count}/{SAMPLES_PER_POINT}")
        yaw = features.get("yaw")
        pitch = features.get("pitch")
        roll = features.get("roll")
        if yaw is not None:
            print(f"Yaw: {yaw:.2f}")
        if pitch is not None:
            print(f"Pitch: {pitch:.2f}")
        if roll is not None:
            print(f"Roll: {roll:.2f}")

        if self.store.is_point_complete(point) and session_id:
            avg = self.store.averages[point]
            print(f"[CalibrationDB] Persisting {point} averages for session {session_id}")
            result = self.service.save_point(session_id, point, avg)
            if result is None:
                print("[CalibrationDB] Failed to persist — invalid session")

        print()

        return {
            "success": True,
            "point": point,
            "frame_number": frame_number,
            "features": features,
            "samples_collected": count,
            "point_complete": self.store.is_point_complete(point),
            "landmark_count": len(face.landmark),
        }
