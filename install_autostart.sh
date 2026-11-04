#!/usr/bin/env bash

# YouTube Downloader - Automatic Background Service Installer
# Configures the local helper to start automatically in the background on system login.

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=========================================================="
echo "    YouTube Downloader - Auto-Start Setup"
echo "=========================================================="

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed."
    exit 1
fi

# Ensure virtualenv exists
if [ ! -f "backend/venv/bin/python3" ]; then
    echo "📦 Initializing virtual environment..."
    python3 -m venv backend/venv
    ./backend/venv/bin/pip install --upgrade pip
    ./backend/venv/bin/pip install -r backend/requirements.txt
fi

PYTHON_EXEC="$DIR/backend/venv/bin/python3"
APP_EXEC="$DIR/backend/app.py"
ICON_PATH="$DIR/extension/icons/icon128.png"

# Setup Systemd User Service (Linux / Ubuntu standard)
SERVICE_DIR="$HOME/.config/systemd/user"
SERVICE_FILE="$SERVICE_DIR/yt-downloader.service"

mkdir -p "$SERVICE_DIR"

echo "⚙️ Creating systemd background service at: $SERVICE_FILE"

cat <<EOF > "$SERVICE_FILE"
[Unit]
Description=YouTube Downloader Local Helper Server
After=network.target

[Service]
Type=simple
WorkingDirectory=$DIR/backend
ExecStart=$PYTHON_EXEC $APP_EXEC
Restart=on-failure
RestartSec=3
Environment=PYTHONUNBUFFERED=1

[Install]
WantedBy=default.target
EOF

# Reload and enable service
echo "🚀 Enabling and starting background service..."
systemctl --user daemon-reload
systemctl --user enable --now yt-downloader.service

# Create an Application Drawer Launcher (.desktop entry)
DESKTOP_DIR="$HOME/.local/share/applications"
DESKTOP_FILE="$DESKTOP_DIR/yt-downloader.desktop"
mkdir -p "$DESKTOP_DIR"

cat <<EOF > "$DESKTOP_FILE"
[Desktop Entry]
Version=1.0
Type=Application
Name=YouTube Downloader Helper
Comment=Background helper service for YouTube Downloader Extension
Exec=systemctl --user restart yt-downloader.service
Icon=$ICON_PATH
Terminal=false
Categories=Utility;AudioVideo;
StartupNotify=false
EOF

# Give it 1 second to start and verify
sleep 1.5

if curl -s http://127.0.0.1:8765/health | grep -q "yt-downloader-backend"; then
    echo ""
    echo "=========================================================="
    echo "✅ SUCCESS! YouTube Downloader is now running silently!"
    echo "=========================================================="
    echo "• You NEVER need to run './backend/run_backend.sh' again."
    echo "• The helper starts automatically whenever you turn on your PC."
    echo "• It runs quietly in the background without any open terminal."
    echo ""
    echo "Useful service commands (optional):"
    echo "  Check status:  systemctl --user status yt-downloader"
    echo "  Stop service:  systemctl --user stop yt-downloader"
    echo "  Restart:       systemctl --user restart yt-downloader"
    echo "  Disable auto:  ./uninstall_autostart.sh"
    echo "=========================================================="
else
    echo "⚠️ Service enabled, but backend did not respond immediately."
    echo "Check logs with: journalctl --user -u yt-downloader -n 20"
fi
