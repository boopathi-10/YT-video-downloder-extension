# 🖥️ GNOME Shell Top-Bar YouTube Downloader

A native GNOME Shell extension (GNOME 45, 46, and 47) that places a YouTube video & audio downloader directly in your desktop top bar.

---

## 🌟 Features

* **GNOME Top Bar Indicator**: Sits cleanly next to your clock and system status icons.
* **Smart Clipboard Detection**: Copy any YouTube URL (`watch?v=...`, `youtu.be/...`, or `shorts/...`), and the extension detects it instantly.
* **1-Click Download**:
  * 📹 **Video**: 1080p Full HD, 720p HD, Best Available (MP4 H.264 + AAC)
  * 🎵 **Audio**: MP3 320 kbps (HQ), MP3 192 kbps (Standard), M4A (Original)
* **Desktop Notifications**: Sends native GNOME desktop notifications when a download starts and finishes.
* **Folder Access**: Quick link to open your `~/Downloads` folder.
* **Local Privacy**: Communicates with the local helper engine at `http://127.0.0.1:8765`.

---

## 🚀 Local Installation (Test on Your Computer)

Make sure the local helper server is running:
```bash
./backend/run_backend.sh
```

### Install the Extension Locally:
```bash
# 1. Install the extension package
gnome-extensions install --force gnome-extension/yt-downloader@boopathi-10.github.com.shell-extension.zip

# 2. Enable it
gnome-extensions enable yt-downloader@boopathi-10.github.com

# 3. On X11, restart GNOME Shell with Alt+F2 -> type 'r' -> press Enter.
#    On Wayland (Ubuntu default), log out and log back in, or manage via the 'Extension Manager' app.
```

---

## 🌐 How to Publish on extensions.gnome.org (EGO)

To list this extension publicly for all Linux / Ubuntu users worldwide:

1. Register or Log in at **[extensions.gnome.org](https://extensions.gnome.org)**.
2. Visit **[extensions.gnome.org/upload/](https://extensions.gnome.org/upload/)**.
3. Upload the pre-built package:
   ```text
   gnome-extension/yt-downloader@boopathi-10.github.com.shell-extension.zip
   ```
4. Enter your project URL: `https://github.com/boopathi-10/YT-video-downloder-extension`.
5. Submit for review! Once the GNOME team verifies the code, it will be listed publicly on the GNOME Extensions store.
