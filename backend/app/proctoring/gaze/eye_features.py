from .landmarks import (
    LEFT_IRIS, RIGHT_IRIS,
    LEFT_EYE_LEFT, LEFT_EYE_RIGHT,
    RIGHT_EYE_LEFT, RIGHT_EYE_RIGHT,
    LEFT_UPPER, LEFT_LOWER,
    RIGHT_UPPER, RIGHT_LOWER,
    NOSE_TIP,
)


def compute_center(points):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


class EyeFeatureExtractor:

    def extract(self, face):

        landmarks = face.landmark

        iris_points = {
            "left": [(landmarks[i].x, landmarks[i].y) for i in LEFT_IRIS],
            "right": [(landmarks[i].x, landmarks[i].y) for i in RIGHT_IRIS],
        }

        left_center = compute_center(iris_points["left"])
        right_center = compute_center(iris_points["right"])

        left_corner_left = (landmarks[LEFT_EYE_LEFT].x, landmarks[LEFT_EYE_LEFT].y)
        left_corner_right = (landmarks[LEFT_EYE_RIGHT].x, landmarks[LEFT_EYE_RIGHT].y)
        right_corner_left = (landmarks[RIGHT_EYE_LEFT].x, landmarks[RIGHT_EYE_LEFT].y)
        right_corner_right = (landmarks[RIGHT_EYE_RIGHT].x, landmarks[RIGHT_EYE_RIGHT].y)

        left_upper = (landmarks[LEFT_UPPER].x, landmarks[LEFT_UPPER].y)
        left_lower = (landmarks[LEFT_LOWER].x, landmarks[LEFT_LOWER].y)
        right_upper = (landmarks[RIGHT_UPPER].x, landmarks[RIGHT_UPPER].y)
        right_lower = (landmarks[RIGHT_LOWER].x, landmarks[RIGHT_LOWER].y)

        left_h = (
            (left_center[0] - left_corner_left[0])
            / (left_corner_right[0] - left_corner_left[0])
        )
        right_h = (
            (right_center[0] - right_corner_left[0])
            / (right_corner_right[0] - right_corner_left[0])
        )

        left_v = (
            (left_center[1] - left_upper[1])
            / (left_lower[1] - left_upper[1])
        )
        right_v = (
            (right_center[1] - right_upper[1])
            / (right_lower[1] - right_upper[1])
        )

        return {
            "left_horizontal": left_h,
            "right_horizontal": right_h,
            "left_vertical": left_v,
            "right_vertical": right_v,
        }
