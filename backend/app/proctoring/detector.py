import time
from dataclasses import dataclass, field

import numpy as np
from ultralytics import YOLO

# COCO class ids (default YOLO pretrained weights)
PERSON_CLASS_ID = 0
PHONE_CLASS_ID = 67  # 'cell phone'


@dataclass
class SessionState:
    """Per-session state for tracking detection continuity."""

    last_person_seen: float = field(default_factory=time.time)
    person_absent_alerted: bool = False
    last_multi_person_snapshot: float = 0.0
    last_phone_snapshot: float = 0.0
    last_absence_snapshot: float = 0.0


class ProctorDetector:
    """
    Wraps a YOLO model and keeps per-exam-session state so it can detect:
      - multiple people in frame
      - phone in frame
      - candidate missing from frame for too long
    """

    def __init__(self, model_path: str = "yolov8n.pt", conf_threshold: float = 0.45):
        self.model = YOLO(model_path)
        self.conf_threshold = conf_threshold
        self.sessions: dict[str, SessionState] = {}

    def get_state(self, session_id: str) -> SessionState:
        if session_id not in self.sessions:
            self.sessions[session_id] = SessionState()
        return self.sessions[session_id]

    def process_frame(
        self,
        session_id: str,
        frame: np.ndarray,
        absence_timeout: float = 5.0,    # seconds with no person before alert
        snapshot_cooldown: float = 10.0,  # min seconds between snapshots for same reason
    ) -> dict:
        state = self.get_state(session_id)
        now = time.time()

        results = self.model(frame, conf=self.conf_threshold, verbose=False)[0]

        detections = []
        person_count = 0
        phone_detected = False

        for box in results.boxes:
            cls = int(box.cls[0])
            conf = float(box.conf[0])
            x1, y1, x2, y2 = map(int, box.xyxy[0])
            name = self.model.names[cls]

            detections.append(
                {
                    "class_id": cls,
                    "label": name,
                    "confidence": round(conf, 3),
                    "bbox": [x1, y1, x2, y2],
                }
            )

            if cls == PERSON_CLASS_ID:
                person_count += 1
            elif cls == PHONE_CLASS_ID:
                phone_detected = True

        alerts = []
        snapshot_reasons = []

        # --- Person presence tracking ---
        if person_count > 0:
            state.last_person_seen = now
            state.person_absent_alerted = False
        else:
            absent_for = now - state.last_person_seen
            if absent_for >= absence_timeout and not state.person_absent_alerted:
                alerts.append(
                    {
                        "type": "person_absent",
                        "message": f"No person detected for {int(absent_for)}s",
                    }
                )
                state.person_absent_alerted = True
                if now - state.last_absence_snapshot > snapshot_cooldown:
                    snapshot_reasons.append("person_absent")
                    state.last_absence_snapshot = now

        # --- Multiple persons ---
        if person_count > 1:
            alerts.append(
                {
                    "type": "multiple_persons",
                    "message": f"{person_count} persons detected in frame",
                }
            )
            if now - state.last_multi_person_snapshot > snapshot_cooldown:
                snapshot_reasons.append("multiple_persons")
                state.last_multi_person_snapshot = now

        # --- Phone ---
        if phone_detected:
            alerts.append({"type": "phone_detected", "message": "Mobile phone detected"})
            if now - state.last_phone_snapshot > snapshot_cooldown:
                snapshot_reasons.append("phone_detected")
                state.last_phone_snapshot = now

        return {
            "person_count": person_count,
            "phone_detected": phone_detected,
            "detections": detections,
            "alerts": alerts,
            "snapshot_reasons": snapshot_reasons,
        }

    def end_session(self, session_id: str):
        self.sessions.pop(session_id, None)
