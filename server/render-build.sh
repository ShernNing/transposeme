#!/usr/bin/env bash
set -e

# Install system dependencies
echo "Updating apt and installing ffmpeg, rubberband-cli, python3-pip..."
apt-get update
apt-get install -y ffmpeg rubberband-cli python3-pip

# Install Python dependencies
echo "Installing yt-dlp and essentia via pip..."
pip3 install yt-dlp essentia

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install

echo "Build script complete."
