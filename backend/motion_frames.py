import base64
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

import cv2
import numpy as np


@dataclass
class MotionFrame:
    index: int
    frame_index: int
    timestamp: float
    motion_ratio: float
    data_url: str
    file_path: Optional[str] = None


def _frame_to_data_url(frame, jpeg_quality: int) -> str:
    ok, buffer = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
    if not ok:
        raise ValueError("Failed to encode motion frame as JPEG")
    encoded = base64.b64encode(buffer.tobytes()).decode("ascii")
    return f"data:image/jpeg;base64,{encoded}"


def extract_motion_frames(
    video_path: str,
    output_dir: Optional[str] = None,
    pixel_diff_threshold: int = 25,
    motion_threshold: float = 0.75,
    cooldown_seconds: float = 0.2,
    jpeg_quality: int = 85,
    max_frames: int = 25,
) -> list[MotionFrame]:
    """Extract high-motion frames using frame differencing.

    This wraps the standalone extract_tool logic for backend/API use. For the
    live workflow, call the same frame-diff idea on frames from the model stream.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Unable to open video: {video_path}")

    output_path = Path(output_dir) if output_dir else None
    if output_path:
        output_path.mkdir(parents=True, exist_ok=True)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    prev_gray = None
    frame_idx = 0
    saved_idx = 0
    last_save_time = -999.0
    frames: list[MotionFrame] = []

    try:
        while True:
            ret, frame = cap.read()
            if not ret:
                break

            timestamp = frame_idx / fps
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (5, 5), 0)

            if prev_gray is None:
                prev_gray = gray
                frame_idx += 1
                continue

            diff = cv2.absdiff(gray, prev_gray)
            prev_gray = gray

            motion_pixels = np.sum(diff > pixel_diff_threshold)
            motion_ratio = motion_pixels / diff.size
            is_motion = motion_ratio > motion_threshold
            off_cooldown = (timestamp - last_save_time) >= cooldown_seconds

            if is_motion and off_cooldown:
                saved_idx += 1
                last_save_time = timestamp
                file_path = None

                if output_path:
                    time_str = f"{int(timestamp // 60):02d}{int(timestamp % 60):02d}"
                    file_path = str(output_path / f"{saved_idx:04d}_t{time_str}_motion{motion_ratio:.0%}.jpg")
                    cv2.imwrite(file_path, frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])

                frames.append(MotionFrame(
                    index=saved_idx,
                    frame_index=frame_idx,
                    timestamp=timestamp,
                    motion_ratio=motion_ratio,
                    data_url=_frame_to_data_url(frame, jpeg_quality),
                    file_path=file_path,
                ))

                if len(frames) >= max_frames:
                    break

            frame_idx += 1
    finally:
        cap.release()

    return frames
