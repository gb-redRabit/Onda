#!/bin/bash
# Script: install-ytdlp.sh
# Description: Downloads yt-dlp and ffmpeg for Linux/macOS
# Usage: chmod +x scripts/install-ytdlp.sh && ./scripts/install-ytdlp.sh

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BIN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)/bin"

mkdir -p "$BIN_DIR"

OS="$(uname -s)"
ARCH="$(uname -m)"

echo "System: $OS $ARCH"

# --- yt-dlp ---
echo "Pobieranie yt-dlp..."
YTDLP_URL="https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp"

curl -L "$YTDLP_URL" -o "$BIN_DIR/yt-dlp"
chmod +x "$BIN_DIR/yt-dlp"
echo "yt-dlp pobrany: $BIN_DIR/yt-dlp"

# --- ffmpeg ---
echo "Pobieranie FFmpeg..."
if command -v apt-get &> /dev/null; then
    echo "Uzywam apt (Debian/Ubuntu)..."
    sudo apt-get update && sudo apt-get install -y ffmpeg
elif command -v brew &> /dev/null; then
    echo "Uzywam brew (macOS)..."
    brew install ffmpeg
elif command -v pacman &> /dev/null; then
    echo "Uzywam pacman (Arch)..."
    sudo pacman -S --noconfirm ffmpeg
elif command -v dnf &> /dev/null; then
    echo "Uzywam dnf (Fedora)..."
    sudo dnf install -y ffmpeg
else
    echo "Nie wykryto menedzera pakietow. Zainstaluj FFmpeg recznie."
    echo "https://ffmpeg.org/download.html"
fi

echo ""
echo "Instalacja zakonczona!"
echo "Pliki: $BIN_DIR"
