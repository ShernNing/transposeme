#!/usr/bin/env bash
set -e




# Install Python dependencies.
# yt-dlp from the nightly channel — YouTube breaks the stable extractor often.
# bgutil-ytdlp-pot-provider is the PO-token plugin (needs POT_PROVIDER_BASE_URL +
# a reachable provider server to do anything). Re-run builds regularly to refresh.
echo "Installing yt-dlp (nightly), PO-token plugin, essentia, requirements..."
pip3 install --upgrade --pre "yt-dlp[default]" bgutil-ytdlp-pot-provider
pip3 install essentia || echo "[warn] essentia install failed — key detection unavailable"
if [ -f requirements.txt ]; then
	pip3 install -r requirements.txt
fi

# Install Node dependencies
echo "Installing Node.js dependencies..."
npm install

echo "Build script complete."
