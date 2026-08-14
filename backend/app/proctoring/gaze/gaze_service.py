import time
import logging
from collections import deque

from app.models.event import EventType
from .mediapipe_detector import MediaPipeDetector
from .feature_extractor import FeatureExtractor
from .gaze_estimator import GazeEstimator

logger = logging.getLogger(__name__)

_SMOOTHING_BUFFER_SIZE = 3

# Minimum away-zone votes (out of _SMOOTHING_BUFFER_SIZE) to confirm GAZE_AWAY.
_AWAY_CONSENSUS = 2

# Startup grace: ignore all gaze/head violations for the first N seconds of a
# session so students settling in (adjusting posture, camera warmup, etc.)
# are not flagged immediately.
_STARTUP_GRACE_SEC = 8.0

_AWAY_ZONES = {
    "top_left", "top_center", "top_right",
    "middle_left", "middle_right",
    "bottom_left", "bottom_center", "bottom_right",
}

# First snapshot ~1s after the violation activates (activation already
# requires 2/3 buffer consensus, so this is not single-frame noise), then
# escalate to suspicious/high while it persists. Each level = one event+snapshot.
_GAZE_EVENT_THRESHOLDS_SEC = {
    "warning": 1.0,
    "suspicious": 3.0,
    "high": 5.0,
}

_HEAD_TURN_YAW_THRESHOLD = 38.0
_LOOKING_DOWN_PITCH_THRESHOLD = -35.0
_LOOKING_OFF_SCREEN_TIMEOUT = 3.0


class GazeService:
    """
    Orchestrates the live gaze/head tracking pipeline for one exam session.

    Call sequence::

        service = GazeService()
        service.load_calibration(profile)   # once at WS connect
        result = service.process_frame(frame)  # every frame

    The service is stateful — it maintains a temporal smoothing buffer and
    tracks active violations with duration.

    It does NOT interact with the database directly.  The caller
    (ws_proctor.py) is responsible for persisting events returned by
    get_pending_events().
    """

    def __init__(self):
        self.detector = MediaPipeDetector()
        self.extractor = FeatureExtractor()
        self.estimator = GazeEstimator()

        self.calibration_profile: dict | None = None

        self._buffer: deque = deque(maxlen=_SMOOTHING_BUFFER_SIZE)
        self._smoothed_point: str | None = None
        self._smoothed_confidence: float = 0.0
        self._smoothed_yaw: float | None = None
        self._smoothed_pitch: float | None = None
        self._smoothed_roll: float | None = None
        self._last_raw_point: str | None = None
        self._last_raw_confidence: float = 0.0

        self._current_features: dict | None = None
        self._face_detected: bool = False
        self._frame_timestamp: float = 0.0

        self._frame_count: int = 0
        self._started_at: float | None = None
        self._violations: dict[str, dict] = {
            "GAZE_AWAY": {"active": False, "start": None, "events": [], "logged_duration": 0.0},
            "HEAD_TURN": {"active": False, "start": None, "events": [], "logged_duration": 0.0},
            "LOOKING_DOWN": {"active": False, "start": None, "events": [], "logged_duration": 0.0},
            "LOOKING_OFF_SCREEN": {"active": False, "start": None, "events": [], "logged_duration": 0.0},
        }
        self._no_face_since: float | None = None

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def load_calibration(self, profile: dict) -> None:
        self.calibration_profile = profile
        logger.info("GazeService: loaded calibration (%d points)", len(profile))

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
            self._handle_no_face(now)
            return self._build_result()

        self._face_detected = True
        self._no_face_since = None

        features = self.extractor.extract(face, frame)
        self._current_features = features

        self._run_gaze_estimation(features)
        self._update_violations(now)

        return self._build_result()

    def get_pending_events(self) -> list[dict]:
        """
        Return gaze/head events that have crossed the persistence threshold
        since the last call and are not on cooldown.

        Each event dict::

            {
                "event_type": EventType.gaze_away,
                "confidence": 0.85,
                "violation_type": "GAZE_AWAY",
                "duration": 4.2,
            }

        The caller should persist these via _persist_event() then call
        evaluate_and_alert().
        """
        now = time.time()
        pending = []

        thresholds = sorted(_GAZE_EVENT_THRESHOLDS_SEC.values())

        for vtype, state in self._violations.items():
            if not state["active"] or state["start"] is None:
                continue

            duration = now - state["start"]

            # Emit one event each time the violation crosses a higher threshold
            # (warning -> suspicious -> high). No time-based cooldown: every
            # escalation (and every new violation instance) produces a snapshot.
            crossed = [
                t for t in thresholds
                if duration >= t and t > state["logged_duration"]
            ]
            if not crossed:
                continue
            state["logged_duration"] = max(crossed)

            etype = self._violation_to_event_type(vtype)
            conf = self._compute_violation_confidence(vtype)

            pending.append({
                "event_type": etype,
                "confidence": conf,
                "violation_type": vtype,
                "duration": round(duration, 2),
                "start_time": state["start"],
            })

            logger.info(
                "GazeEvent: %s duration=%.1fs confidence=%.2f",
                vtype, duration, conf,
            )

        return pending

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

    def _handle_no_face(self, now: float) -> None:
        if self._no_face_since is None:
            self._no_face_since = now

        # Startup grace: never flag a missing face while the student settles in
        if self._in_startup_grace(now):
            self._clear_non_matching_violations(set())
        # Only activate LOOKING_OFF_SCREEN after a 1.5s grace period
        elif now - self._no_face_since >= 1.5:
            vs = self._violations["LOOKING_OFF_SCREEN"]
            if not vs["active"]:
                vs["active"] = True
                vs["start"] = self._no_face_since
                vs["events"] = []
                logger.info("Gaze: no face detected, starting LOOKING_OFF_SCREEN timer")
            self._clear_non_matching_violations({"LOOKING_OFF_SCREEN"})
        else:
            self._clear_non_matching_violations(set())

        self._buffer.clear()
        self._smoothed_point = None
        self._smoothed_confidence = 0.0
        self._smoothed_yaw = None
        self._smoothed_pitch = None
        self._smoothed_roll = None
        self._last_raw_point = None
        self._last_raw_confidence = 0.0

    def _run_gaze_estimation(self, features: dict) -> None:
        if self.calibration_profile:
            est = self.estimator.compare(self.calibration_profile, features)
        else:
            est = self.estimator.compare_unsafe(features) or {
                "point": "unknown",
                "confidence": 0.0,
                "distances": {},
                "all_scores": [],
            }

        raw_point = est["point"]
        raw_conf = est["confidence"]
        self._last_raw_point = raw_point
        self._last_raw_confidence = raw_conf

        self._buffer.append({
            "point": raw_point,
            "confidence": raw_conf,
            "yaw": features.get("yaw"),
            "pitch": features.get("pitch"),
            "roll": features.get("roll"),
        })

        if len(self._buffer) >= _SMOOTHING_BUFFER_SIZE:
            vote_counts: dict[str, float] = {}
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

        # ── Smoothed head angles (mean over the temporal buffer) ────
        # Used for HEAD_TURN / LOOKING_DOWN so a single-frame spike in the
        # noisy solvePnP output cannot trigger a violation.
        for key in ("yaw", "pitch", "roll"):
            vals = [e[key] for e in self._buffer if e.get(key) is not None]
            if vals:
                setattr(self, f"_smoothed_{key}", sum(vals) / len(vals))
            else:
                setattr(self, f"_smoothed_{key}", None)

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
            self._clear_non_matching_violations(set())
            return

        active_violations: set[str] = set()
        yaw = self._smoothed_yaw if self._smoothed_yaw is not None else self._current_features.get("yaw")
        pitch = self._smoothed_pitch if self._smoothed_pitch is not None else self._current_features.get("pitch")

        # ── GAZE_AWAY ──────────────────────────────────────────────
        # Require buffer consensus (at least _AWAY_CONSENSUS away-zone votes
        # out of _SMOOTHING_BUFFER_SIZE frames)
        if len(self._buffer) >= _SMOOTHING_BUFFER_SIZE:
            away_votes = sum(1 for item in self._buffer if item.get("point") in _AWAY_ZONES)
            if away_votes >= _AWAY_CONSENSUS:
                active_violations.add("GAZE_AWAY")

        # Forced clear: if smoothed prediction or current raw prediction is "center"
        if (self._smoothed_point == "center" or self._last_raw_point == "center") and yaw is not None and abs(yaw) < 22:
            active_violations.discard("GAZE_AWAY")

        # ── HEAD_TURN ──────────────────────────────────────────────
        if yaw is not None and abs(yaw) > _HEAD_TURN_YAW_THRESHOLD:
            active_violations.add("HEAD_TURN")

        # ── LOOKING_DOWN ───────────────────────────────────────────
        if pitch is not None and pitch < _LOOKING_DOWN_PITCH_THRESHOLD:
            active_violations.add("LOOKING_DOWN")

        self._update_violation_state("GAZE_AWAY", "GAZE_AWAY" in active_violations, now)
        self._update_violation_state("HEAD_TURN", "HEAD_TURN" in active_violations, now)
        self._update_violation_state("LOOKING_DOWN", "LOOKING_DOWN" in active_violations, now)

        self._clear_non_matching_violations(active_violations)

    def _update_violation_state(self, vtype: str, is_active: bool, now: float) -> None:
        vs = self._violations[vtype]
        if is_active and not vs["active"]:
            vs["active"] = True
            vs["start"] = now
            vs["events"] = []
            vs["logged_duration"] = 0.0
            logger.info("Gaze: %s started", vtype)
        elif not is_active and vs["active"]:
            vs["active"] = False
            vs["start"] = None
            logger.info("Gaze: %s ended (duration=%.1fs)", vtype, now - vs["start"] if vs["start"] else 0)

    def _clear_non_matching_violations(self, keep: set[str]) -> None:
        for vtype in list(self._violations.keys()):
            if vtype not in keep:
                self._violations[vtype]["active"] = False
                self._violations[vtype]["start"] = None

    def _build_result(self) -> dict:
        yaw = None
        pitch = None
        roll = None
        if self._current_features:
            yaw = self._current_features.get("yaw")
            pitch = self._current_features.get("pitch")
            roll = self._current_features.get("roll")

        status = "normal"
        violation_active = False
        violation_type: str | None = None
        violation_duration = 0.0

        now = time.time()
        for vtype, vs in self._violations.items():
            if vs["active"] and vs["start"] is not None:
                violation_active = True
                violation_type = vtype
                violation_duration = round(now - vs["start"], 2)
                status = vtype.lower()
                break

        return {
            "face_detected": self._face_detected,
            "status": status,
            "predicted_point": self._smoothed_point,
            "confidence": round(self._smoothed_confidence, 4),
            "yaw": round(yaw, 2) if yaw is not None else None,
            "pitch": round(pitch, 2) if pitch is not None else None,
            "roll": round(roll, 2) if roll is not None else None,
            "violation_active": violation_active,
            "violation_type": violation_type,
            "violation_duration": violation_duration,
        }

    @staticmethod
    def _violation_to_event_type(vtype: str) -> EventType:
        mapping = {
            "GAZE_AWAY": EventType.gaze_away,
            "HEAD_TURN": EventType.head_pose_abnormal,
            "LOOKING_DOWN": EventType.head_pose_abnormal,
            "LOOKING_OFF_SCREEN": EventType.person_absent,
        }
        return mapping.get(vtype, EventType.gaze_away)

    @staticmethod
    def _compute_violation_confidence(vtype: str) -> float:
        base = {
            "GAZE_AWAY": 0.7,
            "HEAD_TURN": 0.8,
            "LOOKING_DOWN": 0.8,
            "LOOKING_OFF_SCREEN": 0.9,
        }
        return base.get(vtype, 0.5)
