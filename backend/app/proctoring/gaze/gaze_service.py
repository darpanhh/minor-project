import time
import logging
from collections import deque

from .mediapipe_detector import MediaPipeDetector
from .feature_extractor import FeatureExtractor
from .gaze_estimator import GazeEstimator
from .directions import head_direction, eye_zone, eye_zone_calibrated, zone_to_direction

logger = logging.getLogger(__name__)

_SMOOTHING_BUFFER_SIZE = 5

# Startup grace: ignore all gaze/head violations for the first N seconds of a
# session so students settling in (adjusting posture, camera warmup, etc.)
# are not flagged immediately.
_STARTUP_GRACE_SEC = 3.0

_AWAY_ZONES = {
    "top_left", "top_center", "top_right",
    "middle_left", "middle_right",
    "bottom_left", "bottom_center", "bottom_right",
}

# Head-turn (yaw-only) threshold in degrees. Used when no calibrated head
# profile is available for the session (22° indicates head clearly turned away from screen).
_HEAD_TURN_YAW_THRESHOLD = 22.0


class GazeService:
    """
    Orchestrates the live gaze/head tracking pipeline for one exam session.

    The service is stateful — it maintains a temporal smoothing buffer and
    reports which violations are active for the CURRENT frame so the caller
    (ws_proctor.py) can drive the shared warning → violation state machine,
    exactly like the YOLO object-detection reasons.

    Calibration is loaded if available and used to compare the current features
    for detection; when no profile exists it falls back to uncalibrated yaw
    thresholds. Head-pose tracking is yaw-only (no pitch / roll).
    """

    def __init__(self):
        self.detector = MediaPipeDetector()
        self.extractor = FeatureExtractor()
        self.estimator = GazeEstimator()

        self.calibration_profile: dict | None = None
        self._head_profile: dict | None = None

        self._buffer: deque = deque(maxlen=_SMOOTHING_BUFFER_SIZE)
        self._smoothed_point: str | None = None
        self._smoothed_confidence: float = 0.0
        self._last_raw_point: str | None = None
        self._last_raw_confidence: float = 0.0

        self._current_features: dict | None = None
        self._face_detected: bool = False
        self._frame_timestamp: float = 0.0

        # Track consecutive no-face frames so single-frame flicker does NOT
        # clear the smoothing buffer and reset violation state.
        self._no_face_streak: int = 0
        # Face must be absent for this many consecutive gaze frames before the
        # buffer is cleared (prevents MediaPipe flicker from resetting gaze).
        self._NO_FACE_CLEAR_THRESHOLD: int = 3

        self._frame_count: int = 0
        self._started_at: float | None = None
        self._violations: dict[str, dict] = {
            "GAZE_AWAY": {"active": False, "start": None, "confidence": 0.0},
            "HEAD_TURN": {"active": False, "start": None, "confidence": 0.0},
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load_calibration(self, profile: dict) -> None:
        self.calibration_profile = profile
        self._head_profile = (profile or {}).get("head")

    def process_frame(self, frame) -> dict:
        now = time.time()
        if self._started_at is None:
            self._started_at = now
        self._frame_timestamp = now
        self._frame_count += 1

        face = self._detect_face(frame)
        if not face:
            self._face_detected = False
            self._current_features = None
            self._no_face_streak += 1
            self._handle_no_face()
            return self._build_result()
        self._no_face_streak = 0

        self._face_detected = True

        features = self.extractor.extract(face, frame)
        self._current_features = features

        self._run_gaze_estimation(features)
        self._update_violations(now)

        return self._build_result()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _detect_face(self, frame):
        results = self.detector.process(frame)
        if not results.multi_face_landmarks:
            return None
        return results.multi_face_landmarks[0]

    def _in_startup_grace(self, now: float) -> bool:
        return self._started_at is not None and now - self._started_at < _STARTUP_GRACE_SEC

    def _handle_no_face(self) -> None:
        # When face is absent (e.g. turned away from camera), do NOT clear
        # active violations — turning away from camera is a violation!
        # Only clear the landmark feature buffer after extended absence.
        if self._no_face_streak >= 30:  # ~3 seconds
            self._buffer.clear()
            self._smoothed_point = None
            self._smoothed_confidence = 0.0
            self._last_raw_point = None
            self._last_raw_confidence = 0.0

    def _run_gaze_estimation(self, features: dict) -> None:
        # Away-detection uses the iris offsets RELATIVE to the student's
        # calibrated on-screen region (or absolute offsets when uncalibrated).
        # Real iris movement is tiny, so absolute 0.5-based thresholds never
        # fire; the calibrated corners define what "on screen" means per user.
        if self.calibration_profile:
            raw_point = eye_zone_calibrated(features, self.calibration_profile)
            est = self.estimator.compare(self.calibration_profile, features)
        else:
            raw_point = eye_zone(features)
            est = self.estimator.compare_unsafe(features) or {
                "point": "unknown",
                "confidence": 0.0,
                "distances": {},
                "all_scores": [],
            }
        raw_conf = est["confidence"]
        self._last_raw_point = raw_point
        self._last_raw_confidence = raw_conf

        self._buffer.append({"point": raw_point, "confidence": raw_conf})

        if len(self._buffer) >= _SMOOTHING_BUFFER_SIZE:
            vote_counts: dict[str, int] = {}
            vote_conf: dict[str, list[float]] = {}
            for entry in self._buffer:
                p = entry["point"]
                vote_counts[p] = vote_counts.get(p, 0) + 1
                vote_conf.setdefault(p, []).append(entry["confidence"])

            best_point = max(vote_counts, key=vote_counts.get)
            best_conf_list = vote_conf[best_point]
            smoothed_conf = sum(best_conf_list) / len(best_conf_list)

            self._smoothed_point = best_point
            self._smoothed_confidence = smoothed_conf
        else:
            self._smoothed_point = raw_point
            self._smoothed_confidence = raw_conf

        logger.debug(
            "Gaze: raw=%s(%.3f) smoothed=%s(%.3f) buffer=%d",
            raw_point, raw_conf,
            self._smoothed_point, self._smoothed_confidence,
            len(self._buffer),
        )

    def _update_violations(self, now: float) -> None:
        if not self._face_detected:
            return

        # Startup grace period: do not flag any gaze/head violations during the
        # first few seconds of the session
        if self._in_startup_grace(now):
            self._clear_violations()
            return

        active_violations: set[str] = set()
        violation_confs: dict[str, float] = {}
        yaw = self._current_features.get("yaw") if self._current_features else None

        # ── GAZE_AWAY ──────────────────────────────────────────────
        # Use proportional voting so partial buffers are not silently ignored.
        # Threshold: requires at least 3 away-votes out of a 5-frame buffer (>=60%),
        # so brief glances or marginal iris measurements do not trigger false
        # positives, while genuine off-screen looks are still caught.
        buf_len = len(self._buffer)
        away_votes = 0
        if buf_len >= 3:
            away_votes = sum(1 for item in self._buffer if item.get("point") in _AWAY_ZONES)
            required_votes = max(2, (buf_len * 3 + 4) // 5)
            if away_votes >= required_votes:
                active_violations.add("GAZE_AWAY")
                # Confidence = fraction of buffer frames that are in away zones
                violation_confs["GAZE_AWAY"] = away_votes / buf_len

        # Forced clear: if the smoothed prediction is "center",
        # the eyes are back on the screen — drop the violation so
        # it clears as soon as the student looks back.
        if self._smoothed_point == "center":
            active_violations.discard("GAZE_AWAY")
            violation_confs.pop("GAZE_AWAY", None)

        logger.debug(
            "Gaze violations check: buf_len=%d away_votes=%s HEAD_TURN=%s yaw=%s",
            buf_len,
            away_votes,
            yaw is not None and self._is_head_turn(yaw),
            f"{yaw:.1f}" if yaw is not None else None,
        )

        # ── HEAD_TURN (yaw only — no pitch / roll) ─────────────────
        if yaw is not None and self._is_head_turn(yaw):
            active_violations.add("HEAD_TURN")
            # Confidence = how far past the threshold the yaw is
            violation_confs["HEAD_TURN"] = self._head_turn_confidence(yaw)

        self._update_violation_state("GAZE_AWAY", "GAZE_AWAY" in active_violations, now,
                                     violation_confs.get("GAZE_AWAY", 0.0))
        self._update_violation_state("HEAD_TURN", "HEAD_TURN" in active_violations, now,
                                     violation_confs.get("HEAD_TURN", 0.0))

    def _is_head_turn(self, yaw: float) -> bool:
        head = self._head_profile or {}
        forward = (head.get("forward") or {}).get("yaw")
        left = (head.get("left") or {}).get("yaw")
        right = (head.get("right") or {}).get("yaw")

        if forward is not None and left is not None and right is not None:
            deviation = yaw - forward
            # Positive yaw = turned to the student's RIGHT, negative = LEFT.
            # Use the calibrated turn size for the SAME side so a small
            # calibration on one side doesn't inflate the other's threshold.
            side = right if deviation > 0 else left
            threshold = max(20.0, abs(side - forward) * 0.70)
            return abs(deviation) > threshold

        return abs(yaw) > _HEAD_TURN_YAW_THRESHOLD

    def _head_turn_confidence(self, yaw: float) -> float:
        """Compute confidence for a head-turn violation (0..1).

        The confidence represents how far past the threshold the yaw is,
        clamped to [0, 1].  1.0 means the head is fully turned to the
        calibrated extremes; 0.5 means it is halfway past threshold.
        """
        head = self._head_profile or {}
        forward = (head.get("forward") or {}).get("yaw")
        left = (head.get("left") or {}).get("yaw")
        right = (head.get("right") or {}).get("yaw")

        if forward is not None and left is not None and right is not None:
            deviation = yaw - forward
            side = right if deviation > 0 else left
            threshold = max(14.0, abs(side - forward) * 0.6)
        else:
            threshold = _HEAD_TURN_YAW_THRESHOLD
            deviation = abs(yaw)

        if threshold <= 0:
            return 1.0
        # How far past the threshold: at threshold → 0.5, at 2× threshold → 1.0
        return min(1.0, max(0.0, abs(deviation) / (threshold * 2)))

    def _update_violation_state(self, vtype: str, is_active: bool, now: float,
                                confidence: float = 0.0) -> None:
        vs = self._violations[vtype]
        if is_active and not vs["active"]:
            vs["active"] = True
            vs["start"] = now
            vs["confidence"] = confidence
            logger.info("Gaze: %s started (conf=%.2f)", vtype, confidence)
        elif is_active and vs["active"]:
            # Update confidence while the violation is active
            vs["confidence"] = confidence
        elif not is_active and vs["active"]:
            logger.info(
                "Gaze: %s ended (duration=%.1fs)",
                vtype, now - vs["start"] if vs["start"] else 0.0,
            )
            vs["active"] = False
            vs["start"] = None
            vs["confidence"] = 0.0

    def _clear_violations(self) -> None:
        for vtype in self._violations:
            self._violations[vtype]["active"] = False
            self._violations[vtype]["start"] = None
            self._violations[vtype]["confidence"] = 0.0

    def _build_result(self) -> dict:
        yaw = self._current_features.get("yaw") if self._current_features else None
        pitch = self._current_features.get("pitch") if self._current_features else None

        # Simple directional states, reported independently: the eyes can look
        # in one direction while the head remains centered.
        head_dir = "not_detected"
        eye_dir = "not_detected"
        if self._face_detected and self._current_features is not None:
            head_dir = head_direction(yaw, pitch)
            eye_dir = zone_to_direction(self._last_raw_point)

        now = time.time()
        active_violations = sorted(
            vtype for vtype, vs in self._violations.items() if vs["active"]
        )

        # Per-violation confidence: the actual strength of each active violation
        # (yaw deviation ratio for HEAD_TURN, away-vote fraction for GAZE_AWAY).
        violation_confidences: dict[str, float] = {
            vtype: round(float(vs["confidence"]), 4)
            for vtype, vs in self._violations.items()
            if vs["active"]
        }

        status = "normal"
        violation_active = False
        violation_type: str | None = None
        violation_duration = 0.0

        for vtype, vs in self._violations.items():
            if vs["active"] and vs["start"] is not None:
                violation_active = True
                violation_type = vtype
                violation_duration = round(float(now - vs["start"]), 2)
                status = vtype.lower()
                break

        return {
            "face_detected": self._face_detected,
            "status": status,
            "predicted_point": self._smoothed_point,
            "confidence": round(float(self._smoothed_confidence), 4),
            "yaw": round(float(yaw), 2) if yaw is not None else None,
            "pitch": round(float(pitch), 2) if pitch is not None else None,
            "head_direction": head_dir,
            "eye_direction": eye_dir,
            "active_violations": active_violations,
            "violation_confidences": violation_confidences,
            "violation_active": violation_active,
            "violation_type": violation_type,
            "violation_duration": violation_duration,
        }