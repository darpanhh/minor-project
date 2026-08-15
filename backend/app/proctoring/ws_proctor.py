"""
WebSocket endpoint for real-time AI proctoring.

Receives base64-encoded JPEG frames from the frontend,
runs YOLO inference, saves violation snapshots, persists
ProctoringEvent records, and streams results back.
"""

import base64
import json
import logging
import os
import time
import uuid
from collections import deque
from datetime import datetime

import cv2
import numpy as np
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session as DBSession

from app.core.config import settings
from app.core.database import SessionLocal
from app.auth.jwt_handler import verify_token
from app.models.exam import ExamSession
from app.models.event import ProctoringEvent, EventType
from app.proctoring.detector import ProctorDetector

from app.proctoring.gaze.calibration import CalibrationProcessor
from app.proctoring.gaze.gaze_service import GazeService
from app.models.calibration import Calibration

calibration_processor = CalibrationProcessor()

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
}

# ── Temporal violation state machine (all timers use monotonic time) ─
ABSENCE_GRACE = 5.0
MULTIPLE_PERSON_GRACE = 1.5
PHONE_GRACE = 2.0
VIOLATION_END_GRACE = 5.0
SNAPSHOT_COOLDOWN = 10.0

# Seconds a person must be continuously undetected before person_absent
# counts as active (guards against single-frame YOLO detection flicker).
PERSON_ABSENT_DEBOUNCE = 2.0

GRACE_PERIODS: dict[str, float] = {
    "phone_detected": PHONE_GRACE,
    "multiple_persons": MULTIPLE_PERSON_GRACE,
    "person_absent": ABSENCE_GRACE,
}

WARNING_MESSAGES: dict[str, str] = {
    "phone_detected": "WARNING: Mobile phone detected. Please put away all devices.",
    "multiple_persons": "WARNING: Multiple persons detected in frame. Please ensure you are alone.",
    "person_absent": "WARNING: No person detected in frame. Please ensure you are visible to the camera.",
}

VIOLATION_MESSAGES: dict[str, str] = {
    "phone_detected": "VIOLATION RECORDED: Mobile phone detected. This has been reported to the administrator.",
    "multiple_persons": "VIOLATION RECORDED: Multiple persons detected in frame. This has been reported to the administrator.",
    "person_absent": "VIOLATION RECORDED: No person detected in frame. This has been reported to the administrator.",
}

VIOLATION_REASONS = ("phone_detected", "multiple_persons", "person_absent")


def _new_violation_state() -> dict:
    """Phase machine: normal → warning → confirmed → recovering → normal."""
    return {
        "phase": "normal",  # normal | warning | confirmed | recovering
        "warning_started_at": None,
        "recovery_started_at": None,
        "event_id": None,
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


def _save_snapshot(session_id: str, frame: np.ndarray, reason: str) -> str:
    """Write a JPEG snapshot and return the filename."""
    fname = f"{session_id}_{reason}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
    cv2.imwrite(os.path.join(SNAPSHOT_DIR, fname), frame)
    return fname


# Rolling frame history so a snapshot can be taken from the frame at the time a
# violation STARTED (e.g. the actual gaze-away moment), not from the current
# frame several seconds later when the student has already looked back.
FRAME_BUFFER_MAXLEN = 15  # ~15s of history at the ~1 fps frame rate


def _snapshot_frame_for_time(
    frame_buffer: deque,
    start_ts: float,
    fallback_frame: np.ndarray,
) -> np.ndarray:
    """Return the first buffered frame recorded at/after `start_ts`.

    Falls back to `fallback_frame` (the current frame) if nothing is available.
    """
    for ts, b64 in frame_buffer:
        if ts >= start_ts:
            decoded = _decode_frame(b64)
            if decoded is not None:
                return decoded
    return fallback_frame


def _object_violation_active(result: dict) -> bool:
    """True if a phone / multiple-persons violation is in the CURRENT frame.

    Only suppress gaze-away/looking-down when an object violation is actually
    visible right now (a phone in hand is primarily a phone violation). Gaze
    events are NOT suppressed by historical/lingering object states, so genuine
    gaze-away snapshots are always taken.
    """
    return bool(result.get("phone_detected")) or (result.get("person_count") or 0) > 1


def _persist_event(
    db: DBSession,
    session_id: uuid.UUID,
    event_type: EventType,
    confidence: float,
    snapshot_path: str | None,
) -> ProctoringEvent | None:
    """Insert a ProctoringEvent row and return it (or None on failure)."""
    try:
        event = ProctoringEvent(
            session_id=session_id,
            event_type=event_type,
            confidence=confidence,
            snapshot_path=snapshot_path,
        )
        db.add(event)
        db.commit()
        db.refresh(event)
        return event
    except Exception:
        db.rollback()
        logger.exception("Failed to persist proctoring event")
        return None


def _load_calibration(gaze_service: GazeService, session_uuid: uuid.UUID) -> None:
    """Load calibration profile from DB into the gaze service (best-effort)."""
    try:
        db = SessionLocal()
        try:
            cal = db.query(Calibration).filter(
                Calibration.exam_session_id == session_uuid
            ).first()
            if cal and cal.profile and cal.completed:
                gaze_service.load_calibration(cal.profile)
                logger.info("Gaze: loaded calibration for session %s", session_uuid)
            else:
                logger.info("Gaze: no calibration profile for session %s (ok)", session_uuid)
        finally:
            db.close()
    except Exception as e:
        logger.warning("Gaze: failed to load calibration for session %s: %s", session_uuid, e)


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

    # Per-reason temporal state machine for warning-first violation logic
    violation_states: dict[str, dict] = {r: _new_violation_state() for r in VIOLATION_REASONS}
    last_snapshot_at: float | None = None  # monotonic timestamp of the last evidence snapshot

    # Recent frames (timestamp, base64) used to snapshot the violation-start moment
    frame_buffer: deque[tuple[float, str]] = deque(maxlen=FRAME_BUFFER_MAXLEN)

    # Initialise gaze/head tracking with this session's calibration
    gaze_service = GazeService()
    _load_calibration(gaze_service, session_uuid)

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

                # Record this frame in the rolling history (before processing,
                # so its timestamp aligns with the "now" used for violations).
                frame_buffer.append((datetime.now().timestamp(), frame_data))
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
            result = detector.process_frame(str(session_uuid), frame)

            # ── Gaze/head-pose pipeline (additive, does NOT affect YOLO) ──
            gaze_result = gaze_service.process_frame(frame)
            logger.debug("Gaze: status=%s point=%s conf=%.3f",
                         gaze_result.get("status", "?"),
                         gaze_result.get("predicted_point", "?"),
                         gaze_result.get("confidence", 0.0))

            # ── Temporal violation state machine (per-frame) ─────────────
            # Derive active reasons from per-frame detection flags (NOT from
            # the detector's throttled snapshot_reasons).
            current_reasons = set()
            if result.get("phone_detected"):
                current_reasons.add("phone_detected")
            if (result.get("person_count") or 0) > 1:
                current_reasons.add("multiple_persons")
            # Person absence is DEBOUNCED: it only counts after the person has
            # been undetected for PERSON_ABSENT_DEBOUNCE seconds continuously.
            # The YOLO model misses the person on isolated frames (flicker),
            # which would otherwise keep the violation confirmed forever.
            if (result.get("person_count") or 0) == 0 and (
                time.time() - detector.get_state(str(session_uuid)).last_person_seen
                >= PERSON_ABSENT_DEBOUNCE
            ):
                current_reasons.add("person_absent")

            now_mono = time.monotonic()
            new_alerts: list[dict] = []
            active_warnings: list[dict] = []
            newly_confirmed: list[str] = []

            for reason, state in violation_states.items():
                active = reason in current_reasons

                if active:
                    if state["phase"] == "normal":
                        # DETECT → WARN: show warning immediately, start grace timer
                        state["phase"] = "warning"
                        state["warning_started_at"] = now_mono
                        new_alerts.append({"type": reason, "message": WARNING_MESSAGES[reason]})
                    elif state["phase"] == "warning":
                        # WARN → CONFIRM once the grace period is exceeded
                        if now_mono - state["warning_started_at"] >= GRACE_PERIODS[reason]:
                            state["phase"] = "confirmed"
                            state["warning_started_at"] = None
                            newly_confirmed.append(reason)
                            new_alerts.append({"type": reason, "message": VIOLATION_MESSAGES[reason]})
                    elif state["phase"] == "recovering":
                        # Violation returned within the end-grace: episode continues
                        state["phase"] = "confirmed"
                        state["recovery_started_at"] = None
                    # phase == "confirmed": keep active, do NOT create events per frame
                else:
                    if state["phase"] == "warning":
                        # Condition ended before confirmation: reset timer, remove warning
                        state["phase"] = "normal"
                        state["warning_started_at"] = None
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

                # Live warning state for the main-screen overlay. The banner
                # disappears the instant the condition is no longer detected:
                # recovering is kept internally (episode continuity) but is NOT
                # shown, so a cleared violation clears the screen immediately.
                if state["phase"] == "warning":
                    active_warnings.append({
                        "type": reason,
                        "message": WARNING_MESSAGES[reason],
                        "level": "warning",
                    })
                elif state["phase"] == "confirmed":
                    active_warnings.append({
                        "type": reason,
                        "message": VIOLATION_MESSAGES[reason],
                        "level": "violation",
                    })

            # ── Confirmations: ONE event per reason per episode, ONE snapshot
            #    for the same confirmation moment (shared across simultaneous
            #    violations), subject to the snapshot cooldown ──────────────
            snapshots: list[str] = []
            if newly_confirmed:
                db = SessionLocal()
                try:
                    snapshot_url = None
                    if last_snapshot_at is None or now_mono - last_snapshot_at >= SNAPSHOT_COOLDOWN:
                        fname = _save_snapshot(str(session_uuid), frame, "+".join(newly_confirmed))
                        snapshot_url = f"/snapshots/{fname}"
                        snapshots.append(snapshot_url)
                        last_snapshot_at = now_mono

                    for reason in newly_confirmed:
                        try:
                            etype = ALERT_TO_EVENT_TYPE.get(reason)
                            if not etype:
                                continue
                            conf = _detection_confidence(detector, result, reason)
                            event = _persist_event(db, session_uuid, etype, conf, snapshot_url)
                            violation_states[reason]["event_id"] = event.id if event else None
                            logger.info(
                                "Violation confirmed: %s (conf=%.2f snapshot=%s)",
                                reason, conf, snapshot_url,
                            )
                        except Exception:
                            logger.exception(
                                "Failed to persist confirmed violation %s for session %s",
                                reason, session_uuid,
                            )
                finally:
                    db.close()

            # ── Cooldown only gates REPEATED evidence snapshots: while a
            #    confirmed violation stays active, refresh its snapshot every
            #    10s WITHOUT creating new DB events ────────────────────────
            refresh_reasons = [
                r for r, s in violation_states.items() if s["phase"] in ("confirmed", "recovering")
            ]
            if refresh_reasons and (last_snapshot_at is None or now_mono - last_snapshot_at >= SNAPSHOT_COOLDOWN):
                db = SessionLocal()
                try:
                    fname = _save_snapshot(str(session_uuid), frame, "+".join(refresh_reasons))
                    snapshot_url = f"/snapshots/{fname}"
                    snapshots.append(snapshot_url)
                    last_snapshot_at = now_mono
                    for reason in refresh_reasons:
                        event_id = violation_states[reason].get("event_id")
                        if not event_id:
                            continue
                        event = db.get(ProctoringEvent, event_id)
                        if event:
                            event.snapshot_path = snapshot_url
                    db.commit()
                    logger.info("Refreshed evidence snapshot for active violations: %s", refresh_reasons)
                finally:
                    db.close()

            result["alerts"] = new_alerts
            result["active_warnings"] = active_warnings
            result["snapshots"] = snapshots
            result["snapshot_reasons"] = newly_confirmed

            # ── Persist gaze/head events (completely additive) ──────────
            gaze_events = gaze_service.get_pending_events()
            if gaze_events:
                db_gaze = SessionLocal()
                try:
                    # A primary object violation (phone / multiple persons) in the
                    # CURRENT frame overrides GAZE_AWAY / LOOKING_DOWN: looking at
                    # a phone naturally produces those, so they must not be
                    # recorded as separate (mislabeled) "gaze away" events.
                    for ev in gaze_events:
                        if ev["violation_type"] in ("GAZE_AWAY", "LOOKING_DOWN") and _object_violation_active(result):
                            logger.info("Suppressing gaze event %s while object visible", ev["violation_type"])
                            continue

                        # Snapshot the frame from when the violation actually
                        # started (e.g. the moment the student looked away),
                        # not the current frame after they may have looked back.
                        snap_frame = _snapshot_frame_for_time(
                            frame_buffer,
                            ev.get("start_time", time.time()),
                            frame,
                        )
                        fname = _save_snapshot(str(session_uuid), snap_frame, ev["violation_type"])
                        snapshot_url = f"/snapshots/{fname}"
                        _persist_event(db_gaze, session_uuid, ev["event_type"], ev["confidence"], snapshot_url)
                        logger.info(
                            "Gaze event: %s (conf=%.2f dur=%.1fs snapshot=%s)",
                            ev["violation_type"], ev["confidence"], ev["duration"], fname,
                        )
                        result.setdefault("alerts", []).append({
                            "type": ev["violation_type"],
                            "message": f"VIOLATION RECORDED: {ev['violation_type'].replace('_', ' ').title()} detected for {ev['duration']:.0f}s.",
                        })
                finally:
                    db_gaze.close()

            result["gaze"] = gaze_result
            await websocket.send_json(result)

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
        while True:
            raw = await websocket.receive_text()
            payload = json.loads(raw)
            point = payload.get("point", "unknown")
            frame_number = payload.get("frame_number", 0)
            frame_data = payload.get("frame", "")

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
            })

    except (WebSocketDisconnect, RuntimeError):
        print(f"[Calibration] WS disconnected for session {session_id}")
        logger.info("Calibration WS disconnected for session %s", session_id)
    except Exception:
        logger.exception("Calibration WS error for session %s", session_id)

