# live_subtract

Generates live subtitles directly from YouTube Live audio and appends only new spoken lines.
Each run creates a new output file automatically.
It can also forward each new subtitle line to your backend agent pipeline.

## Requirements

- Python 3.10+
- Required Python packages:

```bash
python -m pip install yt-dlp SpeechRecognition imageio-ffmpeg
```

## Usage

From repository root:

```bash
python live_subtract/live_subtract.py "https://www.youtube.com/watch?v=YOUR_LIVE_ID"
```

Options:

- `--language en-US` speech recognition language (default: `en-US`)
- `--poll-seconds 1` update interval (you can go as low as `0.5`)
- `--chunk-seconds 1` audio chunk length (you can go as low as `0.7`)
- `--output-dir live_subtract` directory where each run creates a new file
- `--js-runtime node` optional JS runtime for yt-dlp if YouTube requires it
- `--agent-url http://127.0.0.1:8000/api/pipeline/react` endpoint to receive subtitle events
- `--sport NBA` sport label sent to the backend
- `--persona analyst` persona sent to the backend (`analyst`, `trash_talker`, `emotional`)

Example:

```bash
python live_subtract/live_subtract.py "https://www.youtube.com/watch?v=YOUR_LIVE_ID" --language en-US --poll-seconds 1 --chunk-seconds 1 --output-dir live_subtract
```

Lower-latency example:

```bash
python live_subtract/live_subtract.py "https://www.youtube.com/watch?v=YOUR_LIVE_ID" --poll-seconds 0.5 --chunk-seconds 0.8 --output-dir live_subtract
```

Disable agent forwarding (subtitle file only):

```bash
python live_subtract/live_subtract.py "https://www.youtube.com/watch?v=YOUR_LIVE_ID" --agent-url ""
```

When forwarding is enabled, each run creates:
- `<videoid>_<timestamp>.txt` (raw subtitles)
- `<videoid>_<timestamp>_agent.txt` (agent responses from `/api/pipeline/react`)
