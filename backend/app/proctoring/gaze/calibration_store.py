SAMPLES_PER_POINT = 30

CALIBRATION_POINTS = [
    "top_left", "top_center", "top_right",
    "middle_left", "center", "middle_right",
    "bottom_left", "bottom_center", "bottom_right",
]

METRIC_KEYS = [
    "left_horizontal",
    "right_horizontal",
    "left_vertical",
    "right_vertical",
    "yaw",
    "pitch",
    "roll",
]


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
        for key in METRIC_KEYS:
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
        for key in METRIC_KEYS:
            if key in avg:
                name = key.replace("_", " ").title()
                print(f"Average {name}: {avg[key]:.4f}")
        print()
