import argparse
import contextlib
import subprocess
import sys
import tempfile
import time
import wave
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import speech_recognition as sr
from imageio_ffmpeg import get_ffmpeg_exe


def resolve_audio_stream_url(url: str, js_runtime: str | None) -> str:
    # Some live streams do not expose "bestaudio". Try several fallbacks.
    format_candidates = [
        "bestaudio/best",
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
            stream_urls = [line.strip() for line in result.stdout.splitlines() if line.strip()]
            if stream_urls:
                return stream_urls[-1]
        last_error = (result.stderr or result.stdout or "").strip()

    if last_error:
        raise RuntimeError(last_error.splitlines()[-1])
    raise RuntimeError("Could not resolve live audio stream URL.")


def record_audio_chunk(ffmpeg_path: str, stream_url: str, chunk_seconds: int, wav_path: Path) -> None:
    cmd = [
        ffmpeg_path,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        stream_url,
        "-t",
        str(chunk_seconds),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        str(wav_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def start_segment_capture(
    ffmpeg_path: str,
    stream_url: str,
    chunk_seconds: float,
    temp_dir: Path,
) -> subprocess.Popen[str]:
    pattern = str(temp_dir / "chunk_%06d.wav")
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
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "segment",
        "-segment_time",
        str(chunk_seconds),
        "-reset_timestamps",
        "1",
        "-y",
        pattern,
    ]
    return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def transcribe_wav(wav_path: Path, recognizer: sr.Recognizer, language: str) -> str:
    with sr.AudioFile(str(wav_path)) as source:
        audio = recognizer.record(source)
    return recognizer.recognize_google(audio, language=language).strip()


def build_context_wav(previous_wav: Path, current_wav: Path, merged_wav: Path) -> bool:
    """Concatenate previous+current wav to preserve boundary words."""
    if (not previous_wav.exists()) or (not current_wav.exists()):
        return False

    with wave.open(str(previous_wav), "rb") as w1, wave.open(str(current_wav), "rb") as w2:
        # Both files are produced by the same ffmpeg settings, but guard anyway.
        if (
            w1.getnchannels() != w2.getnchannels()
            or w1.getsampwidth() != w2.getsampwidth()
            or w1.getframerate() != w2.getframerate()
        ):
            return False

        params = (w1.getnchannels(), w1.getsampwidth(), w1.getframerate(), 0, "NONE", "not compressed")
        frames = w1.readframes(w1.getnframes()) + w2.readframes(w2.getnframes())

    with wave.open(str(merged_wav), "wb") as out:
        out.setparams(params)
        out.writeframes(frames)
    return True


def transcribe_with_context(
    current_wav: Path,
    previous_wav: Path | None,
    merged_wav: Path,
    recognizer: sr.Recognizer,
    language: str,
) -> str:
    current_text = transcribe_wav(current_wav, recognizer, language=language)
    if not previous_wav:
        return current_text

    if not build_context_wav(previous_wav, current_wav, merged_wav):
        return current_text

    context_text = transcribe_wav(merged_wav, recognizer, language=language)
    current_lower = current_text.lower()
    context_lower = context_text.lower()

    # Prefer context result when it fully contains current text.
    if current_lower and current_lower in context_lower and len(context_text) > len(current_text):
        return context_text
    return current_text


def append_line(output_file: Path, text: str) -> None:
    now = time.strftime("%H:%M:%S")
    with output_file.open("a", encoding="utf-8") as out:
        out.write(f"[{now}] {text}\n")


def extract_video_id(url: str) -> str:
    parsed = urlparse(url)
    if parsed.hostname in {"youtu.be"}:
        return parsed.path.strip("/") or "unknown_live"
    if "youtube.com" in (parsed.hostname or ""):
        query_id = parse_qs(parsed.query).get("v", [])
        if query_id:
            return query_id[0]
    return "unknown_live"


def create_session_output_file(output_dir: Path, url: str) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    video_id = extract_video_id(url)
    stamp = time.strftime("%Y%m%d_%H%M%S")
    return output_dir / f"{video_id}_{stamp}.txt"


def stream_live_subtitles(
    url: str,
    language: str,
    poll_seconds: float,
    chunk_seconds: float,
    output_dir: Path,
    js_runtime: str | None,
) -> None:
    output_file = create_session_output_file(output_dir, url)
    output_file.touch(exist_ok=True)
    recognizer = sr.Recognizer()
    ffmpeg_path = get_ffmpeg_exe()

    print(f"Listening to: {url}")
    print(f"ASR language: {language}")
    print(f"Polling every: {poll_seconds}s")
    print(f"Chunk length: {chunk_seconds}s")
    print(f"Output file: {output_file}")
    print("Press Ctrl+C to stop.\n")

    last_line = ""
    stream_url = ""
    stream_resolved_at = 0.0
    capture_proc: subprocess.Popen[str] | None = None
    processed_files: set[Path] = set()

    with tempfile.TemporaryDirectory(prefix="live_subtract_audio_") as tmp:
        temp_dir = Path(tmp)
        merged_wav = temp_dir / "merged_context.wav"
        previous_chunk: Path | None = None

        while True:
            started = time.time()
            try:
                # Refresh stream URL periodically because live media URLs can expire.
                if (not stream_url) or (time.time() - stream_resolved_at > 60):
                    stream_url = resolve_audio_stream_url(url, js_runtime)
                    stream_resolved_at = time.time()
                    processed_files.clear()

                    if capture_proc and capture_proc.poll() is None:
                        capture_proc.terminate()
                        with contextlib.suppress(Exception):
                            capture_proc.wait(timeout=1.5)
                    capture_proc = start_segment_capture(
                        ffmpeg_path=ffmpeg_path,
                        stream_url=stream_url,
                        chunk_seconds=chunk_seconds,
                        temp_dir=temp_dir,
                    )

                # Restart capture if it crashed.
                if (capture_proc is None) or (capture_proc.poll() is not None):
                    stream_url = ""
                    raise RuntimeError("audio capture process stopped; retrying")

                all_chunks = sorted(temp_dir.glob("chunk_*.wav"))
                # Skip the newest chunk because ffmpeg may still be writing to it.
                ready_chunks = all_chunks[:-1] if len(all_chunks) > 1 else []
                new_chunk_found = False

                for wav_path in ready_chunks:
                    if wav_path in processed_files:
                        continue
                    new_chunk_found = True
                    processed_files.add(wav_path)
                    text = transcribe_with_context(
                        current_wav=wav_path,
                        previous_wav=previous_chunk,
                        merged_wav=merged_wav,
                        recognizer=recognizer,
                        language=language,
                    )
                    if text and text.lower() != last_line.lower():
                        append_line(output_file, text)
                        last_line = text
                        print(f"{time.strftime('%H:%M:%S')} | + {text}")
                    else:
                        print(f"{time.strftime('%H:%M:%S')} | no new speech")
                    previous_chunk = wav_path

                if not new_chunk_found:
                    print(f"{time.strftime('%H:%M:%S')} | waiting for audio chunk")

            except sr.UnknownValueError:
                print(f"{time.strftime('%H:%M:%S')} | no speech recognized")
            except sr.RequestError as exc:
                print(f"{time.strftime('%H:%M:%S')} | speech API error: {exc}")
            except subprocess.CalledProcessError as exc:
                # If ffmpeg fails, force stream URL refresh next cycle.
                stream_url = ""
                stderr = (exc.stderr or "").strip()
                message = stderr.splitlines()[-1] if stderr else f"command failed ({exc.returncode})"
                print(f"{time.strftime('%H:%M:%S')} | media error: {message}")
            except Exception as exc:
                print(f"{time.strftime('%H:%M:%S')} | error: {exc}")

            elapsed = time.time() - started
            sleep_seconds = max(0.0, poll_seconds - elapsed)
            time.sleep(sleep_seconds)


def build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Generate live subtitles from YouTube audio (not YouTube captions)."
    )
    parser.add_argument("url", help="YouTube live URL")
    parser.add_argument(
        "--language",
        default="en-US",
        help="Speech recognition language code (default: en-US)",
    )
    parser.add_argument(
        "--poll-seconds",
        type=float,
        default=1,
        help="Seconds between updates (default: 1)",
    )
    parser.add_argument(
        "--chunk-seconds",
        type=float,
        default=1,
        help="Audio seconds transcribed per update (default: 1)",
    )
    parser.add_argument(
        "--output-dir",
        default="live_subtract",
        help="Directory where each live session creates a new subtitle file (default: live_subtract)",
    )
    parser.add_argument(
        "--js-runtime",
        default=None,
        help="Optional yt-dlp JS runtime (example: node)",
    )
    return parser


if __name__ == "__main__":
    args = build_arg_parser().parse_args()
    stream_live_subtitles(
        url=args.url,
        language=args.language,
        poll_seconds=max(0.5, args.poll_seconds),
        chunk_seconds=max(0.7, args.chunk_seconds),
        output_dir=Path(args.output_dir),
        js_runtime=args.js_runtime,
    )
