#!/usr/bin/env bash

# YouTube Downloader Extension - Local Companion Helper
# Starts the local API server on http://127.0.0.1:8765

set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd "$DIR"

echo "=========================================================="
echo "    YouTube Downloader - Local Helper Server"
echo "=========================================================="

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Error: python3 is not installed. Please install Python 3.8+."
    exit 1
fi

# Check FFmpeg
if command -v ffmpeg &> /dev/null; then
    echo "✅ FFmpeg detected: $(ffmpeg -version | head -n 1)"
else
    echo "⚠️ Warning: ffmpeg is not found in PATH."
    echo "   High-resolution 1080p/4K video merging & MP3 audio extraction require ffmpeg."
    echo "   Install on Ubuntu/Debian: sudo apt-get install -y ffmpeg"
fi

# Create venv if not present
if [ ! -d "venv" ]; then
    echo "📦 Creating virtual environment in backend/venv..."
    python3 -m venv venv
    ./venv/bin/pip install --upgrade pip
    ./venv/bin/pip install -r requirements.txt
else
    # Check if packages are installed
    if [ ! -f "venv/bin/uvicorn" ]; then
        echo "📦 Installing required dependencies..."
        ./venv/bin/pip install -r requirements.txt
    fi
fi

echo ""
echo "🚀 Starting server at http://127.0.0.1:8765"
echo "👉 Keep this terminal open while downloading videos or audio."
echo "   Press Ctrl+C to stop."
echo "=========================================================="
echo ""

exec ./venv/bin/python3 app.py
