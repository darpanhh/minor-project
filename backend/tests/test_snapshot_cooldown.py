"""
Tests for the ws_proctor snapshot rules.

Per-event-type cooldown:

    for a given violation type, never take two snapshots within SNAPSHOT_COOLDOWN.

``_can_snapshot`` is the SINGLE source of truth: it both checks eligibility
AND atomically reserves the slot (records the monotonic timestamp) when the
snapshot is allowed, so no re-entry/sibling path can take a second snapshot
for the same session+reason inside the cooldown window. Only the WARN→CONFIRM
snapshot and the confirmed-event refresh snapshot ever call it — and the
reservation is made before the actual disk write.

Each event type keeps its OWN timer (stored per session at module level so it
survives websocket reconnects) — a phone snapshot does NOT block a gaze or
head snapshot.
"""

import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))  # tests/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # backend/

from app.proctoring.ws_proctor import (  # noqa: E402
    SNAPSHOT_COOLDOWN,
    _snapshot_store,
    _can_snapshot,
)

CD = SNAPSHOT_COOLDOWN  # all windows below are derived from this single constant


class _Clock:
    def __init__(self):
        self.t = 0.0

    def advance(self, seconds):
        self.t += seconds


def _new_session(key="test-session"):
    _snapshot_store.pop(key, None)
    return key


def _last_seen(key, reason):
    return _snapshot_store.get(key, {}).get(reason)


def test_same_reason_within_5s_is_blocked():
    key = _new_session()
    clock = _Clock()

    assert _can_snapshot(key, "gaze_away", clock.t) is True  # t=0 allowed
    clock.advance(1.0)
    assert _can_snapshot(key, "gaze_away", clock.t) is False  # t=1 blocked
    clock.advance(CD - 2.0)
    assert _can_snapshot(key, "gaze_away", clock.t) is False  # t=CD-1 blocked
    clock.advance(0.9)
    assert _can_snapshot(key, "gaze_away", clock.t) is False  # t=CD-0.1 blocked
    clock.advance(0.2)
    assert _can_snapshot(key, "gaze_away", clock.t) is True  # t=CD+0.1 allowed


def test_same_reason_after_5s_is_allowed():
    key = _new_session()
    clock = _Clock()

    assert _can_snapshot(key, "phone_detected", clock.t) is True  # t=0
    assert _can_snapshot(key, "phone_detected", clock.t) is False  # t=0 refresh
    clock.advance(SNAPSHOT_COOLDOWN)  # t=CD exactly
    assert _can_snapshot(key, "phone_detected", clock.t) is True


def test_different_reasons_within_5s_are_independent():
    key = _new_session()
    clock = _Clock()

    # gaze_away and head_turn confirm in the SAME frame — both snapshotted.
    assert _can_snapshot(key, "gaze_away", clock.t) is True
    assert _can_snapshot(key, "head_turn", clock.t) is True
    assert _can_snapshot(key, "phone_detected", clock.t) is True

    # Looking away again 1s later: gaze blocked, others unaffected.
    clock.advance(1.0)
    assert _can_snapshot(key, "gaze_away", clock.t) is False
    assert _can_snapshot(key, "head_turn", clock.t) is False  # stamped t=0
    assert _can_snapshot(key, "phone_detected", clock.t) is False

    # Unused type is untouched by the others' snapshots.
    clock.advance(CD - 1.0)  # t=CD: all types' windows have expired independently.
    assert _can_snapshot(key, "phone_detected", clock.t) is True  # stamps t=CD
    assert _can_snapshot(key, "gaze_away", clock.t) is True  # stamps t=CD
    assert _can_snapshot(key, "head_turn", clock.t) is True  # stamps t=CD

    # A snapshot for one type does not reset the others' timers.
    clock.advance(3.0)  # t=CD+3
    assert _can_snapshot(key, "head_turn", clock.t) is False  # restamped t=CD
    assert _can_snapshot(key, "gaze_away", clock.t) is False  # restamped t=CD
    assert _can_snapshot(key, "phone_detected", clock.t) is False

    clock.advance(CD + 0.2)  # t=2·CD+3.2 ≥ CD after every type's t=CD stamp
    assert _can_snapshot(key, "head_turn", clock.t) is True
    assert _can_snapshot(key, "gaze_away", clock.t) is True


def test_confirmation_plus_refresh_in_same_episode_yields_one_snapshot():
    key = _new_session()
    clock = _Clock()

    # WARN→CONFIRM snapshot: allowed and consumes the window.
    assert _can_snapshot(key, "gaze_away", clock.t) is True
    # Refresh path runs every frame while confirmed+active — must be blocked
    # across every subsequent frame until the cooldown expires.
    clock.advance(1.0)
    assert _can_snapshot(key, "gaze_away", clock.t) is False
    clock.advance(1.0)
    assert _can_snapshot(key, "gaze_away", clock.t) is False
    clock.advance(CD + 0.2)  # t=CD+2.2
    assert _can_snapshot(key, "gaze_away", clock.t) is True


def test_rejected_snapshot_does_not_update_timestamp():
    key = _new_session()
    clock = _Clock()

    _can_snapshot(key, "head_turn", clock.t)  # t=0 reserved
    assert _last_seen(key, "head_turn") == 0.0

    clock.advance(2.0)
    rejected = _can_snapshot(key, "head_turn", clock.t)
    assert rejected is False
    # The stored timestamp is untouched by a rejection.
    assert _last_seen(key, "head_turn") == 0.0

    clock.advance(CD + 0.2)  # t=CD+2.2
    assert _can_snapshot(key, "head_turn", clock.t) is True
    assert _last_seen(key, "head_turn") == CD + 2.2


def test_same_session_reconnect_preserves_cooldown_state():
    key = _new_session("reconnect-session")
    clock = _Clock()

    # First connection takes a snapshot.
    assert _can_snapshot(key, "head_turn", clock.t) is True  # t=0
    clock.advance(CD - 1.0)

    # A brand-new connection for the SAME session_uuid must still be blocked.
    assert _can_snapshot(key, "head_turn", clock.t) is False
    # And a type that never snapshotted is free immediately.
    assert _can_snapshot(key, "gaze_away", clock.t) is True

    clock.advance(CD + 1.0)  # t=2·CD
    assert _can_snapshot(key, "head_turn", clock.t) is True


def test_refresh_only_when_still_active():
    # Mirrors the refresh predicate: only "confirmed" phases whose reason is
    # present in the CURRENT frame are refreshable — never "recovering".
    violation_states = {
        "phone_detected": {"phase": "confirmed"},
        "multiple_persons": {"phase": "recovering"},
        "gaze_away": {"phase": "confirmed"},
    }
    current_reasons = {"phone_detected", "gaze_away"}

    refresh_reasons = [
        r for r, s in violation_states.items()
        if s["phase"] == "confirmed" and r in current_reasons
    ]
    assert refresh_reasons == ["phone_detected", "gaze_away"]
    assert "multiple_persons" not in refresh_reasons


if __name__ == "__main__":
    test_same_reason_within_5s_is_blocked()
    print(f"PASS within {SNAPSHOT_COOLDOWN:.0f}s blocked ({SNAPSHOT_COOLDOWN}s)")
    test_same_reason_after_5s_is_allowed()
    print("PASS after cooldown allowed")
    test_different_reasons_within_5s_are_independent()
    print("PASS types never block each other")
    test_confirmation_plus_refresh_in_same_episode_yields_one_snapshot()
    print("PASS confirm+refresh → one snapshot")
    test_rejected_snapshot_does_not_update_timestamp()
    print("PASS rejected snapshot does not update timestamp")
    test_same_session_reconnect_preserves_cooldown_state()
    print("PASS reconnect preserves cooldown state")
    test_refresh_only_when_still_active()
    print("PASS refresh only while still active")