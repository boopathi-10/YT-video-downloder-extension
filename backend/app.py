"""
YouTube Video & Audio Downloader - Local Helper Server
Powered by FastAPI & yt-dlp
"""

import os
import sys
import uuid
import shutil
import platform
import subprocess
import threading
import traceback
from pathlib import Path
from typing import Dict, Any, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp

app = FastAPI(title="YouTube Downloader Helper", version="1.0.0")

# Enable CORS for Chrome Extensions and local tools
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Determine default downloads directory
def get_default_download_dir() -> Path:
    home = Path.home()
    candidates = [
        home / "Downloads",
        home / "downloads",
        home / "Desktop",
        home,
    ]
    for c in candidates:
        if c.exists() and os.access(c, os.W_OK):
            return c
    return home

DOWNLOAD_DIR = get_default_download_dir()

# Active and completed tasks in-memory storage
tasks_lock = threading.Lock()
tasks: Dict[str, Dict[str, Any]] = {}

def check_ffmpeg() -> bool:
    """Check if ffmpeg is available in system PATH."""
    return shutil.which("ffmpeg") is not None

def ensure_universal_video_mp4(filepath: str) -> None:
    """
    Ensures that the output MP4 file uses standard H.264 (AVC) video and AAC audio
    with standard yuv420p pixel format and faststart flags, making it 100% playable in:
    - Native Windows Media Player & Movies & TV
    - Native Apple QuickTime Player (macOS / iOS)
    - Native Android Gallery
    - VLC, MPV, Smart TVs, and hardware players.
    """
    if not os.path.exists(filepath):
        return

    try:
        # Probe video codec & pixel format
        cmd_v = [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=codec_name,pix_fmt",
            "-of", "default=noprint_wrappers=1:nokey=1", filepath
        ]
        res_v = subprocess.run(cmd_v, capture_output=True, text=True)
        v_lines = [line.strip() for line in res_v.stdout.strip().splitlines() if line.strip()]
        v_codec = v_lines[0] if len(v_lines) > 0 else ""
        pix_fmt = v_lines[1] if len(v_lines) > 1 else ""

        # Probe audio codec
        cmd_a = [
            "ffprobe", "-v", "error", "-select_streams", "a:0",
            "-show_entries", "stream=codec_name",
            "-of", "default=noprint_wrappers=1:nokey=1", filepath
        ]
        res_a = subprocess.run(cmd_a, capture_output=True, text=True)
        a_codec = res_a.stdout.strip()

        needs_video_transcode = (v_codec != "h264") or (pix_fmt != "yuv420p")
        needs_audio_transcode = (a_codec != "aac")

        # If codecs are already H.264 + AAC with yuv420p, no transcoding needed!
        if not needs_video_transcode and not needs_audio_transcode:
            return

        temp_out = filepath + ".compat.mp4"
        ffmpeg_cmd = ["ffmpeg", "-y", "-i", filepath]

        if needs_video_transcode:
            ffmpeg_cmd.extend(["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"])
        else:
            ffmpeg_cmd.extend(["-c:v", "copy"])

        if needs_audio_transcode:
            ffmpeg_cmd.extend(["-c:a", "aac", "-b:a", "192k"])
        else:
            ffmpeg_cmd.extend(["-c:a", "copy"])

        ffmpeg_cmd.extend(["-movflags", "+faststart", temp_out])

        subprocess.run(ffmpeg_cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

        if os.path.exists(temp_out) and os.path.getsize(temp_out) > 0:
            os.replace(temp_out, filepath)
    except Exception as e:
        print(f"[Warning] ensure_universal_video_mp4 exception: {e}")

class DownloadRequest(BaseModel):
    url: str
    media_type: str = "video"  # "video" or "audio"
    quality: str = "1080p"     # "1080p", "720p", "480p", "360p", "best", "320k", "192k", "128k"
    audio_format: str = "mp3"  # "mp3", "m4a", "wav"
    custom_dir: Optional[str] = None

@app.get("/health")
def health_check():
    """Health check endpoint to verify backend connectivity."""
    return {
        "status": "ok",
        "service": "yt-downloader-backend",
        "version": "1.0.0",
        "ffmpeg_available": check_ffmpeg(),
        "download_dir": str(DOWNLOAD_DIR),
        "active_tasks_count": sum(1 for t in tasks.values() if t.get("status") in ["pending", "downloading", "processing"]),
    }

@app.get("/info")
def get_video_info(url: str = Query(..., description="YouTube video URL")):
    """Extract metadata and available streams for a given YouTube URL."""
    try:
        ydl_opts = {
            "skip_download": True,
            "quiet": True,
            "no_warnings": True,
            "extract_flat": False,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            if not info:
                raise HTTPException(status_code=400, detail="Could not extract video metadata")

            # Extract available video resolutions
            formats = info.get("formats", [])
            available_heights = set()
            for f in formats:
                height = f.get("height")
                vcodec = f.get("vcodec", "none")
                if height and vcodec != "none":
                    available_heights.add(height)

            sorted_heights = sorted(list(available_heights), reverse=True)
            formatted_qualities = []
            standard_resolutions = [2160, 1440, 1080, 720, 480, 360, 240, 144]
            for res in standard_resolutions:
                if any(h >= res for h in sorted_heights):
                    label = f"{res}p"
                    if res == 2160:
                        label += " (4K)"
                    elif res == 1440:
                        label += " (2K)"
                    elif res == 1080:
                        label += " (Full HD)"
                    elif res == 720:
                        label += " (HD)"
                    formatted_qualities.append({"res": res, "label": label, "value": f"{res}p"})

            duration_secs = info.get("duration", 0)
            mins, secs = divmod(duration_secs or 0, 60)
            hours, mins = divmod(mins, 60)
            if hours > 0:
                duration_str = f"{hours}:{mins:02d}:{secs:02d}"
            else:
                duration_str = f"{mins}:{secs:02d}"

            return {
                "id": info.get("id"),
                "title": info.get("title", "Unknown Title"),
                "uploader": info.get("uploader", "Unknown Channel"),
                "duration": duration_str,
                "duration_seconds": duration_secs,
                "thumbnail": info.get("thumbnail"),
                "view_count": info.get("view_count", 0),
                "available_resolutions": formatted_qualities,
                "default_resolution": "1080p" if 1080 in sorted_heights else ("720p" if 720 in sorted_heights else "best"),
            }
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))

def run_download_worker(task_id: str, req: DownloadRequest):
    """Background worker function executing the download via yt-dlp."""
    target_dir = Path(req.custom_dir) if req.custom_dir else DOWNLOAD_DIR
    target_dir.mkdir(parents=True, exist_ok=True)

    with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            return
        task["status"] = "downloading"

    def progress_hook(d):
        with tasks_lock:
            current_task = tasks.get(task_id)
            if not current_task:
                return

            status = d.get("status")
            if status == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes") or 0
                percent = (downloaded / total * 100) if total > 0 else 0.0

                speed_bytes = d.get("speed")
                speed_str = ""
                if speed_bytes:
                    if speed_bytes > 1024 * 1024:
                        speed_str = f"{speed_bytes / (1024 * 1024):.1f} MB/s"
                    else:
                        speed_str = f"{speed_bytes / 1024:.1f} KB/s"

                eta_seconds = d.get("eta")
                eta_str = f"{eta_seconds}s" if eta_seconds is not None else ""

                current_task["progress_percent"] = round(percent, 1)
                current_task["downloaded_bytes"] = downloaded
                current_task["total_bytes"] = total
                current_task["speed"] = speed_str
                current_task["eta"] = eta_str
                if d.get("filename"):
                    current_task["filename"] = Path(d["filename"]).name

            elif status == "finished":
                current_task["status"] = "processing"
                current_task["progress_percent"] = 99.0
                if d.get("filename"):
                    current_task["filename"] = Path(d["filename"]).name
                    current_task["filepath"] = d["filename"]

    def postprocessor_hook(d):
        with tasks_lock:
            current_task = tasks.get(task_id)
            if not current_task:
                return
            status = d.get("status")
            if status == "started":
                current_task["status"] = "processing"
            elif status == "finished":
                current_task["status"] = "processing"

    ydl_opts: Dict[str, Any] = {
        "outtmpl": str(target_dir / "%(title)s [%(id)s].%(ext)s"),
        "progress_hooks": [progress_hook],
        "postprocessor_hooks": [postprocessor_hook],
        "quiet": True,
        "no_warnings": True,
        "nocheckcertificate": True,
    }

    try:
        if req.media_type == "audio":
            # Audio download & extraction
            audio_format = req.audio_format if req.audio_format in ["mp3", "m4a", "wav"] else "mp3"
            quality_map = {
                "320k": "320",
                "256k": "256",
                "192k": "192",
                "128k": "128",
            }
            bitrate = quality_map.get(req.quality, "192")

            ydl_opts.update({
                "format": "bestaudio/best",
                "postprocessors": [
                    {
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": audio_format,
                        "preferredquality": bitrate if audio_format == "mp3" else None,
                    },
                    {
                        "key": "FFmpegMetadata",
                        "add_metadata": True,
                    },
                ],
            })
        else:
            # Video download with universal compatibility (H.264 / AVC + AAC in MP4)
            # This ensures playback on QuickTime, Windows Media Player, Android, iOS, VLC, Smart TVs
            height_str = req.quality.replace("p", "").strip()
            if height_str.isdigit():
                max_height = int(height_str)
                format_filter = (
                    f"bestvideo[vcodec^=avc1][height<={max_height}]+bestaudio[acodec^=mp4a]/"
                    f"bestvideo[vcodec^=avc1][height<={max_height}]+bestaudio/"
                    f"bestvideo[ext=mp4][height<={max_height}]+bestaudio[ext=m4a]/"
                    f"bestvideo[height<={max_height}]+bestaudio/best[height<={max_height}]/best"
                )
            else:
                format_filter = (
                    "bestvideo[vcodec^=avc1]+bestaudio[acodec^=mp4a]/"
                    "bestvideo[vcodec^=avc1]+bestaudio/"
                    "bestvideo[ext=mp4]+bestaudio[ext=m4a]/"
                    "bestvideo+bestaudio/best"
                )

            ydl_opts.update({
                "format": format_filter,
                "merge_output_format": "mp4",
                "postprocessor_args": {
                    "merger": [
                        "-c:a", "aac",
                        "-b:a", "192k",
                        "-movflags", "+faststart"
                    ]
                },
                "postprocessors": [
                    {
                        "key": "FFmpegVideoConvertor",
                        "preferedformat": "mp4",
                    },
                    {
                        "key": "FFmpegMetadata",
                        "add_metadata": True,
                    },
                ],
            })

        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            extract_result = ydl.extract_info(req.url, download=True)
            if extract_result:
                real_title = extract_result.get("title", "Video")
                final_ext = (req.audio_format if req.audio_format in ["mp3", "m4a", "wav"] else "mp3") if req.media_type == "audio" else "mp4"

                # Find final downloaded file path
                prepared = ydl.prepare_filename(extract_result)
                target_file = Path(prepared).with_suffix(f".{final_ext}")
                if not target_file.exists() and Path(prepared).exists():
                    target_file = Path(prepared)

                # Ensure 100% universal compatibility for video files
                if req.media_type != "audio" and target_file.exists():
                    with tasks_lock:
                        if task_id in tasks:
                            tasks[task_id]["status"] = "processing"
                    ensure_universal_video_mp4(str(target_file))

                with tasks_lock:
                    if task_id in tasks:
                        tasks[task_id]["title"] = real_title
                        tasks[task_id]["filename"] = target_file.name
                        tasks[task_id]["filepath"] = str(target_file)

        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]["status"] = "completed"
                tasks[task_id]["progress_percent"] = 100.0

    except Exception as e:
        traceback.print_exc()
        with tasks_lock:
            if task_id in tasks:
                tasks[task_id]["status"] = "error"
                tasks[task_id]["error"] = str(e)

@app.post("/download")
def start_download(req: DownloadRequest, background_tasks: BackgroundTasks):
    """Initiates a download job and returns the task ID."""
    task_id = str(uuid.uuid4())[:8]

    initial_task = {
        "task_id": task_id,
        "url": req.url,
        "media_type": req.media_type,
        "quality": req.quality,
        "audio_format": req.audio_format,
        "title": "Fetching info...",
        "status": "pending",
        "progress_percent": 0.0,
        "speed": "",
        "eta": "",
        "filename": "",
        "filepath": "",
        "error": None,
    }

    with tasks_lock:
        tasks[task_id] = initial_task

    background_tasks.add_task(run_download_worker, task_id, req)

    return {
        "success": True,
        "task_id": task_id,
        "message": "Download task queued",
    }

@app.get("/progress/{task_id}")
def get_progress(task_id: str):
    """Retrieve the progress and status of a specific download task."""
    with tasks_lock:
        task = tasks.get(task_id)
        if not task:
            raise HTTPException(status_code=404, detail="Task not found")
        return task

@app.get("/tasks")
def list_tasks():
    """Retrieve all recent download tasks."""
    with tasks_lock:
        return list(tasks.values())[::-1]

@app.post("/open-folder")
def open_download_folder():
    """Open the downloads directory in the OS file explorer."""
    try:
        system_os = platform.system()
        folder_str = str(DOWNLOAD_DIR)
        if system_os == "Linux":
            subprocess.Popen(["xdg-open", folder_str])
        elif system_os == "Darwin":
            subprocess.Popen(["open", folder_str])
        elif system_os == "Windows":
            os.startfile(folder_str)
        return {"success": True, "path": folder_str}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    print(f"Starting YouTube Downloader Helper on http://127.0.0.1:8765")
    print(f"Downloads will be saved to: {DOWNLOAD_DIR}")
    print(f"FFmpeg detected: {check_ffmpeg()}")
    uvicorn.run(app, host="127.0.0.1", port=8765, log_level="info")
