FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg rubberband-cli build-essential libfftw3-dev libsamplerate0-dev libtag1-dev curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies (Essentia, yt-dlp)
RUN pip install --upgrade pip && \
    pip install essentia && \
    pip install --upgrade yt-dlp

# Install Node.js (from NodeSource)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    ln -sf /usr/bin/node /usr/local/bin/node && \
    rm -rf /var/lib/apt/lists/*

# Copy package files and install Node.js dependencies first (layer caching)
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the application
COPY . .

# cookies.txt is intentionally not copied here — it is gitignored and may contain
# sensitive data. If you need YouTube authentication, upload cookies.txt as a
# Render Secret File mounted at /app/cookies.txt (set COOKIES_PATH=/app/cookies.txt).

EXPOSE 4000

CMD ["node", "index.cjs"]
