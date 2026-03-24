# Transpose App Server

## Prerequisites

- Node.js (v16+ recommended)
- yt-dlp (install via `pip install yt-dlp` or your OS package manager)
- ffmpeg (install via your OS package manager)
- Rubber Band CLI (install via Homebrew: `brew install rubberband`)
- Python 3 and Essentia (for key detection)

## Setup

1. Install dependencies:
   ```sh
   npm install express cors uuid
   ```
2. Ensure `yt-dlp`, `ffmpeg`, and `rubberband` are available in your PATH.
3. Install Essentia in your Python environment:
   ```sh
   pip install essentia
   ```

## Running the Server

```sh
node index.cjs
```

## API

### POST /api/youtube-transpose

- Body: `{ url: string, semitones: number }`
- Returns: transposed audio file (WAV)

### POST /api/youtube-key

- Body: `{ url: string }`
- Returns: `{ key: string }` (e.g., `C major`)

## Notes

- This server downloads and processes YouTube audio on demand, then deletes temp files.
- For production, add error handling, rate limiting, and security as needed.
