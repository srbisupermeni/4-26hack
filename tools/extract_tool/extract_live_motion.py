"""
从 YouTube 直播流中实时提取运动帧。

使用 yt-dlp 解析直播视频流 URL，OpenCV 实时读取帧并做帧差检测，
将有运动的画面保存为图片。

依赖：
    pip install opencv-python numpy

可选（用于 yt-dlp）：
    pip install yt-dlp
"""

import argparse
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np


def resolve_stream_url(url: str) -> str:
    """通过 yt-dlp 获取直播视频流的直接 URL。"""
    format_candidates = [
        "bestvideo[height<=720]/bestvideo/best",
        "best",
    ]

    for fmt in format_candidates:
        cmd = [sys.executable, "-m", "yt_dlp", "-f", fmt, "--get-url", url]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            stream_urls = [line.strip() for line in result.stdout.splitlines() if line.strip()]
            if stream_urls:
                print(f"[yt-dlp] 解析到视频流 URL (format: {fmt})")
                return stream_urls[0]

    raise RuntimeError(f"无法解析视频流 URL。请确认 URL 有效且 yt-dlp 已安装。\n"
                       f"运行: {sys.executable} -m pip install yt-dlp")


def extract_video_id(url: str) -> str:
    """从 YouTube URL 中提取 video ID。"""
    from urllib.parse import parse_qs, urlparse
    parsed = urlparse(url)
    if parsed.hostname in {"youtu.be"}:
        return parsed.path.strip("/") or "unknown"
    if "youtube.com" in (parsed.hostname or ""):
        query_id = parse_qs(parsed.query).get("v", [])
        if query_id:
            return query_id[0]
        parts = parsed.path.strip("/").split("/")
        if "live" in parts:
            idx = parts.index("live")
            if idx + 1 < len(parts):
                return parts[idx + 1]
    return "unknown"


def run_live_extraction(
    url: str,
    output_dir: str,
    pixel_diff_threshold: int = 25,
    motion_threshold: float = 0.75,
    cooldown_seconds: float = 1.0,
    jpeg_quality: int = 90,
    max_frames: int = 0,
    reconnect_delay: int = 5,
):
    """
    实时从 YouTube 直播流提取运动帧。

    Args:
        url: YouTube 直播 URL
        output_dir: 输出图片目录
        pixel_diff_threshold: 单像素差异阈值
        motion_threshold: 画面变化比例阈值（0~1）
        cooldown_seconds: 最短保存间隔（秒）
        jpeg_quality: 输出图片质量
        max_frames: 最大提取帧数，0 表示无限制
        reconnect_delay: 断线重连等待秒数
    """
    os.makedirs(output_dir, exist_ok=True)

    video_id = extract_video_id(url)
    session_id = datetime.now().strftime("%Y%m%d_%H%M%S")
    print(f"=" * 60)
    print(f"YouTube 实时运动帧提取工具")
    print(f"=" * 60)
    print(f"Video ID  : {video_id}")
    print(f"会话 ID   : {session_id}")
    print(f"输出目录  : {output_dir}")
    print(f"运动阈值  : {motion_threshold:.0%}")
    print(f"像素阈值  : {pixel_diff_threshold}")
    print(f"冷却时间  : {cooldown_seconds}s")
    print(f"=" * 60)

    saved_total = 0
    session_start = time.time()

    while True:
        try:
            stream_url = resolve_stream_url(url)
            print(f"[{datetime.now():%H:%M:%S}] 正在连接直播流...")

            cap = cv2.VideoCapture(stream_url)
            if not cap.isOpened():
                raise RuntimeError("无法打开视频流，可能直播已结束或流 URL 失效")

            fps = cap.get(cv2.CAP_PROP_FPS) or 30
            width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
            height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
            print(f"[{datetime.now():%H:%M:%S}] 已连接! {width}x{height} @ {fps:.1f}fps")
            print(f"[{datetime.now():%H:%M:%S}] 开始实时帧差检测，按 Ctrl+C 停止\n")

            prev_gray = None
            frame_idx = 0
            last_save_time = -999.0
            consecutive_errors = 0

            while True:
                ret, frame = cap.read()
                if not ret:
                    consecutive_errors += 1
                    if consecutive_errors > 30:
                        print(f"[{datetime.now():%H:%M:%S}] 连续读取失败 {consecutive_errors} 次，触发重连")
                        break
                    time.sleep(0.1)
                    continue
                consecutive_errors = 0

                elapsed = time.time() - session_start
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
                off_cooldown = (elapsed - last_save_time) >= cooldown_seconds

                if is_motion and off_cooldown:
                    saved_total += 1
                    last_save_time = elapsed
                    ts = datetime.now().strftime("%H%M%S")
                    filename = f"{output_dir}/{saved_total:04d}_{video_id}_{session_id}_t{ts}_motion{motion_ratio:.0%}.jpg"
                    cv2.imwrite(filename, frame, [cv2.IMWRITE_JPEG_QUALITY, jpeg_quality])
                    print(f"[{datetime.now():%H:%M:%S}] 帧 {frame_idx:>6d} | 运动 {motion_ratio:.1%} | 已保存 -> {filename}")

                    if max_frames > 0 and saved_total >= max_frames:
                        print(f"\n已达到最大帧数 {max_frames}，停止提取")
                        cap.release()
                        print(f"=" * 60)
                        print(f"完成! 共提取 {saved_total} 张运动帧 -> {output_dir}/")
                        return

                frame_idx += 1

                if frame_idx % 300 == 0:
                    print(f"  [{datetime.now():%H:%M:%S}] ... 运行中，已处理 {frame_idx} 帧，提取 {saved_total} 张")

            cap.release()

        except KeyboardInterrupt:
            print(f"\n\n用户中断，停止提取")
            print(f"=" * 60)
            print(f"完成! 共提取 {saved_total} 张运动帧 -> {output_dir}/")
            return

        except Exception as e:
            print(f"[{datetime.now():%H:%M:%S}] 错误: {e}")

        print(f"[{datetime.now():%H:%M:%S}] {reconnect_delay} 秒后重连...\n")
        try:
            time.sleep(reconnect_delay)
        except KeyboardInterrupt:
            print(f"\n用户中断")
            print(f"完成! 共提取 {saved_total} 张运动帧 -> {output_dir}/")
            return


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="从 YouTube 直播流中实时提取运动帧（帧差法）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""示例:
  python extract_live_motion.py "https://www.youtube.com/watch?v=xxx"
  python extract_live_motion.py "https://www.youtube.com/live/xxx" --threshold 0.6
  python extract_live_motion.py "https://youtu.be/xxx" --max-frames 50 --cooldown 2.0""",
    )
    parser.add_argument("url", help="YouTube 直播 URL 或视频 URL")
    parser.add_argument(
        "--output-dir", "-o",
        default="./extracted_frames",
        help="输出图片目录（默认: ./extracted_frames）",
    )
    parser.add_argument(
        "--threshold", "-t",
        type=float,
        default=0.75,
        help="画面变化比例阈值，0~1（默认: 0.75，即 75%% 画面变化才保存）",
    )
    parser.add_argument(
        "--pixel-threshold",
        type=int,
        default=25,
        help="单像素差异阈值（默认: 25）",
    )
    parser.add_argument(
        "--cooldown",
        type=float,
        default=1.0,
        help="最短保存间隔秒数（默认: 1.0）",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=90,
        help="JPEG 输出质量 1-100（默认: 90）",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=0,
        help="最大提取帧数，0 表示无限制（默认: 0）",
    )
    parser.add_argument(
        "--reconnect-delay",
        type=int,
        default=5,
        help="断线重连等待秒数（默认: 5）",
    )
    return parser


if __name__ == "__main__":
    args = build_arg_parser().parse_args()
    run_live_extraction(
        url=args.url,
        output_dir=args.output_dir,
        pixel_diff_threshold=args.pixel_threshold,
        motion_threshold=args.threshold,
        cooldown_seconds=max(0.1, args.cooldown),
        jpeg_quality=max(10, min(100, args.quality)),
        max_frames=args.max_frames,
        reconnect_delay=max(1, args.reconnect_delay),
    )
