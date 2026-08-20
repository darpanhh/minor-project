"""
WebSocket endpoint for real-time AI proctoring.

Receives base64-encoded JPEG frames from the frontend,
runs YOLO inference, saves violation snapshots, persists
ProctoringEvent records, and streams results back.
"""

import base64
import enum
import json
import logging
import os
import time
import uuid
from datetime import datetime

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlmodel import Session as DBSession

from app.core.config import settings
from app.core.database import SessionLocal
from app.auth.jwt_handler import verify_token
from app.models.exam import ExamSession
from app.models.event import ProctoringEvent, EventType
from app.models.calibration import Calibration
from app.proctoring.detector import ProctorDetector

from app.proctoring.gaze.calibration import CalibrationProcessor
from app.proctoring.gaze.gaze_service import GazeService

logger = logging.getLogger(__name__)

router = APIRouter()

SNAPSHOT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "snapshots")
os.makedirs(SNAPSHOT_DIR, exist_ok=True)

# Singleton detector — loaded once when this module is first imported.
# Uses the small/nano model suitable for real-time CPU inference.
_detector: ProctorDetector | None = None


def get_detector() -> ProctorDetector:
    """Lazy-initialise the YOLO detector so the model is loaded only once."""
    global _detector
    if _detector is None:
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        model_path = os.path.join(base_dir, settings.MODEL_PATH)
        logger.info("Loading proctoring model from: %s", model_path)
        _detector = ProctorDetector(model_path=model_path)
        logger.info(
            "Model loaded — person_class_id=%d, phone_class_id=%d",
            _detector.person_class_id,
            _detector.phone_class_id,
        )
    return _detector


# ── Mapping from detector alert types → DB EventType ────────────────
ALERT_TO_EVENT_TYPE: dict[str, EventType] = {
    "multiple_persons": EventType.multiple_faces,
    "phone_detected": EventType.phone_detected,
    "person_absent": EventType.person_absent,
    "gaze_away": EventType.gaze_away,
    "head_turn": EventType.head_pose_abnormal,
}

# ── Temporal violation state machine (all timers use monotonic time) ─
ABSENCE_GRACE = 2.0
MULTIPLE_PERSON_GRACE = 1.5
PHONE_GRACE = 2.0
# After a phone is last seen, keep the phone reason active for this long so a
# flickering YOLO detection still shows a stable warning and can confirm.
PHONE_HOLD_SEC = 1.0
VIOLATION_END_GRACE = 10.0

# For gaze/head violations: how long the violation must be ABSENT before the
# warning phase resets to normal. 2.0s bridges measurement gaps at 10fps.
GAZE_CLEAR_GRACE: dict[str, float] = {
    "gaze_away": 2.0,
    "head_turn": 2.0,
}
# Per-event-type snapshot cooldown: for a GIVEN violation type, never take
# two snapshots within 5 seconds. The cooldown is independent per event type.
SNAPSHOT_COOLDOWN = 5.0

# Seconds a person must be continuously undetected before person_absent
# counts as active (guards against single-frame YOLO detection flicker).
PERSON_ABSENT_DEBOUNCE = 1.0

# ── Per-pipeline frame throttling (wall-clock, monotonic) ────────────
# YOLO object detection is the heaviest pipeline, so it runs at a lower
# frame rate than the MediaPipe gaze/head tracking.
YOLO_FPS = 3.0
GAZE_FPS = 10.0
YOLO_INTERVAL = 1.0 / YOLO_FPS
GAZE_INTERVAL = 1.0 / GAZE_FPS

# Per-session, per-reason timestamps (monotonic) of the last evidence snapshot,
# kept at MODULE level so each type's gate survives websocket reconnects — a
# reconnect must never allow a re-snapshot within that type's cooldown window.
_snapshot_store: dict[str, dict[str, float]] = {}
_MAX_STORED_SESSIONS = 100


def _record_snapshot(session_key: str, reason: str, now_mono: float) -> None:
    """Store the snapshot timestamp for a session+reason, bounding the map size."""
    if session_key not in _snapshot_store:
        if len(_snapshot_store) >= _MAX_STORED_SESSIONS:
            try:
                del _snapshot_store[next(iter(_snapshot_store))]
            except (StopIteration, KeyError):
                pass
        _snapshot_store[session_key] = {}
    _snapshot_store[session_key][reason] = now_mono


def _can_snapshot(session_key: str, reason: str, now_mono: float) -> bool:
    """Atomic per-session/per-reason snapshot gate — the single source of truth."""
    timers = _snapshot_store.get(session_key)
    last = timers.get(reason) if timers else None
    if last is not None and now_mono - last < SNAPSHOT_COOLDOWN:
        logger.debug(
            "Snapshot REJECTED: session=%s reason=%s last=%.3f now=%.3f "
            "elapsed=%.3fs (<%0.1fs)",
            session_key, reason, last, now_mono, now_mono - last,
            SNAPSHOT_COOLDOWN,
        )
        return False

    _record_snapshot(session_key, reason, now_mono)
    logger.debug(
        "Snapshot ALLOWED: session=%s reason=%s last=%s now=%.3f elapsed=%s",
        session_key, reason,
        f"{last:.3f}" if last is not None else "None",
        now_mono,
        f"{now_mono - last:.3f}s" if last is not None else "n/a",
    )
    return True


GRACE_PERIODS: dict[str, float] = {
    "phone_detected": PHONE_GRACE,
    "multiple_persons": MULTIPLE_PERSON_GRACE,
    "person_absent": ABSENCE_GRACE,
    "gaze_away": 2.0,   # eye: warning banner shown for 2.0s → snapshot at 5s total
    "head_turn": 2.0,   # head: warning banner shown for 2.0s → snapshot at 4s total
}

# Timing for silent detection before warning banner appears:
#   gaze_away (eye):     3s silent → warning banner → 2s warning → confirmed violation + snapshot (5s total)
#   head_turn (head):    2s silent → warning banner → 2s warning → confirmed violation + snapshot (4s total)
#   person_absent:       1s silent → warning banner → 2s warning → confirmed violation
WARNING_DELAYS: dict[str, float] = {
    "gaze_away": 3.0,    # eye: 3s silent before warning banner appears
    "head_turn": 2.0,    # head: 2s silent before warning banner appears
    "person_absent": 1.0,
}

WARNING_MESSAGES: dict[str, str] = {
    "phone_detected": "WARNING: Mobile phone detected. Please put away all devices.",
    "multiple_persons": "WARNING: Multiple persons detected in frame. Please ensure you are alone.",
    "person_absent": "WARNING: No person detected in frame. Please ensure you are visible to the camera.",
    "gaze_away": "WARNING: Gaze away from screen detected. Please keep your eyes on the exam.",
    "head_turn": "WARNING: Head turned away from screen. Please face your screen.",
}

VIOLATION_MESSAGES: dict[str, str] = {
    "phone_detected": "VIOLATION RECORDED: Mobile phone detected. This has been reported to the administrator.",
    "multiple_persons": "VIOLATION RECORDED: Multiple persons detected in frame. This has been reported to the administrator.",
    "person_absent": "VIOLATION RECORDED: No person detected in frame. This has been reported to the administrator.",
    "gaze_away": "VIOLATION RECORDED: Gaze away from screen detected. This has been reported to the administrator.",
    "head_turn": "VIOLATION RECORDED: Head turned away from screen. This has been reported to the administrator.",
}

VIOLATION_BANNER_HOLD = 3.0

VIOLATION_REASONS = (
    "phone_detected", "multiple_persons", "person_absent",
    "gaze_away", "head_turn",
)


def _new_violation_state() -> dict:
    """Phase machine: normal → detected → warning → confirmed → recovering → normal."""
    return {
        "phase": "normal",  # normal | detected | warning | confirmed | recovering
        "detected_started_at": None,
        "warning_started_at": None,
        "confirmed_at": None,       # timestamp when violation was confirmed (for banner hold)
        "clear_started_at": None,   # when the violation last went absent (for GAZE_CLEAR_GRACE)
        "recovery_started_at": None,
        "event_id": None,
        # One snapshot per EPISODE — even if the violation recovers and
        # re-confirms repeatedly, no second snapshot is taken until the
        # episode has fully ended and a new one begins.
        "snapshot_taken": False,
    }


def _detection_confidence(detector, result: dict, reason: str) -> float:
    """Highest matching detection confidence for a confirmed reason."""
    target_class = None
    if reason == "phone_detected":
        target_class = detector.phone_class_id
    elif reason == "multiple_persons":
        target_class = detector.person_class_id
    if target_class is None:
        return 1.0  # person absent — no object to score
    conf = 0.0
    for det in result["detections"]:
        if det["class_id"] == target_class and det["confidence"] > conf:
            conf = det["confidence"]
    return conf or 0.0


def _decode_frame(data_url_or_b64: str) -> np.ndarray | None:
    """Decode a base64 (or data-URL) string to an OpenCV BGR image."""
    try:
        if "," in data_url_or_b64:
            data_url_or_b64 = data_url_or_b64.split(",", 1)[1]
        img_bytes = base64.b64decode(data_url_or_b64)
        arr = np.frombuffer(img_bytes, dtype=np.uint8)
        return cv2.imdecode(arr, cv2.IMREAD_COLOR)
    except Exception:
        return None


def _sanitize_for_json(obj):
    """Recursively convert numpy types, UUIDs, and enums into native JSON-serializable Python types."""
    if isinstance(obj, dict):
        return {k: _sanitize_for_json(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple, set)):
        return [_sanitize_for_json(item) for item in obj]
    elif isinstance(obj, (np.floating, float)):
        return float(obj)
    elif isinstance(obj, (np.integer, int)):
        return int(obj)
    elif isinstance(obj, (np.ndarray,)):
        return obj.tolist()
    elif isinstance(obj, (np.bool_, bool)):
        return bool(obj)
    elif isinstance(obj, uuid.UUID):
        return str(obj)
    elif isinstance(obj, enum.Enum):
        return obj.value
    return obj


def _save_snapshot(session_id: str, frame: np.ndarray, reason: str) -> str:
    """Write a JPEG snapshot and return the filename."""
    fname = f"{session_id}_{reason}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
    cv2.imwrite(os.path.join(SNAPSHOT_DIR, fname), frame)
    return fname


def _persist_event(
    db: DBSession,
    session_id: uuid.UUID,
    event_type: EventType,
    confidence: float,
    snapshot_path: str | None,
    action: str | None = None,
) -> ProctoringEvent | None:
    """Insert a ProctoringEvent row and return it (or None on failure)."""
    try:
        event = ProctoringEvent(
            session_id=session_id,
            event_type=event_type,
            confidence=confidence,
            snapshot_path=snapshot_path,
            action=action,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event
    except Exception:
        db.rollback()
        logger.exception("Failed to persist proctoring event")
        return None


def _load_calibration(gaze_service: GazeService, session_uuid: uuid.UUID) -> bool:
    """Load the session's calibration profile into the gaze service (best-effort).

    Checks:
      1. Directly for this exam session
      2. If not found or empty, searches for previous calibration from the same student
      3. Loads whatever profile parts are available (eye and/or head)

    Returns True if calibration was successfully loaded, False otherwise.
    """
    try:
        db = SessionLocal()
        try:
            cal = db.query(Calibration).filter(
                Calibration.exam_session_id == session_uuid
            ).first()

            # If not found or profile is empty, check if the student has previous calibration
            if not cal or not cal.profile:
                exam_session = db.query(ExamSession).filter(ExamSession.id == session_uuid).first()
                if exam_session and exam_session.student_id:
                    other_cal = (
                        db.query(Calibration)
                        .join(ExamSession, Calibration.exam_session_id == ExamSession.id)
                        .filter(ExamSession.student_id == exam_session.student_id)
                        .filter(Calibration.profile != {})
                        .order_by(Calibration.updated_at.desc())
                        .first()
                    )
                    if other_cal and other_cal.profile:
                        logger.info(
                            "Gaze: using previous calibration from session %s for student %s",
                            other_cal.exam_session_id, exam_session.student_id,
                        )
                        cal = other_cal

            if cal and cal.profile:
                profile = dict(cal.profile)
                head = profile.get("head") or {}
                eye_ready = all(
                    p in profile
                    for p in ("top_left", "top_right", "bottom_left", "bottom_right")
                )
                head_ready = all(k in head for k in ("forward", "left", "right"))
                if eye_ready or head_ready:
                    gaze_service.load_calibration(profile)
                    logger.info(
                        "Gaze: loaded calibration for session %s (eye=%s, head=%s, completed=%s)",
                        session_uuid, eye_ready, head_ready, cal.completed,
                    )
                    return True
                else:
                    logger.warning(
                        "Gaze: calibration profile INCOMPLETE for session %s "
                        "(eye=%s head=%s) — using uncalibrated fallback",
                        session_uuid, eye_ready, head_ready,
                    )
                    return False
            else:
                logger.info(
                    "Gaze: no calibration profile for session %s "
                    "(falling back to uncalibrated thresholds)", session_uuid)
                return False
        finally:
            db.close()
    except Exception as e:
        logger.warning("Gaze: failed to load calibration for session %s: %s", session_uuid, e)
        return False


@router.websocket("/ws/proctor/{session_id}")
async def proctor_ws(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(default=None),
):
    """
    Real-time proctoring WebSocket.

    Query params:
        token  –  JWT access token (optional but recommended)

    The client sends JSON:  { "frame": "<base64 jpeg>" }
    The server responds with the detection result JSON on every frame.
    """

    # ── Optional JWT auth (warn on failure but allow connection) ──
    if token:
        payload = verify_token(token)
        if payload is None or payload.get("type") != "access":
            logger.warning("Proctor WS: invalid token for session %s, allowing anyway", session_id)
    else:
        logger.info("Proctor WS: no token provided for session %s, allowing anonymous", session_id)

    # ── Validate session_id is a valid UUID ──
    try:
        session_uuid = uuid.UUID(session_id)
    except (ValueError, TypeError):
        await websocket.accept()
        await websocket.send_json({"error": "Invalid session ID format"})
        await websocket.close(code=4004)
        return

    await websocket.accept()
    logger.info("Proctor WS connected for session %s", session_uuid)

    # ── Validate session exists (close with 4004 if not found) ─────
    db = SessionLocal()
    try:
        exam_session = db.query(ExamSession).filter(
            ExamSession.id == session_uuid
        ).first()
        if not exam_session:
            await websocket.send_json({"error": "Session not found"})
            await websocket.close(code=4004)
            return
    except Exception as e:
        logger.error("Proctor WS: DB error looking up session %s: %s", session_uuid, e)
        await websocket.send_json({"error": "Database error"})
        await websocket.close(code=1011)
        return
    finally:
        db.close()

    try:
        detector = get_detector()
    except Exception as e:
        logger.error("Failed to load proctor detector for session %s: %s", session_uuid, e)
        await websocket.send_json({
            "person_count": 0,
            "phone_detected": False,
            "detections": [],
            "alerts": [{"type": "system_error", "message": "AI Proctor initialization failed"}],
            "snapshot_reasons": [],
            "snapshots": []
        })
        await websocket.close(code=1011, reason="Detector initialization failed")
        return

    # Per-reason temporal state machine for warning-first violation logic.
    # head_turn and gaze_away keep SEPARATE states/timers; when both are
    # active, head_turn takes priority and inherits the earlier timer so the
    # clock never restarts on a switch.
    violation_states: dict[str, dict] = {r: _new_violation_state() for r in VIOLATION_REASONS}
    # Per-session, per-reason snapshot cooldown, stored at MODULE level so it
    # survives websocket reconnects: for any given event type, never two
    # snapshots within SNAPSHOT_COOLDOWN seconds; each type is gated
    # independently so gaze/head/phone never block each other.
    last_snapshot_key = str(session_uuid)

    # ── Initialise gaze/head tracking with this session's calibration ──
    gaze_service = GazeService()
    calibration_loaded = _load_calibration(gaze_service, session_uuid)
    # If calibration was not available (student may still be calibrating),
    # retry after processing ~50 gaze frames (≈5s at 10fps).
    calibration_retry_at_frame: int | None = 50 if not calibration_loaded else None
    gaze_frame_count: int = 0

    # Last-run timestamps (monotonic) per pipeline, so each model is invoked
    # at most at its configured frame rate regardless of the client's send rate.
    last_yolo_time = 0.0
    last_gaze_time = 0.0

    # The last CONFIRMED set of gaze violations — only updated when run_gaze=True.
    # This prevents stale gaze results from YOLO-only frames from resetting the
    # warning state machine (e.g. a YOLO frame that runs when the cached
    # gaze_result has face_detected=False would clear gaze violations).
    last_gaze_violations: set[str] = set()

    # Safe defaults so result/gaze_result are never referenced before assignment
    # (e.g. on the very first frame when one pipeline is throttled).
    result: dict = {
        "person_count": 0,
        "phone_detected": False,
        "detections": [],
        "alerts": [],
        "snapshot_reasons": [],
        "snapshots": [],
    }
    gaze_result: dict = {
        "face_detected": False,
        "status": "normal",
        "predicted_point": None,
        "confidence": 0.0,
        "yaw": None,
        "pitch": None,
        "head_direction": "not_detected",
        "eye_direction": "not_detected",
        "active_violations": [],
        "violation_active": False,
        "violation_type": None,
        "violation_duration": 0.0,
    }

    try:
        while True:
            try:
                raw = await websocket.receive_text()
                payload_data = json.loads(raw)
                frame_data = payload_data.get("frame", "")
                if not frame_data:
                    continue
                frame = _decode_frame(frame_data)
                if frame is None:
                    continue
            except json.JSONDecodeError:
                logger.warning("Proctor WS: received invalid JSON from session %s", session_uuid)
                continue
            except (WebSocketDisconnect, RuntimeError) as e:
                if isinstance(e, RuntimeError) and "disconnect" not in str(e).lower():
                    logger.warning("Proctor WS: error reading frame for session %s: %s", session_uuid, e)
                    continue
                raise
            except Exception as e:
                logger.warning("Proctor WS: error reading or decoding frame for session %s: %s", session_uuid, e)
                continue

            print(f"Frame received from session {session_uuid}: shape={frame.shape}")
            logger.info("Proctor WS: received frame from session %s (shape: %s)", session_uuid, frame.shape)

            # ── Throttle pipelines to their configured frame rates ─────────
            # Each pipeline is only invoked when its interval has elapsed. The
            # most recent result is reused in between, so the overlay keeps
            # rendering and the state machine keeps running at gaze cadence.
            frame_time = time.monotonic()
            run_yolo = frame_time - last_yolo_time >= YOLO_INTERVAL
            run_gaze = frame_time - last_gaze_time >= GAZE_INTERVAL

            if run_yolo:
                last_yolo_time = frame_time
                result = detector.process_frame(str(session_uuid), frame)

            if run_gaze:
                last_gaze_time = frame_time
                # Gaze + head pose share this single MediaPipe pass; both
                # therefore run at GAZE_FPS.
                gaze_result = gaze_service.process_frame(frame)
                gaze_frame_count += 1

                # Retry calibration load if it wasn't available initially
                if calibration_retry_at_frame is not None and gaze_frame_count >= calibration_retry_at_frame:
                    calibration_retry_at_frame = None  # only retry once
                    if not calibration_loaded:
                        logger.info("Gaze: retrying calibration load for session %s", session_uuid)
                        if _load_calibration(gaze_service, session_uuid):
                            calibration_loaded = True
                            logger.info("Gaze: calibration loaded on retry for session %s", session_uuid)
                        else:
                            logger.warning("Gaze: calibration still not available on retry for session %s", session_uuid)

                logger.debug("Gaze: status=%s point=%s conf=%.3f",
                             gaze_result.get("status", "?"),
                             gaze_result.get("predicted_point", "?"),
                             gaze_result.get("confidence", 0.0))

            # Neither pipeline was due: skip the state machine and response
            # for this frame entirely.
            if not run_yolo and not run_gaze:
                continue

            # ── Temporal violation state machine (per-frame) ─────────────
            # Derive active reasons from per-frame detection flags (NOT from
            # the detector's throttled snapshot_reasons).
            current_reasons = set()
            # Phone detection is HELD for PHONE_HOLD_SEC after the last sighting:
            # YOLO misses the phone on isolated frames (3fps cadence, confidence
            # near threshold), which would otherwise blink the warning off and
            # prevent the 2s confirmation grace from ever completing.
            phone_state = detector.get_state(str(session_uuid))
            if result.get("phone_detected") or (
                time.time() - phone_state.last_phone_seen < PHONE_HOLD_SEC
            ):
                current_reasons.add("phone_detected")
            if (result.get("person_count") or 0) > 1:
                current_reasons.add("multiple_persons")
            # Person absence is DEBOUNCED: it only counts after the person has
            # been undetected for PERSON_ABSENT_DEBOUNCE seconds continuously.
            # The YOLO model misses the person on isolated frames (flicker),
            # which would otherwise keep the violation confirmed forever.
            # MediaPipe face detection OVERRIDES the absence check: a face in
            # frame means the person is present, even when YOLO fails to
            # classify them (close-up face, partial body, awkward angle).
            if (result.get("person_count") or 0) == 0 and (
                time.time() - detector.get_state(str(session_uuid)).last_person_seen
                >= PERSON_ABSENT_DEBOUNCE
            ) and not gaze_result.get("face_detected"):
                current_reasons.add("person_absent")

            # ── Gaze/head current-frame violations (MediaPipe, yaw-only) ──
            # Only refresh gaze violations when the gaze pipeline actually ran
            # this frame. On YOLO-only frames (gaze throttled), carry forward
            # last_gaze_violations so stale cached results never reset the state.
            if run_gaze:
                new_violations = set(gaze_result.get("active_violations") or [])
                if new_violations != last_gaze_violations:
                    logger.info(
                        "Gaze violations changed: %s -> %s (face=%s yaw=%s)",
                        sorted(last_gaze_violations),
                        sorted(new_violations),
                        gaze_result.get("face_detected"),
                        gaze_result.get("yaw"),
                    )
                last_gaze_violations = new_violations

            if "HEAD_TURN" in last_gaze_violations:
                current_reasons.add("head_turn")
            if "GAZE_AWAY" in last_gaze_violations:
                current_reasons.add("gaze_away")

            # If person is in frame but face is turned completely away / undetected:
            if (result.get("person_count") or 0) > 0 and not gaze_result.get("face_detected"):
                current_reasons.add("head_turn")

            # ── HEAD PRIORITY: when both head_turn and gaze_away are active
            # simultaneously, head_turn takes full ownership of the shared timer.
            # gaze_away is suppressed so only ONE warning + ONE snapshot fires.
            # The head_turn state machine inherits the earliest detected_started_at
            # from either violation so the clock never restarts on a switch.
            both_active = "head_turn" in current_reasons and "gaze_away" in current_reasons
            if both_active:
                # Transfer the earliest timer to head_turn so no time is lost.
                ga_start = violation_states["gaze_away"].get("detected_started_at")
                ht_start = violation_states["head_turn"].get("detected_started_at")
                earliest = min(
                    (t for t in (ga_start, ht_start) if t is not None),
                    default=None,
                )
                if earliest is not None and (
                    violation_states["head_turn"]["phase"] in ("normal", "detected")
                ):
                    violation_states["head_turn"]["detected_started_at"] = earliest
                    if violation_states["head_turn"]["phase"] == "normal":
                        violation_states["head_turn"]["phase"] = "detected"
                    # Also carry over warning phase if gaze_away was already there
                    if (
                        violation_states["gaze_away"]["phase"] == "warning"
                        and violation_states["head_turn"]["phase"] != "warning"
                    ):
                        violation_states["head_turn"]["phase"] = "warning"
                        violation_states["head_turn"]["warning_started_at"] = (
                            violation_states["gaze_away"]["warning_started_at"]
                        )
                # Suppress gaze_away entirely this frame: remove from active set
                # so its phase machine receives NO advance while head dominates.
                current_reasons.discard("gaze_away")
                logger.debug("[Proctor] gaze_away suppressed — head_turn has priority")
            elif "head_turn" in current_reasons and "gaze_away" not in current_reasons:
                # head_turn active alone: inherit any earlier gaze_away timer
                # so the student can't reset the clock by switching from eye to head.
                ga_start = violation_states["gaze_away"].get("detected_started_at")
                ht_start = violation_states["head_turn"].get("detected_started_at")
                if ga_start is not None and (
                    violation_states["gaze_away"]["phase"] in ("detected", "warning")
                ):
                    earliest = ga_start if ht_start is None else min(ga_start, ht_start)
                    if violation_states["head_turn"]["phase"] == "normal":
                        violation_states["head_turn"]["phase"] = "detected"
                        violation_states["head_turn"]["detected_started_at"] = earliest
                    elif ht_start is None or earliest < ht_start:
                        violation_states["head_turn"]["detected_started_at"] = earliest
                    if (
                        violation_states["gaze_away"]["phase"] == "warning"
                        and violation_states["head_turn"]["phase"] != "warning"
                    ):
                        violation_states["head_turn"]["phase"] = "warning"
                        violation_states["head_turn"]["warning_started_at"] = (
                            violation_states["gaze_away"]["warning_started_at"]
                        )
            elif "gaze_away" in current_reasons and "head_turn" not in current_reasons:
                # gaze_away active alone: inherit any earlier head_turn timer
                ht_start = violation_states["head_turn"].get("detected_started_at")
                ga_start = violation_states["gaze_away"].get("detected_started_at")
                if ht_start is not None and (
                    violation_states["head_turn"]["phase"] in ("detected", "warning")
                ):
                    earliest = ht_start if ga_start is None else min(ht_start, ga_start)
                    if violation_states["gaze_away"]["phase"] == "normal":
                        violation_states["gaze_away"]["phase"] = "detected"
                        violation_states["gaze_away"]["detected_started_at"] = earliest
                    elif ga_start is None or earliest < ga_start:
                        violation_states["gaze_away"]["detected_started_at"] = earliest
                    if (
                        violation_states["head_turn"]["phase"] == "warning"
                        and violation_states["gaze_away"]["phase"] != "warning"
                    ):
                        violation_states["gaze_away"]["phase"] = "warning"
                        violation_states["gaze_away"]["warning_started_at"] = (
                            violation_states["head_turn"]["warning_started_at"]
                        )

            now_mono = time.monotonic()
            new_alerts: list[dict] = []
            active_warnings: list[dict] = []
            newly_confirmed: list[str] = []

            for reason, state in violation_states.items():
                active = reason in current_reasons

                if active:
                    # Violation is present this frame — clear any pending clear-grace timer
                    state["clear_started_at"] = None

                    if state["phase"] == "normal":
                        delay = WARNING_DELAYS.get(reason, 0.0)
                        state["detected_started_at"] = now_mono
                        if delay > 0:
                            # Silent buffer: don't show warning yet
                            state["phase"] = "detected"
                            logger.info("[Proctor] %s: detected (silent buffer started)", reason)
                        else:
                            state["phase"] = "warning"
                            state["warning_started_at"] = now_mono
                            new_alerts.append({"type": reason, "message": WARNING_MESSAGES[reason]})
                            logger.info("[Proctor] %s: warning banner displayed", reason)

                    elif state["phase"] == "detected":
                        # Silent period: check if it elapsed
                        delay = WARNING_DELAYS.get(reason, 0.0)
                        if now_mono - state["detected_started_at"] >= delay:
                            # Crossed → show warning banner on screen!
                            state["phase"] = "warning"
                            state["warning_started_at"] = now_mono
                            new_alerts.append({"type": reason, "message": WARNING_MESSAGES[reason]})
                            logger.info("[Proctor] %s: silent threshold passed -> warning banner displayed", reason)

                    elif state["phase"] == "warning":
                        # Warning period: check if it elapsed
                        if now_mono - state["warning_started_at"] >= GRACE_PERIODS[reason]:
                            # Elapsed → show violation banner, persist event, take snapshot!
                            state["phase"] = "confirmed"
                            state["confirmed_at"] = now_mono
                            state["warning_started_at"] = None
                            newly_confirmed.append(reason)
                            new_alerts.append({"type": reason, "message": VIOLATION_MESSAGES[reason]})
                            logger.info("[Proctor] %s: warning period passed -> VIOLATION CONFIRMED!", reason)

                    elif state["phase"] == "recovering":
                        # Returning violation from recovery: start with the silent delay or warning!
                        delay = WARNING_DELAYS.get(reason, 0.0)
                        state["detected_started_at"] = now_mono
                        state["recovery_started_at"] = None
                        if delay > 0:
                            state["phase"] = "detected"
                        else:
                            state["phase"] = "warning"
                            state["warning_started_at"] = now_mono
                            new_alerts.append({"type": reason, "message": WARNING_MESSAGES[reason]})

                    # phase == "confirmed": keep active, do NOT create new events per frame
                else:
                    clear_grace = GAZE_CLEAR_GRACE.get(reason, 0.0)
                    if state["phase"] in ("detected", "warning"):
                        if clear_grace > 0.0:
                            # Only reset after violation is absent for clear_grace
                            if state["clear_started_at"] is None:
                                state["clear_started_at"] = now_mono
                            elif now_mono - state["clear_started_at"] >= clear_grace:
                                state["phase"] = "recovering" if state["snapshot_taken"] else "normal"
                                state["detected_started_at"] = None
                                state["warning_started_at"] = None
                                state["clear_started_at"] = None
                                if state["phase"] == "recovering":
                                    state["recovery_started_at"] = now_mono
                                logger.info("[Proctor] %s: violation cleared after absence", reason)
                        else:
                            state["phase"] = "recovering" if state["snapshot_taken"] else "normal"
                            state["detected_started_at"] = None
                            state["warning_started_at"] = None
                            state["clear_started_at"] = None
                            if state["phase"] == "recovering":
                                state["recovery_started_at"] = now_mono

                    elif state["phase"] == "confirmed":
                        # Condition ended: move to RECOVERING and start the end-grace timer
                        state["phase"] = "recovering"
                        state["recovery_started_at"] = now_mono

                    elif state["phase"] == "recovering":
                        if now_mono - state["recovery_started_at"] >= VIOLATION_END_GRACE:
                            # Episode fully ended → reset to NORMAL
                            state["phase"] = "normal"
                            state["recovery_started_at"] = None
                            state["event_id"] = None
                            state["confirmed_at"] = None
                            state["snapshot_taken"] = False

                # Live warning state for the main-screen overlay.
                # HEAD PRIORITY: suppress gaze_away banner when head_turn is
                # already showing a warning or violation banner — only one
                # banner from the eye/head pair should be visible at a time.
                head_active_in_ui = (
                    violation_states["head_turn"]["phase"] in ("warning", "confirmed")
                    or (
                        violation_states["head_turn"].get("confirmed_at")
                        and now_mono - violation_states["head_turn"]["confirmed_at"] < VIOLATION_BANNER_HOLD
                    )
                )
                if reason == "gaze_away" and head_active_in_ui:
                    pass  # head_turn banner already shown — skip gaze_away
                elif state["phase"] == "warning":
                    active_warnings.append({
                        "type": reason,
                        "message": WARNING_MESSAGES[reason],
                        "level": "warning",
                    })
                elif state["phase"] == "confirmed" or (
                    state.get("confirmed_at") and (now_mono - state["confirmed_at"] < VIOLATION_BANNER_HOLD)
                ):
                    active_warnings.append({
                        "type": reason,
                        "message": VIOLATION_MESSAGES[reason],
                        "level": "violation",
                    })

            # ── Confirmations: ONE event per reason per episode.
            # HEAD PRIORITY: if head_turn and gaze_away are both confirmed in
            # the same frame, suppress the gaze_away confirmation entirely so
            # only one DB event and one snapshot are produced.
            if "head_turn" in newly_confirmed and "gaze_away" in newly_confirmed:
                newly_confirmed.remove("gaze_away")
                # Mark gaze_away snapshot as taken so it doesn't fire independently
                # if head_turn later clears while gaze_away remains active.
                violation_states["gaze_away"]["snapshot_taken"] = True
                logger.info(
                    "[Proctor] gaze_away confirmation suppressed — head_turn has priority"
                )

            snapshots: list[str] = []
            if newly_confirmed:
                db = SessionLocal()
                try:
                    for reason in newly_confirmed:
                        state = violation_states[reason]
                        # ALWAYS take the snapshot for a newly confirmed violation episode
                        fname = _save_snapshot(str(session_uuid), frame, reason)
                        snapshot_url = f"/snapshots/{fname}"
                        snapshots.append(snapshot_url)
                        state["snapshot_taken"] = True
                        _record_snapshot(last_snapshot_key, reason, now_mono)

                        try:
                            etype = ALERT_TO_EVENT_TYPE.get(reason)
                            if not etype:
                                continue
                            action_detail = None
                            if reason in ("gaze_away", "head_turn"):
                                violation_confs = gaze_result.get("violation_confidences") or {}
                                if reason == "gaze_away":
                                    vtype_key = "GAZE_AWAY"
                                    eye_d = gaze_result.get("eye_direction", "away")
                                    action_detail = f"Looked {eye_d.replace('_', ' ')}"
                                else:  # head_turn
                                    vtype_key = "HEAD_TURN"
                                    head_d = gaze_result.get("head_direction", "away")
                                    yaw_val = gaze_result.get("yaw")
                                    if yaw_val is not None:
                                        action_detail = f"Head turned {head_d} ({yaw_val:+.1f}°)"
                                    else:
                                        action_detail = f"Head turned {head_d}"
                                conf = float(violation_confs.get(vtype_key, 0.5))
                                if conf <= 0:
                                    conf = 0.5  # fallback: never persist 0 confidence
                            elif reason == "phone_detected":
                                conf = _detection_confidence(detector, result, reason)
                                action_detail = "Mobile phone detected in frame"
                            elif reason == "multiple_persons":
                                conf = _detection_confidence(detector, result, reason)
                                action_detail = f"Multiple persons detected in frame"
                            elif reason == "person_absent":
                                conf = 1.0
                                action_detail = "Student absent / left camera frame"
                            else:
                                conf = _detection_confidence(detector, result, reason)

                            event = _persist_event(db, session_uuid, etype, conf, snapshot_url, action=action_detail)
                            violation_states[reason]["event_id"] = event.id if event else None
                            logger.info(
                                "Violation confirmed: %s (conf=%.2f snapshot=%s detail=%s)",
                                reason, conf, snapshot_url, action_detail,
                            )
                        except Exception:
                            logger.exception(
                                "Failed to persist confirmed violation %s for session %s",
                                reason, session_uuid,
                            )
                finally:
                    db.close()

            result["alerts"] = new_alerts
            result["active_warnings"] = active_warnings
            result["snapshots"] = snapshots
            result["snapshot_reasons"] = newly_confirmed

            result["gaze"] = gaze_result
            safe_payload = _sanitize_for_json(result)
            await websocket.send_text(json.dumps(safe_payload))

    except (WebSocketDisconnect, RuntimeError) as e:
        if isinstance(e, RuntimeError) and "disconnect" not in str(e).lower():
            logger.exception("Proctoring WS error for session %s", session_uuid)
        else:
            logger.info("Proctor WS disconnected for session %s", session_uuid)
        detector.end_session(str(session_uuid))
    except Exception:
        logger.exception("Proctoring WS error for session %s", session_uuid)
        detector.end_session(str(session_uuid))


# ── Calibration WebSocket (separate from proctoring) ─────────────────


@router.websocket("/ws/proctor/calibration/{session_id}")
async def calibration_ws(
    websocket: WebSocket,
    session_id: str,
):
    """
    Calibration WebSocket — completely separate from the exam proctoring endpoint.

    Receives calibration frames and logs them. Does NOT run YOLO, does NOT
    persist anything to the database, and does NOT create snapshots.
    MediaPipe processing will be added here later.
    """
    await websocket.accept()
    print(f"[Calibration] WS connected for session {session_id}")
    logger.info("Calibration WS connected for session %s", session_id)

    db = SessionLocal()
    try:
        session_exists = db.query(ExamSession).filter(
            ExamSession.id == session_id
        ).first()
        if not session_exists:
            await websocket.send_json({"error": "Session not found"})
            await websocket.close(code=4004)
            return
    finally:
        db.close()

    try:
        # Fresh calibration state per connection — the store must NOT persist
        # samples across sessions or re-attempts, otherwise a point that was
        # completed earlier silently reuses its stale averaged features.
        calibration_processor = CalibrationProcessor()

        while True:
            raw = await websocket.receive_text()
            payload = json.loads(raw)
            point = payload.get("point", "unknown")
            frame_number = payload.get("frame_number", 0)
            frame_data = payload.get("frame", "")

            # ── Reset messages (re-capture / restart) ──────────────
            msg_type = payload.get("type")
            if msg_type == "reset":
                calibration_processor.store.reset_point(point)
                await websocket.send_json({"status": "ok", "reset": point})
                continue
            if msg_type == "reset_all":
                calibration_processor.store.reset_all()
                await websocket.send_json({"status": "ok", "reset_all": True})
                continue

            if not frame_data:
                continue

            frame = _decode_frame(frame_data)
            if frame is None:
                continue

            result = calibration_processor.process(frame, point, frame_number, session_id)

            if not result["success"]:
                await websocket.send_json(result)
                continue
            
            print(f"[Calibration] Point={point} Frame={frame_number} Shape=({frame.shape[0]},{frame.shape[1]},{frame.shape[2]})")
            logger.info(
                "Calibration: Point=%s Frame=%d Shape=(%d,%d,%d)",
                point,
                frame_number,
                frame.shape[0],
                frame.shape[1],
                frame.shape[2],
            )

            await websocket.send_json({
                "status": "ok",
                "frame_number": frame_number,
                "point": point,
                "landmarks_detected": result["landmark_count"],
                "samples_collected": result["samples_collected"],
                "point_complete": result["point_complete"],
            })

    except (WebSocketDisconnect, RuntimeError):
        print(f"[Calibration] WS disconnected for session {session_id}")
        logger.info("Calibration WS disconnected for session %s", session_id)
    except Exception:
        logger.exception("Calibration WS error for session %s", session_id)

