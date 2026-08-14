import math
import logging

logger = logging.getLogger(__name__)

_METRIC_KEYS = [
    "left_horizontal",
    "right_horizontal",
    "left_vertical",
    "right_vertical",
    "yaw",
    "pitch",
    "roll",
]

_GAZE_ZONES = [
    "top_left", "top_center", "top_right",
    "middle_left", "center", "middle_right",
    "bottom_left", "bottom_center", "bottom_right",
]

_DEFAULT_WEIGHTS = {
    "left_horizontal": 0.20,
    "right_horizontal": 0.20,
    "left_vertical": 0.12,
    "right_vertical": 0.12,
    "yaw": 0.18,
    "pitch": 0.14,
    "roll": 0.04,
}

# Per-metric normalisation scale used to bring every feature onto a
# comparable ~[0,1] scale before the weighted Euclidean distance is
# computed.
#
# This is the key to accurate gaze classification.  Raw eye-iris ratios
# live in [0, 1] while head angles live in degrees, so without scaling a
# small head rotation (a few degrees) swamps the eye-gaze signal entirely
# and the "closest point" is decided almost purely by yaw/pitch.  With
# these scales a deviation of one scale unit along any metric contributes
# equally, so the iris position actually moves the classification.
_METRIC_SCALES = {
    "left_horizontal": 0.20,
    "right_horizontal": 0.20,
    "left_vertical": 0.15,
    "right_vertical": 0.15,
    "yaw": 25.0,
    "pitch": 20.0,
    "roll": 15.0,
}

# Tolerance margin applied around the centre calibration point.
#
# The estimator first finds the closest calibration point (best point). If the
# best point is an "away" zone but the current features are also close to the
# centre point (i.e. distance_to_centre <= MARGIN_FACTOR * distance_to_best),
# the point is treated as "centre" instead.
#
# This gives a comfortable buffer so that slightly looking up, down, left or
# right of centre does NOT immediately get flagged as a gaze-away violation.
# Only when the student clearly commits to an edge/away zone (a much larger
# distance to centre than to the away point) does the violation trigger.
#
# The geometric interpretation: with the 3x3 calibration grid, the centre zone
# expands to ~60% of the way toward any adjacent zone before a violation fires.
MARGIN_FACTOR = 1.85


class GazeEstimator:
    """
    Compares current eye/head features against a stored calibration profile
    to estimate where the student is looking.

    The comparison uses a weighted Euclidean distance across all 7 metrics.
    The closest calibration point (lowest distance) is selected as the
    predicted gaze target.

    This class is stateless — all smoothing/violation tracking should be
    handled by the caller (GazeService).
    """

    def __init__(self, weights: dict[str, float] | None = None, margin_factor: float = MARGIN_FACTOR):
        self.weights = weights or dict(_DEFAULT_WEIGHTS)
        self.metric_scales = dict(_METRIC_SCALES)
        self.margin_factor = margin_factor

    def compare(self, calibration_profile: dict, current_features: dict) -> dict:
        """
        Compute weighted distance to every stored calibration point.

        Parameters
        ----------
        calibration_profile : dict
            { point_name: { left_horizontal: ..., right_horizontal: ..., ... } }
        current_features : dict
            { left_horizontal: ..., right_horizontal: ..., yaw: ..., etc. }

        Returns
        -------
        dict
            {
                "point": "center",           # closest calibration point
                "confidence": 0.87,           # [0, 1]
                "distances": { point: dist, ... },
                "all_scores": [ { point, distance, confidence }, ... ]
            }
        """
        distances: dict[str, float] = {}

        for point_name, point_data in calibration_profile.items():
            if point_name not in _GAZE_ZONES:
                continue

            diff_sum = 0.0
            total_weight = 0.0

            for key, weight in self.weights.items():
                expected = point_data.get(key)
                actual = current_features.get(key)
                if expected is not None and actual is not None:
                    diff = actual - expected
                    scale = self.metric_scales.get(key, 1.0)
                    if scale <= 0:
                        scale = 1.0
                    norm_diff = diff / scale
                    diff_sum += weight * norm_diff * norm_diff
                    total_weight += weight

            if total_weight > 0:
                distances[point_name] = math.sqrt(diff_sum / total_weight)
            else:
                distances[point_name] = float("inf")

        if not distances:
            return {
                "point": "unknown",
                "confidence": 0.0,
                "distances": {},
                "all_scores": [],
            }

        best_point = min(distances, key=distances.get)
        best_dist = distances[best_point]

        # ── Apply centre tolerance margin ──────────────────────────
        # If the closest point is an "away" zone but the current features are
        # still reasonably close to the calibrated centre point, classify the
        # gaze as "centre" so that slight deviations are not flagged.
        margin_override = False
        if best_point != "center":
            d_center = distances.get("center")
            if d_center is not None and best_dist > 0 and d_center <= best_dist * self.margin_factor:
                best_point = "center"
                margin_override = True
                best_dist = d_center

        all_scores = []
        for pn, d in sorted(distances.items(), key=lambda x: x[1]):
            c = self._distance_to_confidence(d)
            all_scores.append({"point": pn, "distance": d, "confidence": c})

        if margin_override:
            # Borderline classification: express confidence as how much closer
            # the current features are to centre than to the nearest away zone.
            # Equidistant -> ~0.5, increasingly off-centre -> lower.
            d_center = best_dist
            nearest_away = min(
                (d for pn, d in distances.items() if pn != "center"),
                default=0.0,
            )
            confidence = max(0.0, min(1.0, 1.0 - d_center / (d_center + nearest_away)))
        else:
            confidence = self._distance_to_confidence(best_dist)

        logger.debug(
            "GazeEstimator: point=%s dist=%.4f conf=%.3f",
            best_point, best_dist, confidence,
        )

        return {
            "point": best_point,
            "confidence": confidence,
            "distances": distances,
            "all_scores": all_scores,
        }

    def compare_unsafe(self, current_features: dict) -> dict | None:
        """
        Estimate gaze direction without calibration using raw head pose thresholds.
        Returns a coarse zone (center / left / right / up / down) or None.
        Used only when no calibration profile is available.
        """
        yaw = current_features.get("yaw")
        pitch = current_features.get("pitch")

        if yaw is None or pitch is None:
            return None

        zone = "center"

        if yaw > 28:
            zone = "middle_left"
        elif yaw < -28:
            zone = "middle_right"

        if pitch > 25:
            if zone == "center":
                zone = "top_center"
            elif zone == "middle_left":
                zone = "top_left"
            elif zone == "middle_right":
                zone = "top_right"
        elif pitch < -32:
            if zone == "center":
                zone = "bottom_center"
            elif zone == "middle_left":
                zone = "bottom_left"
            elif zone == "middle_right":
                zone = "bottom_right"

        return {
            "point": zone,
            "confidence": 0.5,
            "distances": {},
            "all_scores": [],
        }

    @staticmethod
    def _distance_to_confidence(distance: float) -> float:
        if distance == float("inf"):
            return 0.0
        # The feature-space distance is normalised so that one scale unit
        # corresponds to a meaningful deviation along a single metric and a
        # full step toward an adjacent calibration point is ~1.0-2.0 units.
        # A perfect match scores 1.0, half-way-toward-the-next-point scores
        # ~0.5, and being clearly on the adjacent point scores ~0.25.
        c = math.exp(-distance / 1.5)
        return max(0.0, min(1.0, c))
