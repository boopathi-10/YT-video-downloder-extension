# 🎬 YouTube Video & Audio Downloader (Extension + Local Helper)

A high-performance Chrome / Brave / Edge Manifest V3 extension and companion local engine that enables 1-click downloads of YouTube videos (up to 4K/1080p with audio merged) and high-bitrate MP3/M4A audio extraction.

---

## 🌟 Key Features

* **Native In-Page Integration**: Adds a sleek, YouTube-themed **"Download"** pill button directly inside the YouTube video action bar (next to Like / Share).
* **Toolbar Popup UI**: Quick access popup displaying video metadata (thumbnail, title, duration, channel) with resolution pickers.
* **Direct URL Downloader**: Paste any YouTube video or Short URL into the popup to download even when not currently on the page.
* **Full HD & 4K Video**: Supports 2160p (4K), 1440p (2K), 1080p (Full HD), 720p (HD), 480p, and 360p (merges adaptive DASH video & audio streams using FFmpeg).
* **100% Universal Device Playback**: Output MP4 videos are guaranteed to use standard **H.264 (AVC) + AAC** (`yuv420p` + `faststart`), ensuring instant, native playback on Windows Media Player, macOS QuickTime, iPhone/iPad, Android, Smart TVs, and VLC without needing extra codecs.
* **High-Quality Audio Extraction**: Converts directly to MP3 (320 kbps HQ, 192 kbps Standard, 128 kbps), original M4A/AAC, or lossless WAV with ID3 metadata.
* **Live Progress Tracking**: Real-time progress bars showing download percentage, download speed (e.g., `12.5 MB/s`), and remaining ETA.
* **1-Click Folder Access**: Open the downloaded files directly in your system file manager with one click.
* **GNOME Shell Desktop Integration**: Includes a native GNOME 45/46/47 top-bar extension for Ubuntu and Linux desktops.
* **Unbreakable Architecture**: Powered by `yt-dlp` and `ffmpeg`, keeping you immune to YouTube player script obfuscations.

---

## 📂 Project Structure

```text
YT-video-downloder-extension/
├── backend/                       # Local companion server (FastAPI + yt-dlp)
│   ├── app.py                     # API server & download worker
│   ├── requirements.txt           # Dependencies (yt-dlp, fastapi, uvicorn)
│   ├── run_backend.sh             # 1-click Linux/macOS launcher
│   └── run_backend.py             # Cross-platform Python launcher
├── extension/                     # Manifest V3 Browser Extension (Chrome/Edge/Brave)
│   ├── manifest.json              # Extension manifest
│   ├── icons/                     # Icons (16, 32, 48, 128)
│   ├── content/                   # In-page YouTube injection
│   │   ├── content.js             # YouTube DOM observer & action button
│   │   └── content.css            # Dark/Light theme styles
│   ├── popup/                     # Browser toolbar popup
│   │   ├── popup.html             # Popup layout
│   │   ├── popup.css              # Popup styling
│   │   └── popup.js               # Tab detection & download controls
│   └── background/                # Service worker
│       └── background.js          # Notifications & messaging
├── gnome-extension/               # GNOME Shell Desktop Top-Bar Extension
│   ├── metadata.json              # GNOME Extension UUID & supported versions
│   ├── extension.js               # Top-bar indicator & clipboard integration
│   ├── stylesheet.css             # GNOME theme styling
│   ├── yt-downloader...zip        # Ready-to-upload package for extensions.gnome.org
│   └── README.md                  # GNOME installation & publishing guide
├── install_autostart.sh           # 1-click silent background auto-start installer
├── uninstall_autostart.sh         # Auto-start service remover
└── README.md
```

---

## 🚀 Quick Start Guide

### Step 1: Start the Local Helper Server

The local helper server performs video stream downloading and FFmpeg audio/video muxing.

> **Zero Manual Setup**: Portable FFmpeg and FFprobe are bundled and configured automatically across macOS (Apple Silicon M1/M2/M3/M4 & Intel), Windows, and Linux. Users do not need to install Homebrew or FFmpeg manually!

#### Option A: One-Click Auto-Start in Background (Linux / Ubuntu)
Run this command once. The helper will run silently in the background and automatically start whenever you turn on your PC (no open terminal required!):

```bash
cd YT-video-downloder-extension
./install_autostart.sh
```

* To check status: `systemctl --user status yt-downloader`
* To stop or remove: `./uninstall_autostart.sh`

#### Option B: Manual Terminal Run
If you prefer running it manually in an active terminal:

```bash
cd YT-video-downloder-extension
./backend/run_backend.sh
```

*(On Windows, you can run: `python backend/run_backend.py`)*

You will see:
```text
✅ FFmpeg detected: ffmpeg version ...
🚀 Starting server at http://127.0.0.1:8765
Downloads will be saved to: ~/Downloads
```

---

### Step 2: Load the Extension into Chrome / Brave / Edge

1. Open your browser and navigate to:
   * **Chrome**: `chrome://extensions`
   * **Brave**: `brave://extensions`
   * **Edge**: `edge://extensions`
2. In the top-right corner, turn ON **"Developer mode"**.
3. Click the **"Load unpacked"** button in the top-left corner.
4. Browse to and select the `extension` folder inside the project:
   ```text
   /path/to/YT-video-downloder-extension/extension
   ```
5. The **"YouTube Video & Audio Downloader"** extension is now installed!
6. *(Recommended)* Click the puzzle piece icon in the browser toolbar and pin the downloader icon for easy access.

---

## 🎯 How to Use

### Method 1: In-Page YouTube Download Button (Recommended)

1. Open any YouTube video (e.g., `https://www.youtube.com/watch?v=...`) or YouTube Shorts.
2. Under the video title, right next to the Like & Share buttons, you will see the red **"Download"** button.
3. Click **"Download"** to open the menu:
   * **📹 Video Tab**: Choose 1080p (Full HD), 720p (HD), 480p, 360p, or Best.
   * **🎵 Audio Tab**: Choose MP3 (320 kbps), MP3 (192 kbps), M4A, or WAV.
4. Click your desired quality. A floating progress card will appear at the bottom right displaying live progress, speed, and ETA.
5. When finished, click **"📂 Open in Downloads"** to open your file!

### Method 2: Toolbar Popup

1. Click the extension icon in your browser toolbar.
2. The popup automatically identifies the video playing in your active tab.
3. Select your desired format and click **Download Video** or **Download Audio (MP3)**.
4. Monitor active downloads in the **Downloads** queue list.

### Method 3: GNOME Top-Bar Extension (Linux / Ubuntu)

1. Copy any YouTube video URL to your system clipboard.
2. Click the download icon in your **GNOME top panel**.
3. Select **Video (1080p)** or **Audio (MP3)** to download directly without opening a browser extension!
4. See [`gnome-extension/README.md`](gnome-extension/README.md) for local installation & publishing to [extensions.gnome.org](https://extensions.gnome.org).

---

## ⚙️ Configuration & Downloads Directory

Downloaded media is saved to your operating system's default Downloads directory:
* **Linux**: `~/Downloads`
* **macOS**: `~/Downloads`
* **Windows**: `C:\Users\<Username>\Downloads`

To change the default download directory, you can specify `DOWNLOAD_DIR` in `backend/app.py`.

---

## ⚖️ Disclaimer

This project is intended for educational, research, and personal backup purposes only (e.g., archiving your own content, downloading public domain media, or saving content distributed under Creative Commons licenses).

The developer does not encourage, endorse, or support the unauthorized downloading, distribution, or reproduction of copyrighted material. All trademarks, service marks, and company names are the property of their respective owners. Users are solely responsible for complying with applicable copyright laws and the terms of service of third-party platforms.
