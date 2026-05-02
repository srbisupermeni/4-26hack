"""
从 NBA.mov 视频中用帧差法提取有运动的画面，保存到 抽取/ 目录
"""

import cv2
import os
import numpy as np

VIDEO_PATH = "./NBA.mov"
OUTPUT_DIR = "./抽取"

# 参数（与原项目一致）
PIXEL_DIFF_THRESHOLD = 25       # 单像素差异阈值
MOTION_THRESHOLD = 0.75         # 画面变化超过 75% 认为有动作
COOLDOWN_SECONDS = 1.0          # 最短间隔（秒），避免连续保存相似帧
JPEG_QUALITY = 90

os.makedirs(OUTPUT_DIR, exist_ok=True)

cap = cv2.VideoCapture(VIDEO_PATH)
if not cap.isOpened():
    print(f"无法打开视频: {VIDEO_PATH}")
    exit(1)

fps = cap.get(cv2.CAP_PROP_FPS)
total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
duration = total_frames / fps if fps > 0 else 0

print(f"视频信息: {width}x{height} @ {fps:.1f}fps, 共 {total_frames} 帧, 时长 {duration:.1f}s")
print(f"运动阈值: {MOTION_THRESHOLD:.0%}, 像素差异阈值: {PIXEL_DIFF_THRESHOLD}, 冷却: {COOLDOWN_SECONDS}s")
print("─" * 60)

prev_gray = None
frame_idx = 0
saved_idx = 0
last_save_time = -999

while True:
    ret, frame = cap.read()
    if not ret:
        break

    timestamp = frame_idx / fps  # 当前帧对应的时间（秒）

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (5, 5), 0)

    if prev_gray is None:
        prev_gray = gray
        frame_idx += 1
        continue

    # 帧差法
    diff = cv2.absdiff(gray, prev_gray)
    prev_gray = gray

    motion_pixels = np.sum(diff > PIXEL_DIFF_THRESHOLD)
    motion_ratio = motion_pixels / diff.size

    is_motion = motion_ratio > MOTION_THRESHOLD
    off_cooldown = (timestamp - last_save_time) >= COOLDOWN_SECONDS

    if is_motion and off_cooldown:
        saved_idx += 1
        last_save_time = timestamp
        time_str = f"{int(timestamp // 60):02d}{int(timestamp % 60):02d}"
        filename = f"{OUTPUT_DIR}/{saved_idx:04d}_t{time_str}_motion{motion_ratio:.0%}.jpg"
        cv2.imwrite(filename, frame, [cv2.IMWRITE_JPEG_QUALITY, JPEG_QUALITY])
        print(f"[{timestamp:6.1f}s] 帧 {frame_idx:>6d} | 运动 {motion_ratio:.1%} | 保存 -> {filename}")

    frame_idx += 1

    # 进度
    if frame_idx % 500 == 0:
        pct = frame_idx / total_frames * 100
        print(f"  ... 进度 {pct:.0f}% ({frame_idx}/{total_frames})")

cap.release()
print("─" * 60)
print(f"完成! 总帧 {frame_idx}, 提取保存 {saved_idx} 张 -> {OUTPUT_DIR}/")
