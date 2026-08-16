import math
import logging

logger = logging.getLogger(__name__)

_METRIC_KEYS = [
    "left_horizontal",
    "right_horizontal",
    "left_vertical",
    "right_vertical",
]

_GAZE_ZONES = [
    "top_left", "top_center", "top_right",
    "middle_left", "center", "middle_right",
    "bottom_left", "bottom_center", "bottom_right",
]

# Only the eye features are used for the gaze comparison — head-pose values
# are not calibrated or compared.
_DEFAULT_WEIGHTS = {
    "left_horizontal": 0.25,
    "right_horizontal": 0.25,
    "left_vertical": 0.25,
    "right_vertical": 0.25,
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
# With the 4-corner calibration grid, the virtual centre expands to ~60% of
# the way toward any corner before a violation fires.
MARGIN_FACTOR = 1.85


class GazeEstimator:
    """
    Compares current eye/head features against a stored calibration profile
    to estimate where the student is looking.

    The comparison uses a weighted Euclidean distance across all 4 eye metrics.
    The closest calibration point (lowest distance) is selected as the
    predicted gaze target.

    This class is stateless — all smoothing/violation tracking should be
    handled by the caller (GazeService).
    """

    def __init__(self, weights: dict[str, float] | None = None, margin_factor: float = MARGIN_FACTOR):
        self.weights = weights or dict(_DEFAULT_WEIGHTS)
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

        profile = calibration_profile
        if profile.get("center") is None:
            centre = self._derive_centre(profile)
            if centre is not None:
                profile = {**profile, "center": centre}

        for point_name, point_data in profile.items():
            if point_name not in _GAZE_ZONES:
                continue

            diff_sum = 0.0
            total_weight = 0.0

            for key, weight in self.weights.items():
                expected = point_data.get(key)
                actual = current_features.get(key)
                if expected is not None and actual is not None:
                    diff = actual - expected
                    diff_sum += weight * diff * diff
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

    @staticmethod
    def _derive_centre(profile: dict) -> dict | None:
        """Derive a virtual centre point from the 4 corner calibration points.

        Only the corners are calibrated; the centre reference is the mean of
        the corner feature values, which the margin logic below uses so that a
        student looking at screen centre is not flagged as gazing away.
        """
        corners = [
            profile[pn]
            for pn in ("top_left", "top_right", "bottom_left", "bottom_right")
            if pn in profile
        ]
        if not corners:
            return None
        return {
            key: sum(p[key] for p in corners if p.get(key) is not None)
            / sum(1 for p in corners if p.get(key) is not None)
            for key in _METRIC_KEYS
            if sum(1 for p in corners if p.get(key) is not None) > 0
        }

    def compare_unsafe(self, current_features: dict) -> dict | None:
        """
        Estimate gaze direction without calibration using raw head-pose YAW only.
        Returns a coarse horizontal zone (center / middle_left / middle_right)
        or None when yaw is unavailable.
        """
        yaw = current_features.get("yaw")

        if yaw is None:
            return None

        if yaw > 28:
            zone = "middle_left"
        elif yaw < -28:
            zone = "middle_right"
        else:
            zone = "center"

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
        # Calibrated to the typical feature-space spacing between calibration
        # points (~5 units): a perfect match scores 1.0, a half-way-toward-the
        # next-point gaze scores ~0.5, and being clearly on the adjacent point
        # scores ~0.25.
        c = math.exp(-distance / 5.0)
        return max(0.0, min(1.0, c))
