# 运动帧提取工具

从视频文件或 YouTube 直播流中用帧差法检测运动画面，将有动作的帧保存为图片。

## 依赖

```bash
pip install opencv-python numpy yt-dlp
```

## 1. 离线视频提取

```bash
python extract_motion_frames.py
```

脚本顶部的参数可直接修改：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `VIDEO_PATH` | `./NBA.mov` | 输入视频路径 |
| `OUTPUT_DIR` | `./抽取` | 输出图片目录 |
| `PIXEL_DIFF_THRESHOLD` | 25 | 单像素差异阈值 |
| `MOTION_THRESHOLD` | 0.75 | 画面变化比例阈值（0~1） |
| `COOLDOWN_SECONDS` | 1.0 | 最短保存间隔（秒） |
| `JPEG_QUALITY` | 90 | 输出图片质量 |

## 2. YouTube 直播流实时提取

```bash
python extract_live_motion.py "https://www.youtube.com/watch?v=xxx"
```

### 参数

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--output-dir, -o` | `./extracted_frames` | 输出图片目录 |
| `--threshold, -t` | 0.75 | 画面变化比例阈值（0~1） |
| `--pixel-threshold` | 25 | 单像素差异阈值 |
| `--cooldown` | 1.0 | 最短保存间隔（秒） |
| `--quality` | 90 | JPEG 质量 |
| `--max-frames` | 0 | 最大提取帧数（0=无限制） |
| `--reconnect-delay` | 5 | 断线重连等待秒数 |

### 示例

```bash
# 基本用法
python extract_live_motion.py "https://www.youtube.com/live/abc123"

# 降低运动阈值，更容易触发保存
python extract_live_motion.py "https://www.youtube.com/watch?v=xxx" --threshold 0.5

# 最多提取 50 帧，冷却间隔 2 秒
python extract_live_motion.py "https://youtu.be/xxx" --max-frames 50 --cooldown 2.0
```

## 输出

文件命名格式：`序号_videoID_会话ID_t时间_motion比例.jpg`

例如 `0003_abc123_20260426_170500_t163020_motion78%.jpg`
