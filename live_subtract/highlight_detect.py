"""Live OpenCV highlight detector.

Spawns ffmpeg to dump JPG frames at a low FPS into a temp directory, then runs a
frame-differencing motion detector and POSTs `{timestamp, motionRatio}` to the
backend /api/highlights endpoint whenever a "highlight" is detected.

The backend is responsible for:
  1. Building a short LLM prompt from the highlight + recent subtitle context.
  2. Calling the LLM and broadcasting the reply over /api/ws/highlights with a
     `deliverAfterMs` budget so the frontend can play the avatar reaction
     synchronized with the user's delayed playback.
"""

from __future__ import annotations

import argparse
import contextlib
import json
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib import error, request

import cv2
import numpy as np
from imageio_ffmpeg import get_ffmpeg_exe


def resolve_video_stream_url(url: str, js_runtime: str | None) -> str:
    """Resolve a YouTube live URL into a direct media URL via yt_dlp.

    We prefer a low-resolution stream because OpenCV motion diff doesn't need
    HD and lower bitrate keeps ffmpeg latency minimal.
    """
    format_candidates = [
        # Try smallest-first to keep ffmpeg + decode cheap.
        "worstvideo[ext=mp4]/worst[ext=mp4]/worst",
        "best[ext=mp4]/best",
        "best",
    ]

    last_error = ""
    for fmt in format_candidates:
        cmd = [sys.executable, "-m", "yt_dlp", "-f", fmt, "--get-url"]
        if js_runtime:
            cmd.extend(["--js-runtimes", js_runtime])
        cmd.append(url)
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            urls = [line.strip() for line in result.stdout.splitlines() if line.strip()]
            if urls:
                # yt_dlp may emit two lines (video + audio); we want the video one.
                return urls[0]
        last_error = (result.stderr or result.stdout or "").strip()

    if last_error:
        raise RuntimeError(last_error.splitlines()[-1])
    raise RuntimeError("Could not resolve live video stream URL.")


def start_frame_capture(
    ffmpeg_path: str,
    stream_url: str,
    fps: float,
    width: int,
    temp_dir: Path,
) -> subprocess.Popen[str]:
    """Spawn ffmpeg dumping a sequence of JPGs at `fps` to `temp_dir`."""
    pattern = str(temp_dir / "frame_%06d.jpg")
    cmd = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-reconnect",
        "1",
        "-reconnect_streamed",
        "1",
        "-reconnect_delay_max",
        "2",
        "-i",
        stream_url,
        "-vf",
        f"fps={fps},scale={width}:-2",
        "-q:v",
        "5",
        "-y",
        pattern,
    ]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def post_json(url: str, payload: dict, timeout_seconds: float) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = request.Request(
        url=url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with request.urlopen(req, timeout=timeout_seconds) as resp:
        body = resp.read().decode("utf-8")
    return json.loads(body) if body else {}


def compute_motion_ratio(prev_gray: np.ndarray, gray: np.ndarray, pixel_diff_threshold: int) -> float:
    diff = cv2.absdiff(gray, prev_gray)
    motion_pixels = int(np.sum(diff > pixel_diff_threshold))
    return motion_pixels / float(diff.size or 1)


def stream_live_highlights(
    url: str,
    fps: float,
    frame_width: int,
    pixel_diff_threshold: int,
    motion_threshold: float,
    cooldown_seconds: float,
    agent_url: str | None,
    active_sport: str,
    persona: str,
    agent_timeout_seconds: float,
    js_runtime: str | None,
) -> None:
    ffmpeg_path = get_ffmpeg_exe()

    print(f"[highlight] Listening to: {url}")
    print(f"[highlight] FPS={fps}, width={frame_width}px, motion>={motion_threshold:.2f}, cooldown={cooldown_seconds}s")
    if agent_url:
        print(f"[highlight] Agent endpoint: {agent_url}")
    else:
        print("[highlight] Agent forwarding: disabled (dry run)")
    print("[highlight] Press Ctrl+C to stop.\n")

    stream_url = ""
    stream_resolved_at = 0.0
    capture_proc: subprocess.Popen[str] | None = None
    processed_files: set[Path] = set()
    prev_gray: np.ndarray | None = None
    last_highlight_at = -1e9

    with tempfile.TemporaryDirectory(prefix="live_highlight_") as tmp:
        temp_dir = Path(tmp)

        while True:
            cycle_started = time.time()
            try:
                # Refresh stream URL periodically (live media URLs expire after a while).
                if (not stream_url) or (time.time() - stream_resolved_at > 90):
                    stream_url = resolve_video_stream_url(url, js_runtime)
                    stream_resolved_at = time.time()
                    processed_files.clear()
                    prev_gray = None

                    if capture_proc and capture_proc.poll() is None:
                        capture_proc.terminate()
                        with contextlib.suppress(Exception):
                            capture_proc.wait(timeout=1.5)
                    capture_proc = start_frame_capture(
                        ffmpeg_path=ffmpeg_path,
                        stream_url=stream_url,
                        fps=fps,
                        width=frame_width,
                        temp_dir=temp_dir,
                    )

                if (capture_proc is None) or (capture_proc.poll() is not None):
                    stream_url = ""
                    raise RuntimeError("frame capture process stopped; retrying")

                # Take all but the freshest file (ffmpeg may still be writing it).
                all_files = sorted(temp_dir.glob("frame_*.jpg"))
                ready = all_files[:-1] if len(all_files) > 1 else []

                for jpg_path in ready:
                    if jpg_path in processed_files:
                        continue
                    processed_files.add(jpg_path)

                    frame = cv2.imread(str(jpg_path), cv2.IMREAD_COLOR)
                    if frame is None:
                        continue
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    gray = cv2.GaussianBlur(gray, (5, 5), 0)

                    if prev_gray is None:
                        prev_gray = gray
                        continue

                    ratio = compute_motion_ratio(prev_gray, gray, pixel_diff_threshold)
                    prev_gray = gray

                    now = time.time()
                    cooled_down = (now - last_highlight_at) >= cooldown_seconds
                    if ratio >= motion_threshold and cooled_down:
                        last_highlight_at = now
                        print(f"{time.strftime('%H:%M:%S')} | HIGHLIGHT motion={ratio:.3f}")
                        if agent_url:
                            payload = {
                                "timestamp": now,
                                "motionRatio": ratio,
                                "activeSport": active_sport,
                                "persona": persona,
                                "source": "highlight_detect",
                            }
                            try:
                                post_json(agent_url, payload, timeout_seconds=agent_timeout_seconds)
                            except (error.URLError, TimeoutError, Exception) as exc:
                                print(f"{time.strftime('%H:%M:%S')} | agent error: {exc}")

                    # Keep the temp dir from filling up.
                    with contextlib.suppress(Exception):
                        jpg_path.unlink()

                # Drain processed_files entries that no longer exist on disk.
                processed_files = {p for p in processed_files if p.exists()}

            except subprocess.CalledProcessError as exc:
                stream_url = ""
                stderr = (exc.stderr or "").strip()
                message = stderr.splitlines()[-1] if stderr else f"command failed ({exc.returncode})"
                print(f"{time.strftime('%H:%M:%S')} | media error: {message}")
            except Exception as exc:
                print(f"{time.strftime('%H:%M:%S')} | error: {exc}")

            elapsed = time.time() - cycle_started
            time.sleep(max(0.0, (1.0 / max(fps, 0.5)) - elapsed))


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Detect live highlight moments via OpenCV motion diff and POST them to the backend."
    )
    parser.add_argument("url", help="YouTube live URL")
    parser.add_argument("--fps", type=float, default=2.0, help="Frame sampling rate (default: 2)")
    parser.add_argument("--width", type=int, default=480, help="Frame width for diff (default: 480)")
    parser.add_argument(
        "--pixel-diff-threshold",
        type=int,
        default=25,
        help="Pixel-level absdiff threshold (default: 25)",
    )
    parser.add_argument(
        "--motion-threshold",
        type=float,
        default=0.18,
        help="Fraction of pixels that must change to count as a highlight (default: 0.18)",
    )
    parser.add_argument(
        "--cooldown-seconds",
        type=float,
        default=10.0,
        help="Min seconds between highlights to avoid spam (default: 10)",
    )
    parser.add_argument(
        "--agent-url",
        default="http://127.0.0.1:8000/api/highlights",
        help="Backend agent endpoint URL. Empty string disables forwarding.",
    )
    parser.add_argument("--sport", default="NBA", help="Sport name (default: NBA)")
    parser.add_argument(
        "--persona",
        default="analyst",
        choices=["analyst", "trash_talker", "emotional"],
        help="Persona forwarded to backend (default: analyst)",
    )
    parser.add_argument(
        "--agent-timeout",
        type=float,
        default=4.0,
        help="Agent request timeout in seconds (default: 4)",
    )
    parser.add_argument(
        "--js-runtime",
        default=None,
        help="Optional yt-dlp JS runtime (example: node)",
    )
    return parser


if __name__ == "__main__":
    args = build_arg_parser().parse_args()
    stream_live_highlights(
        url=args.url,
        fps=max(0.5, args.fps),
        frame_width=max(160, args.width),
        pixel_diff_threshold=args.pixel_diff_threshold,
        motion_threshold=args.motion_threshold,
        cooldown_seconds=max(2.0, args.cooldown_seconds),
        agent_url=(args.agent_url.strip() or None),
        active_sport=args.sport,
        persona=args.persona,
        agent_timeout_seconds=max(1.0, args.agent_timeout),
        js_runtime=args.js_runtime,
    )
