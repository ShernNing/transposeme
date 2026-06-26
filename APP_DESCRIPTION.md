# TransposeMe

## *Any song. Any key. Any speed. Instantly.*

An installable Progressive Web App — no app store, no download friction. Open a link, add to home screen, and it works like a native app.

---

## The Problem

The song is perfect — the key is not. Every singer knows this moment: the original artist's range isn't yours, and now you have exactly three options. Strain your voice and sound bad. Learn the song somewhere it doesn't shine. Or change the key of the *recording* — which, until now, meant owning a DAW, understanding time-stretching algorithms, exporting stems, and burning an evening on what should take ten seconds.

Learners hit the mirror image of the problem: that guitar solo or vocal run is too fast to study, and slowing playback down with normal tools drops the pitch into sludge, so you're practicing against something that no longer sounds like the song.

And underneath both problems sits a sneaky third one: **most people don't even know what key the original is in.** You can't transpose intelligently from an unknown starting point — and once you do find the right key, you still need chord sheets written in it.

## The Solution

TransposeMe collapses that entire workflow into one screen. Paste a YouTube link or drop in an audio/video file, drag a slider, and hear the song in a new key *immediately* — playback doesn't even stop. It detects the original key automatically, shows you the music theory as you shift, generates transposed chord sheets, and exports a finished MP3 or MP4. Processing runs **inside your browser via WebAssembly**, which means studio-grade pitch shifting with zero uploads: your files never leave your device.

No DAW. No audio engineering degree. No waiting.

---

## Features — In Detail

### Feed it anything

- **YouTube, straight in.** Paste any link — youtube.com, youtu.be, YouTube Music, Shorts, even live streams — with instant validation. The app extracts the best audio stream and preps it once; every key you try afterward reuses that work, so experimenting is fast.
- **Local files up to 5 GB.** Drag-and-drop MP3, WAV, FLAC, AAC, M4A — or full videos (MP4, MOV, WebM). Video stays video: the picture is remuxed with the shifted audio via FFmpeg, so your transposed file is still a watchable music video.
- **Privacy as architecture, not a promise.** In-browser WASM mode (powered by Rubberband, the same time-stretching engine used in professional audio software) processes everything locally. Your demo, your unreleased track, your voice memo — none of it touches a server.

### Transposition that feels live

- **±12 semitones, zero interruption.** Drag the slider, tap ±1 buttons, or use ← → arrow keys. The audio re-renders and **resumes from the exact same timestamp** — you hear the new key in context instantly, not from the top.
- **Tempo Stretch mode.** Flip one toggle and the same slider changes *speed* instead of pitch: 0.5× to 2×, pitch fully preserved. Slow a solo to half speed and it still sounds like music. This is how practice tools should work.
- **A/B comparison.** One button flips between original and transposed audio mid-playback. Trust your ears, not the math.
- **Full transport controls.** Scrubbing, playback speed presets (0.5×–2×), volume, mute, animated waveform visualization, and a multi-stage progress display so you always know what's happening (downloading → extracting → detecting key).

### It knows music theory so you don't have to

- **Automatic key detection.** One click runs the Essentia analysis algorithm (the academic standard for music information retrieval) and announces the root and mode: *"B♭ minor."* No more guessing, no more googling "what key is…".
- **The 12-key grid.** Once the key is known, every key becomes a button. Tap "E major" and the app computes the shift and applies it. Color coding tells the story at a glance — blue for original, green for now playing, purple "Done" badges on keys you've already rendered, gold stars on your favorites (remembered per song).
- **Theory displayed live.** Original key and current key shown side by side with animated transitions, plus the musical interval of your shift — *"Major 3rd ↑"* — so the change means something.
- **Diatonic chord chart.** The seven chords of the current key, with Roman numerals and qualities, updating live as you transpose. Singers get their key; the band gets their chords.

### From new key to finished chart

- **Chord sheet auto-fetch.** TransposeMe searches your **ChordVault library first**, then falls back to the web (Ultimate Guitar, Worship Together, PNW Chords). Multiple matches? You pick. Nothing found? Paste manually.
- **Auto-transposed to your new key.** The fetched sheet is rewritten into the key you just chose — automatically.
- **Export like a pro.** PDF for the music stand, DOCX for editing — or one click to save the sheet straight into ChordVault for Sunday's setlist.

### Take it with you

- **Download the result.** MP3 or MP4, with smart filenames that encode the shift: `song-name_+5st.mp3`. Confetti included — small thing, feels great.
- **Native sharing.** The system share sheet sends transposed audio to messages, mail, or cloud storage on supported devices.
- **History that works for you.** Every file and link you've processed, searchable and filterable (All / Files / YouTube), with full metadata — duration, sample rate, dimensions. Reload anything in one tap, undo accidental deletes, export/import your history as JSON.

### Engineering you can present with a straight face

- **Multi-layer caching** (source audio per URL, transposed renders in a bounded LRU, key detections memoized) makes repeat operations near-instant; **rate limiting** and Helmet security headers protect the backend.
- **PWA + Electron.** Installable web app (live at transposeme.vercel.app) *and* a packaged desktop app for macOS, Windows, and Linux that auto-launches its own processing server — double-click and go.
- **Polished UI** — aurora gradient background, particle field, magnetic buttons, animated counters — with full keyboard shortcuts, ARIA labeling, WCAG-compliant contrast, and a built-in FAQ.

---

## Who it's for

Singers fitting any song to their range in seconds. Bands rehearsing covers in *their* key with matching chord charts. Teachers handing students practice tracks at 0.75× speed. Producers and creators adapting source material. Anyone who's ever sung along badly and thought, *"this would be perfect two steps down."*

---

## Tech Stack

- **Frontend:** React 19 + Vite 7, Tailwind CSS 4, Motion (Framer Motion successor), Web Audio API
- **In-browser audio engine:** `rubberband-wasm` (WebAssembly — compiled Rubber Band library); formant-preserving study → process → retrieve pipeline over raw `AudioBuffer`; WASM module compiled once and cached across all calls
- **In-browser video remuxing:** `@ffmpeg/ffmpeg` (WebAssembly FFmpeg); copies video stream without re-encoding, replaces audio track only
- **Backend server:** Node.js + Express 5 (`server/index.cjs`)
- **YouTube download:** `yt-dlp` with EJS challenge solver (`--remote-components ejs:github --js-runtimes node`) and parallel fragment download (`-N 4`)
- **Server-side pitch shift:** Rubber Band CLI (`rubberband --formant --ignore-clipping`) applied to PCM 16-bit 44.1 kHz WAV decoded by FFmpeg
- **Key detection:** Python 3 + Essentia (`essentia.standard.KeyExtractor`), called via `execFile` from Node.js, returns `"<root> <scale>"` (e.g., `"Bb minor"`)
- **Chord .docx export:** `docx` npm package
- **Chord PDF export:** `pdf-lib`
- **Storage:** session-scoped in-memory history (React state), `localStorage` for settings persistence
- **Caching (server):** LRU + TTL `BoundedCache` for source audio per URL, transposed renders keyed by `url::semitones::mode`, and key detection results; in-flight deduplication via `pendingJobs` Map
- **Rate limiting:** 20 req/min per IP (sliding window), enforced on all POST endpoints
- **Security:** Helmet headers, CORS origin allowlist, chord proxy restricted to declared hostnames, YouTube URL regex validation, semitone range clamping
- **Deployment:** Vercel/static host (frontend), Node.js service (backend), Electron 41 (desktop — auto-launches backend as child process), Docker via `server/Dockerfile.conda` (conda + essentia), PWA via `vite-plugin-pwa`

---

## Architecture Map

```
transposeme/
├── src/                        # React frontend (Vite)
│   ├── App.jsx                 # Root component, all state wiring
│   ├── components/
│   │   ├── AudioPlayer         # Custom player with animated waveform
│   │   ├── VideoPlayer         # Video player + transposed audio track
│   │   ├── YouTubePlayer       # Embedded original YouTube iframe
│   │   ├── PlayerSection       # Player + A/B toggle wrapper
│   │   ├── TransposeControls   # Semitone slider + tempo mode toggle
│   │   ├── KeySelector         # 12-key grid, picks target key
│   │   ├── ChordSheet          # Live diatonic chord chart (I–VII)
│   │   ├── ChordDocGenerator   # Fetch → transpose → export chord sheet
│   │   ├── ProcessedHistory    # Session history with metadata
│   │   └── fx/                 # Aurora bg, particle field, border beam, etc.
│   ├── hooks/
│   │   ├── useTransposer       # Server-side transpose requests
│   │   ├── useYouTubeTranspose # Full YouTube download + transpose flow
│   │   ├── useFileHandler      # File drag/drop + MIME validation
│   │   ├── useAudioContext     # Shared Web Audio context (lazy init)
│   │   └── useProcessedHistory # Session history management
│   └── utils/
│       ├── wasmTransposer.js   # rubberband-wasm pipeline + chord text transposer
│       ├── videoRemuxer.js     # ffmpeg-wasm: swap audio track in video
│       ├── docExport.js        # .docx and PDF generation
│       ├── chordFetchers.js    # ChordVault API + UG/WorshipTogether/pnwchords proxy
│       ├── keyUtils.js         # Key label transposition arithmetic
│       └── config.js           # All magic numbers (timeouts, limits, ranges)
│
├── server/
│   ├── index.cjs               # Express API server (all endpoints)
│   └── detect_key.py           # Python/Essentia key detection script
│
└── main.cjs                    # Electron main process (spawns backend)
```

---

## Server API Reference

| Endpoint | Method | Body / Params | Returns |
|---|---|---|---|
| `/api/health` | GET | — | `{ ok: true }` |
| `/api/status` | GET | — | Dependency health (yt-dlp, ffmpeg, rubberband, essentia) |
| `/api/youtube-transpose` | POST | `{ url, semitones, tempoMode }` | WAV file (transposed) |
| `/api/youtube-key` | POST | `{ url }` | `{ key: "Bb minor" }` |
| `/api/detect-key` | POST | Raw audio bytes (`application/octet-stream`) + `X-Filename` header | `{ key: "G major" }` |
| `/api/fetch-url` | POST | `{ url }` | HTML text (chord sheet proxy, allowlisted hosts only) |

Allowed proxy hosts: `ultimate-guitar.com`, `worshiptogether.com`, `pnwchords.com`

---

## Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `PORT` | Server | HTTP listen port (default `4000`) |
| `CORS_ORIGIN` | Server | Allowed request origin(s) |
| `COOKIES_PATH` | Server | yt-dlp cookie file for age-restricted videos |
| `VITE_API_BASE_URL` | Frontend | Points frontend at backend URL |
| `VITE_CHORDVAULT_SUPABASE_URL` | Frontend | ChordVault Supabase project URL |
| `VITE_CHORDVAULT_SUPABASE_KEY` | Frontend | ChordVault Supabase anon key |
| `VITE_CHORDVAULT_APP_URL` | Frontend | ChordVault app base URL for deep-links |
