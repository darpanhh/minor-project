SAMPLES_PER_POINT = 20

EYE_POINTS = [
    "top_left", "top_right",
    "bottom_left", "bottom_right",
]

HEAD_POINTS = [
    "head_forward",
    "head_left",
    "head_right",
]

CALIBRATION_POINTS = EYE_POINTS + HEAD_POINTS

EYE_METRIC_KEYS = [
    "left_horizontal",
    "right_horizontal",
    "left_vertical",
    "right_vertical",
]

HEAD_METRIC_KEYS = [
    "yaw",
    "pitch",
    "roll",
]


def metric_keys_for(point):
    if point in HEAD_POINTS:
        return HEAD_METRIC_KEYS
    return EYE_METRIC_KEYS


class CalibrationStore:

    def __init__(self):
        self._samples = {p: [] for p in CALIBRATION_POINTS}
        self._averages = {}

    @property
    def averages(self):
        return dict(self._averages)

    def add_sample(self, point, features):

        if point not in self._samples:
            return

        if len(self._samples[point]) >= SAMPLES_PER_POINT:
            return

        sample = {}
        for key in metric_keys_for(point):
            val = features.get(key)
            if val is not None:
                sample[key] = val

        if not sample:
            return

        self._samples[point].append(sample)

        if len(self._samples[point]) == SAMPLES_PER_POINT:
            self._compute_average(point)

    def sample_count(self, point):
        return len(self._samples.get(point, []))

    def is_point_complete(self, point):
        return self.sample_count(point) >= SAMPLES_PER_POINT

    def _compute_average(self, point):
        samples = self._samples[point]
        n = len(samples)

        keys = samples[0].keys()
        avg = {key: sum(s[key] for s in samples) / n for key in keys}

        self._averages[point] = avg

        print(f"Calibration point completed: {point}")
        for key in metric_keys_for(point):
            if key in avg:
                name = key.replace("_", " ").title()
                print(f"Average {name}: {avg[key]:.4f}")
        print()
