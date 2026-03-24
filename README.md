# Transpose Application

This web app lets you upload or link to audio/video (including YouTube), transpose the key up or down in real time, and play or download the result. The app preserves tempo and now supports automatic key detection for YouTube links.

## Features

- Upload audio/video files or provide a YouTube link
- Transpose up/down by semitones (tempo preserved)
- Seamless playback position retention
- Automatic key detection for YouTube audio
- Download transposed audio

## Tech Stack

- Frontend: React (Vite)
- Backend: Node.js/Express
- Audio extraction: yt-dlp
- Pitch shifting: Rubber Band CLI
- Key detection: Python + Essentia

## Setup

1. Install Node.js (v20+ recommended)
2. Install yt-dlp and ffmpeg (via Homebrew or your OS package manager)
3. Install Rubber Band CLI (via Homebrew: `brew install rubberband`)
4. Install Python 3 and Essentia:
   - `brew install essentia` (if available)
   - `pip install essentia` (in the server's Python environment)
5. Install project dependencies:
   ```sh
   npm install
   ```

## Running the App

Start the backend server:

```sh
npm run dev:server
```

Start the frontend (from the app root):

```sh
npm run dev
```

Optional health check:

```sh
curl http://localhost:4000/api/health
```

## API

### POST /api/youtube-transpose

- Body: `{ url: string, semitones: number }`
- Returns: transposed audio file (WAV)

### POST /api/youtube-key

- Body: `{ url: string }`
- Returns: `{ key: string }` (e.g., `C major`)

## Notes

- The backend downloads and processes YouTube audio on demand, then deletes temp files.
- Set `VITE_API_BASE_URL` in a `.env` file if your backend is not running on `http://localhost:4000`.
- For production, add error handling, rate limiting, and security as needed.
