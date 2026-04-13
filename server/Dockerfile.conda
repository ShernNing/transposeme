FROM python:3.10-slim

WORKDIR /app
COPY . .

# Install system dependencies
RUN apt-get update && \
    apt-get install -y ffmpeg rubberband-cli build-essential libfftw3-dev libsamplerate0-dev libtag1-dev curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies (Essentia, yt-dlp)
RUN pip install --upgrade pip && \
    pip install essentia yt-dlp

# Install Node.js (from NodeSource)


# Install Node.js (from NodeSource)
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && \
    apt-get install -y nodejs && \
    ln -sf /usr/bin/node /usr/local/bin/node && \
    rm -rf /var/lib/apt/lists/*

# Copy cookies.txt if present (for yt-dlp authentication)
COPY cookies.txt /app/cookies.txt

# If you need to pass YouTube cookies to yt-dlp, mount or copy your cookies.txt and add --cookies /app/cookies.txt to yt-dlp args

# Install Node.js dependencies
RUN npm install

EXPOSE 4000

CMD ["node", "index.cjs"]
