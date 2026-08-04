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
    ts = datetime.now().strftime("%Y%2md_%H%M%S_%f")
    # Clean up formatting representation safely
    fname = f"{session_id}_{reason}_{datetime.now().strftime('%Y%m%d_%H%M%S_%f')}.jpg"
    cv2.imwrite(os.path.join(SNAPSHOT_DIR, fname), frame)
    return fname


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
            result = detector.process_frame(str(session_uuid), frame)

            # --- State tracking for warning-first logic ---
            now_ts = datetime.now().timestamp()
            current_reasons = set(result.get("snapshot_reasons", []))

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

                if active_duration < 4.0:
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
                        fname = _save_snapshot(str(session_uuid), frame, reason)
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
                    
                    # Evaluate and trigger alerts in the suspicion engine
                    evaluate_and_alert(db, session_uuid)
                finally:
                    db.close()

            result["snapshots"] = snapshots
            result["snapshot_reasons"] = confirmed_snapshot_reasons
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

