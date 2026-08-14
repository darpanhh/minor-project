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
from app.services.suspicion_engine import evaluate_and_alert

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
) -> None:
    """Insert a ProctoringEvent row."""
    try:
        event = ProctoringEvent(
            session_id=session_id,
            event_type=event_type,
            confidence=confidence,
            snapshot_path=snapshot_path,
        )
        db.add(event)
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Failed to persist proctoring event")


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

    # Track warnings per session to implement warning-first logic
    # reason -> {"first_seen": timestamp, "last_seen": timestamp, "confirmed": bool, "logged_once": bool, "last_log_time": timestamp}
    violation_states: dict[str, dict] = {}

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

            # --- State tracking for warning-first logic ---
            now_ts = datetime.now().timestamp()
            # Derive active reasons from the per-frame detection flags (NOT from
            # the detector's throttled snapshot_reasons, which only appears once
            # per 10s and would break continuity/confirmation).
            current_reasons = set()
            if result.get("phone_detected"):
                current_reasons.add("phone_detected")
            if (result.get("person_count") or 0) > 1:
                current_reasons.add("multiple_persons")
            if (result.get("person_count") or 0) == 0:
                current_reasons.add("person_absent")

            # Clean up stale violation states where the violation has stopped for > 5 seconds
            stale_reasons = []
            for r, state in violation_states.items():
                if r not in current_reasons:
                    if now_ts - state["last_seen"] > 5.0:
                        stale_reasons.append(r)
            for r in stale_reasons:
                violation_states.pop(r, None)

            confirmed_snapshot_reasons = []
            modified_alerts = []

            for r in current_reasons:
                if r not in violation_states:
                    violation_states[r] = {
                        "first_seen": now_ts,
                        "last_seen": now_ts,
                        "confirmed": False,
                        "logged_once": False
                    }
                else:
                    violation_states[r]["last_seen"] = now_ts

                state = violation_states[r]
                active_duration = now_ts - state["first_seen"]

                base_msg = ""
                if r == "phone_detected":
                    base_msg = "Mobile phone detected."
                    print("[DETECTOR] Mobile phone detected.")
                elif r == "multiple_persons":
                    base_msg = "Multiple persons detected in frame."
                    print("[DETECTOR] Multiple persons detected in frame.")
                elif r == "person_absent":
                    base_msg = "No person detected in frame."
                    print("[DETECTOR] No person detected in frame.")

                grace_sec = 5.0 if r == "person_absent" else 2.0
                if active_duration < grace_sec:
                    # Within warning grace period: warn on-screen, DO NOT log to DB
                    warn_msg = f"WARNING: {base_msg} Please ensure you are alone and put away all devices."
                    modified_alerts.append({
                        "type": r,
                        "message": warn_msg
                    })
                else:
                    # Violation persisted past grace period! Confirm and record
                    state["confirmed"] = True
                    should_log = False

                    if not state["logged_once"]:
                        should_log = True
                        state["logged_once"] = True
                        state["last_log_time"] = now_ts
                    elif now_ts - state.get("last_log_time", 0.0) >= 10.0:
                        should_log = True
                        state["last_log_time"] = now_ts

                    if should_log:
                        confirmed_snapshot_reasons.append(r)

                    violation_msg = f"VIOLATION RECORDED: {base_msg} This has been reported to the administrator."
                    modified_alerts.append({
                        "type": r,
                        "message": violation_msg
                    })

            # Override default alerts with user-friendly stateful alerts
            if modified_alerts:
                result["alerts"] = modified_alerts

            # ── Save snapshots & persist DB events (ONLY for confirmed/throttled reasons) ───────────────────
            snapshots: list[str] = []
            if confirmed_snapshot_reasons:
                db = SessionLocal()
                try:
                    for reason in confirmed_snapshot_reasons:
                        try:
                            # Snapshot the frame from when this violation first appeared
                            state = violation_states.get(reason, {})
                            start_ts = state.get("first_seen", now_ts)
                            snap_frame = _snapshot_frame_for_time(frame_buffer, start_ts, frame)
                            fname = _save_snapshot(str(session_uuid), snap_frame, reason)
                            snapshot_url = f"/snapshots/{fname}"
                            snapshots.append(snapshot_url)

                            # Map reason → EventType and persist
                            etype = ALERT_TO_EVENT_TYPE.get(reason)
                            if etype:
                                # Use the highest confidence from matching detections
                                # Use dynamic class IDs from the loaded model (works with any weights)
                                conf = 0.0
                                target_class = None
                                if reason == "phone_detected":
                                    target_class = detector.phone_class_id
                                elif reason == "multiple_persons":
                                    target_class = detector.person_class_id

                                if target_class is not None:
                                    for det in result["detections"]:
                                        if det["class_id"] == target_class and det["confidence"] > conf:
                                            conf = det["confidence"]
                                else:
                                    conf = 1.0 # default for person absent

                                _persist_event(db, session_uuid, etype, conf, snapshot_url)
                        except Exception:
                            logger.exception(
                                "Failed to process confirmed violation reason %s for session %s",
                                reason, session_uuid,
                            )
                    
                    evaluate_and_alert(db, session_uuid)
                finally:
                    db.close()

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
                            ev.get("start_time", now_ts),
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
                    evaluate_and_alert(db_gaze, session_uuid)
                finally:
                    db_gaze.close()

            result["snapshots"] = snapshots
            result["snapshot_reasons"] = confirmed_snapshot_reasons
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

