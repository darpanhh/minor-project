from .eye_features import EyeFeatureExtractor
from .head_pose import HeadPoseEstimator


class FeatureExtractor:

    def __init__(self):
        self.eye = EyeFeatureExtractor()
        self.head_pose = HeadPoseEstimator()

    def extract(self, face, frame):
        result = self.eye.extract(face)

        head = self.head_pose.estimate(face.landmark, frame)
        if head is not None:
            # Head-pose tracking uses ONLY yaw — pitch and roll are not used
            # for violation detection, but pitch is exposed for the simple
            # Up/Down head direction display.
            result["yaw"] = head["yaw"]
            result["pitch"] = head["pitch"]
            result["roll"] = head["roll"]
        else:
            result["yaw"] = None
            result["pitch"] = None
            result["roll"] = None

        return result