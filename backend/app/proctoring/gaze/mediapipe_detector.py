
import cv2
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
import os


class _CompatFaceLandmarks:
    def __init__(self, landmarks):
        self.landmark = list(landmarks)


class _CompatResult:
    def __init__(self, face_landmarks_list):
        if face_landmarks_list and len(face_landmarks_list) > 0:
            self.multi_face_landmarks = [
                _CompatFaceLandmarks(f) for f in face_landmarks_list
            ]
        else:
            self.multi_face_landmarks = None


class MediaPipeDetector:
    def __init__(self):
        model_path = os.path.join(os.path.dirname(__file__), "face_landmarker.task")
        base_options = python.BaseOptions(model_asset_path=model_path)
        options = vision.FaceLandmarkerOptions(
            base_options=base_options,
            running_mode=vision.RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.3,
            min_face_presence_confidence=0.3,
            min_tracking_confidence=0.3,
        )
        self._detector = vision.FaceLandmarker.create_from_options(options)

    def process(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
        result = self._detector.detect(mp_image)
        return _CompatResult(result.face_landmarks)
