#!/usr/bin/env bash

# YouTube Downloader - Remove Auto-Start Service

echo "🛑 Stopping and disabling YouTube Downloader background service..."

systemctl --user stop yt-downloader.service 2>/dev/null || true
systemctl --user disable yt-downloader.service 2>/dev/null || true

rm -f "$HOME/.config/systemd/user/yt-downloader.service"
rm -f "$HOME/.local/share/applications/yt-downloader.desktop"

systemctl --user daemon-reload

echo "✅ Background auto-start service removed."
echo "If you want to run it manually again, use: ./backend/run_backend.sh"
