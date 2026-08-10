import cv2
import numpy as np

from .landmarks import (
    NOSE_TIP,
    CHIN,
    LEFT_EYE_LEFT,
    LEFT_EYE_RIGHT,
    RIGHT_EYE_LEFT,
    RIGHT_EYE_RIGHT,
    LEFT_MOUTH,
    RIGHT_MOUTH,
    LEFT_FACE,
    RIGHT_FACE,
)

# ── 22-point MediaPipe face model ────────────────────────────────────
#
# Coordinate system (right-handed, matches OpenCV camera convention):
#
#   +X  →  person's LEFT
#   +Y  →  downward
#   +Z  →  away from camera (back of head)
#
# Nose tip at origin (the most forward-facing point).
# All other points have +Z (further from camera than the nose).
#
# 22 landmarks are spread across the full face for robust solvePnP:
#
#   region        count   landmarks
#   ─────────────────────────────────────────────────
#   nose            4      tip(1), bridge(6), sides(48,278)
#   forehead        1      center(8)
#   chin            1      tip(152)
#   left eye        2      inner(362), outer(263)     ← person's LEFT
#   right eye       2      inner(33),  outer(133)     ← person's RIGHT
#   left brow       2      inner(283), outer(276)
#   right brow      2      inner(53),  outer(46)
#   mouth           4      left(61), right(291), top(0), bottom(17)
#   cheeks          2      left(425), right(205)
#   temples         2      left(454), right(234)
#                   ──
#                   22
#
# MediaPipe left/right convention:
#   Landmark 33 (image-left) = person's RIGHT eye → -X in model
#   Landmark 263 (image-right) = person's LEFT eye → +X in model
#   Same mapping applies to all bilateral landmarks.

_LANDMARK_IDS = [
    NOSE_TIP,           # 0   nose tip
    # nose bridge / central
    6,                  # 1   nose bridge (between eyes)
    8,                  # 2   forehead center
    CHIN,               # 3   chin
    # person's RIGHT eye (image-left)
    LEFT_EYE_LEFT,      # 4   inner corner (33)
    LEFT_EYE_RIGHT,     # 5   outer corner (133)
    # person's LEFT eye (image-right)
    RIGHT_EYE_LEFT,     # 6   inner corner (362)
    RIGHT_EYE_RIGHT,    # 7   outer corner (263)
    # mouth
    LEFT_MOUTH,         # 8   person's RIGHT mouth (61)
    RIGHT_MOUTH,        # 9   person's LEFT mouth (291)
    0,                  # 10  upper lip centre
    17,                 # 11  lower lip centre
    # temples
    LEFT_FACE,          # 12  person's RIGHT temple (234)
    RIGHT_FACE,         # 13  person's LEFT temple (454)
    # cheeks
    205,                # 14  person's RIGHT cheek
    425,                # 15  person's LEFT cheek
    # person's RIGHT eyebrow (image-left)
    46,                 # 16  outer
    53,                 # 17  inner
    # person's LEFT eyebrow (image-right)
    276,                # 18  outer
    283,                # 19  inner
    # nose sides
    48,                 # 20  person's RIGHT nose side
    278,                # 21  person's LEFT nose side
]

_MODEL_POINTS_3D = np.array([
    (0.0,   0.0,   0.0),    # 0   nose tip
    (0.0, -70.0,  30.0),    # 1   nose bridge
    (0.0, -120.0, 45.0),    # 2   forehead
    (0.0, 130.0,  40.0),    # 3   chin
    (-65.0, -55.0, 60.0),   # 4   RIGHT eye inner
    (-90.0, -55.0, 70.0),   # 5   RIGHT eye outer
    (65.0, -55.0,  60.0),   # 6   LEFT  eye inner
    (90.0, -55.0,  70.0),   # 7   LEFT  eye outer
    (-65.0,  40.0, 75.0),   # 8   RIGHT mouth
    (65.0,  40.0,  75.0),   # 9   LEFT  mouth
    (0.0,  20.0,  60.0),    # 10  upper lip
    (0.0,  55.0,  65.0),    # 11  lower lip
    (-140.0, -30.0, 90.0),  # 12  RIGHT temple
    (140.0, -30.0, 90.0),   # 13  LEFT  temple
    (-115.0,  40.0, 85.0),  # 14  RIGHT cheek
    (115.0,  40.0, 85.0),   # 15  LEFT  cheek
    (-105.0,-100.0, 75.0),  # 16  RIGHT eyebrow outer
    (-75.0, -90.0, 60.0),   # 17  RIGHT eyebrow inner
    (105.0,-100.0, 75.0),   # 18  LEFT  eyebrow outer
    (75.0, -90.0, 60.0),    # 19  LEFT  eyebrow inner
    (-40.0, -20.0, 40.0),   # 20  RIGHT nose side
    (40.0, -20.0, 40.0),    # 21  LEFT  nose side
], dtype=np.float64)

_LANDMARK_COLORS = [
    (0,   0,   255),   # 0   nose tip — red
    (0,   100, 255),   # 1   nose bridge — orange
    (255, 0,   200),   # 2   forehead — pink
    (255, 0,   100),   # 3   chin — purple
    (0,   255, 0),     # 4   RIGHT eye inner — green
    (0,   200, 0),     # 5   RIGHT eye outer — dark green
    (0,   255, 255),   # 6   LEFT  eye inner — yellow
    (0,   200, 200),   # 7   LEFT  eye outer — dark yellow
    (255, 0,   0),     # 8   RIGHT mouth — blue
    (200, 0,   0),     # 9   LEFT  mouth — dark blue
    (255, 128, 0),     # 10  upper lip — teal
    (128, 128, 0),     # 11  lower lip — olive
    (0,   128, 255),   # 12  RIGHT temple — light blue
    (0,   64,  200),   # 13  LEFT  temple — medium blue
    (255, 128, 128),   # 14  RIGHT cheek — salmon
    (200, 100, 100),   # 15  LEFT  cheek — brown
    (255, 255, 0),     # 16  RIGHT eyebrow outer — cyan
    (200, 200, 0),     # 17  RIGHT eyebrow inner — dark cyan
    (255, 255, 128),   # 18  LEFT  eyebrow outer — light cyan
    (200, 200, 100),   # 19  LEFT  eyebrow inner — grey-cyan
    (100, 0,   255),   # 20  RIGHT nose side — violet
    (80,  0,   200),   # 21  LEFT  nose side — dark violet
]

_AXIS_LENGTH = 80

_VALID_YAW_RANGE = 90
_VALID_PITCH_RANGE = 90
_VALID_ROLL_RANGE = 90


class HeadPoseEstimator:

    def __init__(self):
        self._rvec = None
        self._tvec = None
        self._camera_matrix = None
        self._image_points = None
        self._landmarks_mp = None

    def estimate(self, landmarks, frame):
        h, w = frame.shape[:2]

        image_points = np.array([
            [landmarks[i].x * w, landmarks[i].y * h]
            for i in _LANDMARK_IDS
        ], dtype=np.float64)

        focal_length = max(w, h)
        center = (w / 2, h / 2)
        camera_matrix = np.array([
            [focal_length, 0, center[0]],
            [0, focal_length, center[1]],
            [0, 0, 1],
        ], dtype=np.float64)

        dist_coeffs = np.zeros((4, 1))

        # Two-stage solve: EPNP for robust initialisation, then
        # ITERATIVE for refinement (more accurate with many points).
        success, rvec, tvec = cv2.solvePnP(
            _MODEL_POINTS_3D,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_EPNP,
        )

        if success:
            success, rvec, tvec = cv2.solvePnP(
                _MODEL_POINTS_3D,
                image_points,
                camera_matrix,
                dist_coeffs,
                rvec=rvec,
                tvec=tvec,
                useExtrinsicGuess=True,
                flags=cv2.SOLVEPNP_ITERATIVE,
            )

        if not success:
            return None

        if tvec[2, 0] <= 0:
            return None

        rmat, _ = cv2.Rodrigues(rvec)

        sy = np.sqrt(rmat[0, 0] ** 2 + rmat[1, 0] ** 2)
        singular = sy < 1e-6

        if not singular:
            x = np.arctan2(rmat[2, 1], rmat[2, 2])
            y = np.arctan2(-rmat[2, 0], sy)
            z = np.arctan2(rmat[1, 0], rmat[0, 0])
        else:
            x = np.arctan2(-rmat[1, 2], rmat[1, 1])
            y = np.arctan2(-rmat[2, 0], sy)
            z = 0.0

        yaw = float(np.degrees(y))
        pitch = float(np.degrees(x))
        roll = float(np.degrees(z))

        if abs(yaw) > _VALID_YAW_RANGE:
            return None
        if abs(pitch) > _VALID_PITCH_RANGE:
            return None
        if abs(roll) > _VALID_ROLL_RANGE:
            return None

        self._rvec = rvec
        self._tvec = tvec
        self._camera_matrix = camera_matrix
        self._image_points = image_points
        self._landmarks_mp = landmarks
        self._last_yaw = yaw
        self._last_pitch = pitch
        self._last_roll = roll

        return {
            "yaw": yaw,
            "pitch": pitch,
            "roll": roll,
        }

    def draw_pose(self, frame):
        if self._rvec is None:
            return frame

        h, w = frame.shape[:2]
        dist_coeffs = np.zeros((4, 1))

        # ── 1. All solvePnP landmarks (coloured circles) ───────────
        for pt, color in zip(self._image_points, _LANDMARK_COLORS):
            pt_int = (int(pt[0]), int(pt[1]))
            cv2.circle(frame, pt_int, 3, color, -1)
            cv2.circle(frame, pt_int, 5, color, 1)

        # ── 2. Face centre (mean of 3D model projected to 2D) ──────
        centre_3d = np.mean(_MODEL_POINTS_3D, axis=0, keepdims=True)
        centre_2d, _ = cv2.projectPoints(
            centre_3d, self._rvec, self._tvec, self._camera_matrix,
            dist_coeffs,
        )
        face_cx = tuple(centre_2d[0].ravel().astype(int))
        cv2.circle(frame, face_cx, 5, (255, 255, 255), -1)

        # ── 3. Coordinate axes projected from face centre ──────────
        axis_3d = np.float32([
            [_AXIS_LENGTH,   0,            0],
            [0,              _AXIS_LENGTH, 0],
            [0,              0,            _AXIS_LENGTH],
        ]).reshape(-1, 3)

        img_pts, _ = cv2.projectPoints(
            axis_3d, self._rvec, self._tvec, self._camera_matrix,
            dist_coeffs,
        )
        axis_ends = [tuple(pt.ravel().astype(int)) for pt in img_pts]

        for i, (color, label) in enumerate([
            ((0, 0, 255), "X"),
            ((0, 255, 0), "Y"),
            ((255, 0, 0), "Z"),
        ]):
            cv2.line(frame, face_cx, axis_ends[i], color, 3)
            cv2.putText(frame, label, axis_ends[i],
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, color, 2)

        # ── 4. Nose direction (yellow, 3× axis length) ─────────────
        nose_dir_3d = np.array([[0, 0, _AXIS_LENGTH * 3]], dtype=np.float64)
        nose_dir_2d, _ = cv2.projectPoints(
            nose_dir_3d, self._rvec, self._tvec, self._camera_matrix,
            dist_coeffs,
        )
        nose_tip = tuple(self._image_points[0].astype(int))
        nose_end = tuple(nose_dir_2d[0].ravel().astype(int))
        cv2.line(frame, nose_tip, nose_end, (0, 255, 255), 2)
        cv2.putText(frame, "nose", nose_end,
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

        # ── 5. Euler angle overlay ─────────────────────────────────
        yaw = getattr(self, '_last_yaw', 0.0)
        pitch = getattr(self, '_last_pitch', 0.0)
        roll = getattr(self, '_last_roll', 0.0)

        label = f"Yaw:{yaw:+.0f}  Pitch:{pitch:+.0f}  Roll:{roll:+.0f}"
        cv2.putText(frame, label, (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

        cv2.putText(frame, f"pts={len(_LANDMARK_IDS)}", (10, h - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)

        return frame
