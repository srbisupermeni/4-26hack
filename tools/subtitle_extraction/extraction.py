import os
import subprocess
import sys

def download_subtitles(url, lang="en", output_dir="subs", auto=True, fmt="srt"):
    """
    Download subtitles from a YouTube video.

    Args:
        url (str): YouTube video URL
        lang (str): Subtitle language (default: en)
        output_dir (str): Directory to save subtitles
        auto (bool): Whether to download auto-generated subtitles
        fmt (str): Output format (srt or vtt)
    """

    # Create output directory if not exists
    os.makedirs(output_dir, exist_ok=True)

    # Build yt-dlp command
    cmd = [
        sys.executable, "-m", "yt_dlp",
        "--skip-download",
        "--sub-lang", lang,
        "--convert-subs", fmt,
        "-o", f"{output_dir}/%(title)s.%(ext)s"
    ]

    if auto:
        cmd.append("--write-auto-subs")
    else:
        cmd.append("--write-subs")

    cmd.append(url)

    # Run command
    try:
        subprocess.run(cmd, check=True)
        print("✅ Subtitles downloaded successfully!")
    except FileNotFoundError:
        print("❌ yt-dlp is not installed for this Python interpreter.")
        print(f"Try: {sys.executable} -m pip install yt-dlp")
    except subprocess.CalledProcessError:
        print("❌ Failed to download subtitles.")

# Example usage
if __name__ == "__main__":
    youtube_url = input("Enter YouTube URL: ").strip()
    download_subtitles(youtube_url)