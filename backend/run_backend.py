#!/usr/bin/env python3
"""Cross-platform runner for the YouTube Downloader Local Helper."""

import os
import sys
import subprocess
from pathlib import Path

def main():
    backend_dir = Path(__file__).resolve().parent
    venv_dir = backend_dir / "venv"
    
    # Determine python/pip executable inside venv
    if os.name == "nt":
        venv_python = venv_dir / "Scripts" / "python.exe"
        venv_pip = venv_dir / "Scripts" / "pip.exe"
    else:
        venv_python = venv_dir / "bin" / "python"
        venv_pip = venv_dir / "bin" / "pip"

    # Create venv if missing
    if not venv_dir.exists():
        print("📦 Creating virtual environment in backend/venv...")
        subprocess.check_call([sys.executable, "-m", "venv", str(venv_dir)])
        subprocess.check_call([str(venv_pip), "install", "--upgrade", "pip"])
        subprocess.check_call([str(venv_pip), "install", "-r", str(backend_dir / "requirements.txt")])
    elif not venv_python.exists():
        print("📦 Installing requirements...")
        subprocess.check_call([str(venv_pip), "install", "-r", str(backend_dir / "requirements.txt")])

    print("\n🚀 Starting YouTube Downloader Helper on http://127.0.0.1:8765 ...\n")
    os.chdir(str(backend_dir))
    subprocess.call([str(venv_python), "app.py"])

if __name__ == "__main__":
    main()
