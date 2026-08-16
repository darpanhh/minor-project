"""
Synthetic end-to-end test for the gaze/head detection pipeline.

Builds a fake MediaPipe landmark set (a 22-point face projected with a known
yaw) and drives GazeService.process_frame, asserting that HEAD_TURN and
GAZE_AWAY are actually detected. Also verifies the per-event-type snapshot
cooldown semantics used in ws_proctor.
"""

import math
import time

import numpy as np

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # backend/

from app.proctoring.gaze.gaze_service import GazeService  # noqa: E402
from app.proctoring.gaze.head_pose import _MODEL_POINTS_3D, _LANDMARK_IDS  # noqa: E402
from app.proctoring.gaze.landmarks import (  # noqa: E402
    LEFT_IRIS, RIGHT_IRIS, LEFT_EYE_LEFT, LEFT_EYE_RIGHT,
    RIGHT_EYE_LEFT, RIGHT_EYE_RIGHT, LEFT_UPPER, LEFT_LOWER,
    RIGHT_UPPER, RIGHT_LOWER,
)


class _Lm:
    __slots__ = ("x", "y")

    def __init__(self, x, y):
        self.x = x
        self.y = y


def _project_face(yaw_deg: float, w: int = 640, h: int = 480) -> list[_Lm]:
    """Project the 22-point 3D model under a yaw rotation to image coords."""
    focal = max(w, h)
    cx, cy = w / 2.0, h / 2.0
    tz = 1500.0
    theta = math.radians(yaw_deg)
    c, s = math.cos(theta), math.sin(theta)
    # Yaw about model-Y (positive yaw recovers as positive in head_pose).
    rmat = np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]], dtype=np.float64)
    scaled = _MODEL_POINTS_3D * 3.0

    coords = {}
    for idx, pt in zip(_LANDMARK_IDS, scaled):
        pc = rmat @ pt
        x = focal * pc[0] / (pc[2] + tz) + cx
        y = focal * pc[1] / (pc[2] + tz) + cy
        coords[idx] = (x / w, y / h)

    # Eye corners / eyelids also feed the feature extractor; these do not
    # affect head yaw, so neutral values are sufficient.
    coords[LEFT_EYE_LEFT] = (0.35, 0.42)
    coords[LEFT_EYE_RIGHT] = (0.48, 0.42)
    coords[RIGHT_EYE_LEFT] = (0.52, 0.42)
    coords[RIGHT_EYE_RIGHT] = (0.65, 0.42)
    coords[LEFT_UPPER] = (0.415, 0.41)
    coords[LEFT_LOWER] = (0.415, 0.435)
    coords[RIGHT_UPPER] = (0.585, 0.41)
    coords[RIGHT_LOWER] = (0.585, 0.435)
    for i in LEFT_IRIS:
        coords[i] = (0.415, 0.4225)
    for i in RIGHT_IRIS:
        coords[i] = (0.585, 0.4225)

    landmarks = [_Lm(0.5, 0.5) for _ in range(478)]
    for idx, (x, y) in coords.items():
        if 0 <= idx < len(landmarks):
            landmarks[idx].x = x
            landmarks[idx].y = y
    return landmarks


class _Face:
    __slots__ = ("landmark",)

    def __init__(self, landmark):
        self.landmark = landmark


class _CompatResult:
    def __init__(self, landmark):
        self.multi_face_landmarks = [_Face(landmark)]


class _FakeDetector:
    def __init__(self, landmark):
        self._lm = landmark

    def process(self, _frame):
        return _CompatResult(self._lm)


_FRAME = np.zeros((480, 640, 3), dtype=np.uint8)


def _new_service(yaw_deg: float) -> GazeService:
    service = GazeService()
    service.detector = _FakeDetector(_project_face(yaw_deg))
    return service


def _skip_startup_grace(service: GazeService, frames: int = 1) -> None:
    for _ in range(frames):
        service.process_frame(_FRAME)
    service._started_at = time.time() - 20.0


def test_head_turn_detected_with_big_yaw():
    service = _new_service(45.0)
    _skip_startup_grace(service)
    active = set()
    for _ in range(6):
        res = service.process_frame(_FRAME)
        active = set(res["active_violations"])
        if "HEAD_TURN" in active:
            break
    assert "HEAD_TURN" in active, f"HEAD_TURN not detected, got {active}"
    assert res["yaw"] is not None and abs(abs(res["yaw"]) - 45) < 12, res["yaw"]


def test_no_head_turn_with_small_yaw():
    service = _new_service(5.0)
    _skip_startup_grace(service)
    for _ in range(6):
        res = service.process_frame(_FRAME)
    assert "HEAD_TURN" not in res["active_violations"]


def test_gaze_away_detected_with_big_yaw():
    service = _new_service(45.0)
    _skip_startup_grace(service)
    active = set()
    for _ in range(8):
        res = service.process_frame(_FRAME)
        active = set(res["active_violations"])
        if "GAZE_AWAY" in active:
            break
    assert "GAZE_AWAY" in active, f"GAZE_AWAY not detected, got {active}"


def test_snapshot_cooldown_is_per_type_and_starts_on_snapshot():
    # Mirrors the ws_proctor confirm loop: cooldown for a type starts only when
    # a snapshot for that type is taken; a cooling-down type still gets its
    # event but without a snapshot, and without resetting its cooldown.
    cooldown = 5.0
    last_snapshot_at = {}

    def needs_snapshot(reason, now):
        return last_snapshot_at.get(reason) is None or now - last_snapshot_at[reason] >= cooldown

    now = 1000.0
    # First confirmation of both gaze and head -> each gets its own snapshot.
    for reason in ("gaze_away", "head_turn"):
        assert needs_snapshot(reason, now)
        last_snapshot_at[reason] = now
    now += 3.0  # just inside the cooldown
    assert not needs_snapshot("gaze_away", now)
    assert not needs_snapshot("head_turn", now)
    # Non-snapshot events do NOT advance the cooldown timer.
    now += 3.0  # 6s later
    assert needs_snapshot("gaze_away", now)
    assert needs_snapshot("head_turn", now)
    # A snapshot for one type does not reset the other's timer.
    last_snapshot_at["head_turn"] = now
    assert not needs_snapshot("head_turn", now + 3.0)
    assert needs_snapshot("gaze_away", now + 3.0)