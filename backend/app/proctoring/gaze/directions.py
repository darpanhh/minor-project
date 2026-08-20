"""Simple, human-readable directional states for head and eyes.

Maps raw head-pose angles and iris-offset metrics to one of:
    center | left | right | up | down | not_detected

Head and eye directions are computed independently — the eyes can look in one
direction while the head stays centered, so they are reported separately.
"""

# Head angle (degrees) beyond which the head counts as turned away from centre.
_HEAD_ANGLE_THRESHOLD = 20.0

# Normalised iris offset (0..1, 0.5 = centre) beyond which the eyes count as
# looking away from centre. 0.22 matches the natural eye movement range seen in
# real captures (iris rarely drifts past ~0.7/0.3 when looking at the screen),
# while still flagging genuine off-screen looks.
_EYE_OFFSET_THRESHOLD = 0.22


def iris_offset(features: dict) -> tuple[float, float] | None:
    """Average iris offset of both eyes → (horizontal, vertical).

    Both horizontal metrics are normalised the same way: 0 = pupil at the
    image-left corner of its socket, 1 = image-right corner. When the student
    looks to one side, BOTH pupils drift the same way in the image, so the
    two metrics move together and are averaged directly — no inversion.
    """
    lh = features.get("left_horizontal")
    rh = features.get("right_horizontal")
    lv = features.get("left_vertical")
    rv = features.get("right_vertical")

    if lh is None or rh is None or lv is None or rv is None:
        return None

    return ((lh + rh) / 2.0, (lv + rv) / 2.0)


def head_direction(yaw: float | None, pitch: float | None) -> str:
    """Map head yaw/pitch (degrees) to a simple direction.

    Positive yaw = head turned to the student's right (nose points image-left).
    Negative yaw = head turned to the student's left (nose points image-right).
    Positive pitch = head tilted down (chin toward chest).
    """
    if yaw is None or pitch is None:
        return "not_detected"

    if yaw > _HEAD_ANGLE_THRESHOLD:
        return "right"
    if yaw < -_HEAD_ANGLE_THRESHOLD:
        return "left"
    if pitch > _HEAD_ANGLE_THRESHOLD:
        return "down"
    if pitch < -_HEAD_ANGLE_THRESHOLD:
        return "up"
    return "center"


def eye_direction(features: dict) -> str:
    """Map the iris-offset metrics to a simple direction.

    Both horizontal metrics are 0 when the pupil sits at the image-left corner
    of its socket and 1 at the image-right corner. When the student looks to
    THEIR left, both pupils drift toward 1 — so 1 maps to "left" (student's
    perspective, matching the calibration labels).
    """
    offset = iris_offset(features)
    if offset is None:
        return "not_detected"

    h, v = offset

    if h > 0.5 + _EYE_OFFSET_THRESHOLD:
        return "left"
    if h < 0.5 - _EYE_OFFSET_THRESHOLD:
        return "right"
    if v < 0.5 - _EYE_OFFSET_THRESHOLD:
        return "up"
    if v > 0.5 + _EYE_OFFSET_THRESHOLD:
        return "down"
    return "center"


def eye_zone(features: dict) -> str:
    """Coarse 3x3 gaze zone from the iris metrics (center, middle_left, ...).

    Used by the uncalibrated gaze fallback so eye direction is estimated from
    the iris position itself — never from the head yaw.
    """
    offset = iris_offset(features)
    if offset is None:
        return "unknown"

    h, v = offset

    col = "center"
    if h > 0.5 + _EYE_OFFSET_THRESHOLD:
        col = "left"
    elif h < 0.5 - _EYE_OFFSET_THRESHOLD:
        col = "right"

    row = "middle"
    if v < 0.5 - _EYE_OFFSET_THRESHOLD:
        row = "top"
    elif v > 0.5 + _EYE_OFFSET_THRESHOLD:
        row = "bottom"

    if row == "middle":
        if col == "center":
            return "center"
        return f"middle_{col}"
    return f"{row}_{col}"


# Extra distance beyond the calibrated on-screen region before the eyes count
# as looking away. Real iris offsets barely move (even screen-corner looks only
# span ~0.44-0.49 horizontally), so an absolute 0.5-based threshold never
# fires; a small relative margin beyond each student's own corners does.
_CALIBRATED_AWAY_MARGIN = 0.05


def eye_zone_calibrated(features: dict, profile: dict) -> str:
    """Gaze zone relative to the student's calibrated screen region.

    The 4 eye-corner calibration points define the on-screen iris-offset range
    for THAT student. Looking beyond that range (plus a small margin) means the
    eyes have left the screen. Falls back to the absolute eye_zone when the
    profile has no usable corner points.
    """
    offset = iris_offset(features)
    if offset is None:
        return "unknown"

    corners = [
        profile[pn]
        for pn in ("top_left", "top_right", "bottom_left", "bottom_right")
        if pn in profile and profile[pn]
    ]
    if not corners:
        return eye_zone(features)

    def avg(p, k):
        vals = [p.get(f"{side}_{k}") for side in ("left", "right")]
        vals = [v for v in vals if v is not None]
        return sum(vals) / len(vals) if vals else None

    hs = [avg(p, "horizontal") for p in corners]
    vs = [avg(p, "vertical") for p in corners]
    hs = [v for v in hs if v is not None]
    vs = [v for v in vs if v is not None]
    if not hs or not vs:
        return eye_zone(features)

    h_lo, h_hi = min(hs), max(hs)
    v_lo, v_hi = min(vs), max(vs)

    h, v = offset
    margin = _CALIBRATED_AWAY_MARGIN

    col = "center"
    if h > h_hi + margin:
        col = "left"      # beyond the screen's left edge (student's left)
    elif h < h_lo - margin:
        col = "right"

    row = "middle"
    if v < v_lo - margin:
        row = "top"
    elif v > v_hi + margin:
        row = "bottom"

    if row == "middle":
        if col == "center":
            return "center"
        return f"middle_{col}"
    if col == "center":
        return f"{row}_center"
    return f"{row}_{col}"


def zone_to_direction(zone: str) -> str:
    """Map a 3x3 gaze zone to the simple display direction."""
    if zone in ("unknown", "not_detected"):
        return "not_detected"
    if "left" in zone:
        return "left"
    if "right" in zone:
        return "right"
    if "top" in zone:
        return "up"
    if "bottom" in zone:
        return "down"
    return "center"