import base64
import subprocess
import threading
from collections import deque
import time as _time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Optional

import cv2
import numpy as np


def probe_video_duration_seconds(video_path: str) -> float:
    """Return container duration in seconds (float). Tries OpenCV then ffprobe."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Unable to open video: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    nframes = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    cap.release()
    if nframes and float(nframes) > 0 and fps and float(fps) > 0:
        d = float(nframes) / float(fps)
        if d > 1.0:
            return d
    try:
        r = subprocess.run(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                video_path,
            ],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if r.returncode == 0 and r.stdout.strip():
            return float(r.stdout.strip())
    except (FileNotFoundError, subprocess.TimeoutExpired, ValueError):
        pass
    raise ValueError("Could not determine video duration (try installing ffprobe)")


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
    max_frames: Optional[int] = 25,
    include_data_urls: bool = True,
    max_duration_seconds: Optional[float] = None,
    start_seconds: float = 0.0,
) -> list[MotionFrame]:
    """Extract high-motion frames using frame differencing.

    This wraps the standalone extract_tool logic for backend/API use. For the
    live workflow, call the same frame-diff idea on frames from the model stream.

    Decodes ``[start_seconds, start_seconds + max_duration_seconds)`` when
    ``max_duration_seconds`` is set; if ``max_duration_seconds`` is ``None``,
    reads from ``start_seconds`` to end of file.
    """
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Unable to open video: {video_path}")

    output_path = Path(output_dir) if output_dir else None
    if output_path:
        output_path.mkdir(parents=True, exist_ok=True)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    if start_seconds > 0:
        cap.set(cv2.CAP_PROP_POS_MSEC, start_seconds * 1000.0)

    window_end: Optional[float] = None
    if max_duration_seconds is not None:
        window_end = start_seconds + max_duration_seconds

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

            pos_msec = cap.get(cv2.CAP_PROP_POS_MSEC)
            if pos_msec and float(pos_msec) > 0:
                timestamp = float(pos_msec) / 1000.0
            else:
                timestamp = start_seconds + frame_idx / fps

            if window_end is not None and timestamp >= window_end:
                break

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

                data_url = (
                    _frame_to_data_url(frame, jpeg_quality)
                    if include_data_urls
                    else ""
                )
                frames.append(MotionFrame(
                    index=saved_idx,
                    frame_index=frame_idx,
                    timestamp=timestamp,
                    motion_ratio=motion_ratio,
                    data_url=data_url,
                    file_path=file_path,
                ))

                if max_frames is not None and len(frames) >= max_frames:
                    break

            frame_idx += 1
    finally:
        cap.release()

    return frames


def extract_live_motion_frames(
    stream_url: str,
    pixel_diff_threshold: int = 25,
    motion_threshold: float = 0.75,
    cooldown_seconds: float = 1.0,
    jpeg_quality: int = 80,
    callback: Optional[Callable[[MotionFrame], None]] = None,
    stop_event: Optional[threading.Event] = None,
    compare_stride: int = 1,
    sample_interval_seconds: Optional[float] = None,
):
    """Read a network stream, yield MotionFrame via callback on scene change.

    If ``sample_interval_seconds`` is set (e.g. ``2.0``), emits one frame every
    that many wall-clock seconds **without** motion gating (timed screenshots).

    Otherwise uses frame differencing. ``compare_stride``: compare current frame
    to the one this many frames **earlier** (not only consecutive).

    Blocks the calling thread. Designed to be called via asyncio.to_thread().
    """
    cap = cv2.VideoCapture(stream_url)
    if not cap.isOpened():
        raise ValueError(f"Unable to open stream: {stream_url[:80]}")

    # Reduce buffering for lower latency on network streams
    cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    stride = max(1, int(compare_stride))
    gray_ring: deque = deque(maxlen=stride + 1)
    frame_idx = 0
    saved_idx = 0
    last_save_time = -999.0
    consecutive_errors = 0
    start_time = _time.monotonic()
    use_interval = sample_interval_seconds is not None and float(sample_interval_seconds) > 0
    interval = float(sample_interval_seconds) if use_interval else 0.0
    # 首次在「开始后 interval 秒」截第一张，之后每 interval 秒一张（按实际耗时对齐）
    next_sample_at = interval if use_interval else 0.0

    try:
        while not (stop_event and stop_event.is_set()):
            ret, frame = cap.read()
            if not ret:
                consecutive_errors += 1
                if consecutive_errors > 30:
                    print(f"[live-motion] 连续读取失败 {consecutive_errors} 次，退出")
                    break
                _time.sleep(0.1)
                continue
            consecutive_errors = 0

            elapsed = _time.monotonic() - start_time

            if use_interval:
                if elapsed >= next_sample_at:
                    saved_idx += 1
                    next_sample_at = elapsed + interval
                    mf = MotionFrame(
                        index=saved_idx,
                        frame_index=frame_idx,
                        timestamp=elapsed,
                        motion_ratio=1.0,
                        data_url=_frame_to_data_url(frame, jpeg_quality),
                    )
                    if callback:
                        callback(mf)
                frame_idx += 1
                if frame_idx % 300 == 0:
                    print(f"[live-motion] [interval] 已读 {frame_idx} 帧，截图 {saved_idx} 张")
                continue

            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.GaussianBlur(gray, (5, 5), 0)

            gray_ring.append(gray)
            if len(gray_ring) <= stride:
                frame_idx += 1
                continue

            diff = cv2.absdiff(gray_ring[-1], gray_ring[0])

            motion_pixels = np.sum(diff > pixel_diff_threshold)
            motion_ratio = motion_pixels / diff.size
            is_motion = motion_ratio > motion_threshold
            off_cooldown = (elapsed - last_save_time) >= cooldown_seconds

            if is_motion and off_cooldown:
                saved_idx += 1
                last_save_time = elapsed
                mf = MotionFrame(
                    index=saved_idx,
                    frame_index=frame_idx,
                    timestamp=elapsed,
                    motion_ratio=motion_ratio,
                    data_url=_frame_to_data_url(frame, jpeg_quality),
                )
                if callback:
                    callback(mf)

            frame_idx += 1

            if frame_idx % 300 == 0:
                print(f"[live-motion] ... 已处理 {frame_idx} 帧，提取 {saved_idx} 张")
    finally:
        cap.release()
