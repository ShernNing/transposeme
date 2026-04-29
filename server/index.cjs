const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { execFile } = require("child_process");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);
const REQUEST_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const YT_TIMEOUT_MS = 120000;
const RUBBERBAND_TIMEOUT_MS = 120000;
const PYTHON_TIMEOUT_MS = 60000;
const MAX_VIDEO_DURATION_SECONDS = 1200;
const COOKIES_PATH = process.env.COOKIES_PATH || '/app/cookies.txt';
const COOKIES_EXISTS = fs.existsSync(COOKIES_PATH);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const CACHE_MAX_SIZE = parseInt(process.env.MAX_CACHE_SIZE || '100', 10);
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

class BoundedCache {
  constructor(maxSize, ttlMs) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.map = new Map();
  }
  _isExpired(entry) {
    return Date.now() - entry.ts > this.ttlMs;
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this._isExpired(entry)) { this.map.delete(key); return undefined; }
    return entry.value;
  }
  has(key) {
    return this.get(key) !== undefined;
  }
  set(key, value) {
    if (this.map.has(key)) this.map.delete(key); // refresh insertion order
    else if (this.map.size >= this.maxSize) {
      // evict oldest entry
      this.map.delete(this.map.keys().next().value);
    }
    this.map.set(key, { value, ts: Date.now() });
  }
}

const transposeCache = new BoundedCache(CACHE_MAX_SIZE, CACHE_TTL_MS);
const keyCache = new BoundedCache(CACHE_MAX_SIZE, CACHE_TTL_MS);
const requestHits = new Map();
// In-flight job deduplication: jobKey -> Promise
const pendingJobs = new Map();



const app = express();
app.set('trust proxy', 1);
app.use(helmet());

const corsOptions = {
  origin: CORS_ORIGIN,
  methods: ['GET', 'POST'],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: '10kb' }));

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

// Periodic tmp cleanup (every hour)
const tmpDir = path.join(__dirname, "tmp");
function cleanupTmpDir() {
  if (!fs.existsSync(tmpDir)) return;
  const now = Date.now();
  const maxAge = 6 * 60 * 60 * 1000; // 6 hours
  fs.readdir(tmpDir, (err, files) => {
    if (err) return;
    files.forEach(file => {
      const filePath = path.join(tmpDir, file);
      fs.stat(filePath, (err, stats) => {
        if (!err && now - stats.mtimeMs > maxAge) {
          fs.unlink(filePath, () => {});
        }
      });
    });
  });
}
setInterval(cleanupTmpDir, 60 * 60 * 1000); // every hour

// Periodically prune stale IPs from the rate-limit map
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of requestHits.entries()) {
    const recent = bucket.filter((ts) => now - ts < REQUEST_WINDOW_MS);
    if (recent.length === 0) requestHits.delete(ip);
    else requestHits.set(ip, recent);
  }
}, REQUEST_WINDOW_MS);

// Add a root route for GET / with API info
app.get("/", (_req, res) => {
  res.status(200).json({
    message: "TransposeMe Server is running.",
    routes: {
      health: "/api/health",
      youtubeKey: "/api/youtube-key (POST)",
      youtubeTranspose: "/api/youtube-transpose (POST)"
    }
  });
});

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason);
});


const YOUTUBE_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/;
function isValidYouTubeUrl(url) {
  try { new URL(url); } catch { return false; }
  return YOUTUBE_URL_RE.test(url);
}

function safeUnlink(filePath) {
  fs.unlink(filePath, () => {});
}

function getClientIp(req) {
  return req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
}

function enforceRateLimit(req, res) {
  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = requestHits.get(ip) || [];
  const recent = bucket.filter((ts) => now - ts < REQUEST_WINDOW_MS);
  recent.push(now);
  requestHits.set(ip, recent);
  if (recent.length > MAX_REQUESTS_PER_WINDOW) {
    res.status(429).json({
      error: "Too many requests",
      hint: "Please wait and try again.",
    });
    return false;
  }
  return true;
}

async function downloadAudio(url, audioPath) {
  const ytDlpArgs = [
    "--extractor-args", "youtube:player_client=android",
    "--proxy", "",
    "--match-filter", `duration <= ${MAX_VIDEO_DURATION_SECONDS}`,
    "-x", "--audio-format", "wav",
    "-o", audioPath,
  ];
  if (COOKIES_EXISTS) {
    ytDlpArgs.unshift("--cookies", COOKIES_PATH);
  }
  ytDlpArgs.push(url);

  await new Promise((resolve, reject) => {
    execFile("yt-dlp", ytDlpArgs, { env: getDirectNetworkEnv(), timeout: YT_TIMEOUT_MS }, (err, _stdout, stderr) => {
      if (err) {
        const e = new Error(stderr || err.message);
        e.stderr = stderr;
        return reject(e);
      }
      resolve();
    });
  });
}

function getDirectNetworkEnv() {
  const env = { ...process.env };
  delete env.HTTP_PROXY;
  delete env.HTTPS_PROXY;
  delete env.ALL_PROXY;
  delete env.http_proxy;
  delete env.https_proxy;
  delete env.all_proxy;
  return env;
}

async function checkCommand(command, args = ["--version"]) {
  try {
    await execFileAsync(command, args);
    return true;
  } catch {
    return false;
  }
}

const DEP_STATUS_TTL_MS = 5 * 60 * 1000; // 5 minutes
let depStatusCache = null;
let depStatusCachedAt = 0;

async function getDependencyStatus({ fresh = false } = {}) {
  if (!fresh && depStatusCache && Date.now() - depStatusCachedAt < DEP_STATUS_TTL_MS) {
    return depStatusCache;
  }
  const pythonBin = process.platform === "win32" ? "python" : "python3";
  const [ytDlpOk, rubberbandOk, pythonOk, ffmpegOk] = await Promise.all([
    checkCommand("yt-dlp"),
    checkCommand("rubberband", ["--version"]),
    checkCommand(pythonBin, ["--version"]),
    checkCommand("ffmpeg", ["-version"]),
  ]);

  let essentiaOk = false;
  if (pythonOk) {
    essentiaOk = await checkCommand(pythonBin, ["-c", "import essentia"]);
  }

  depStatusCache = { ytDlpOk, rubberbandOk, ffmpegOk, pythonOk, essentiaOk, pythonBin };
  depStatusCachedAt = Date.now();
  return depStatusCache;
}

app.get("/api/health", async (_req, res) => {
  const status = await getDependencyStatus({ fresh: true });
  const ok = status.ytDlpOk && status.rubberbandOk && status.ffmpegOk && status.pythonOk;
  const { pythonBin: _pythonBin, ...publicStatus } = status;
  res.status(ok ? 200 : 503).json({
    ok,
    dependencies: publicStatus,
  });
});

// POST /api/youtube-key
// { url: string }
app.post("/api/youtube-key", async (req, res) => {
  if (!enforceRateLimit(req, res)) return;
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing YouTube URL" });
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL", hint: "URL must be a valid youtube.com or youtu.be link." });
  if (keyCache.has(url)) {
    return res.json({ key: keyCache.get(url), cached: true });
  }
  if (pendingJobs.has(url)) {
    try {
      const key = await pendingJobs.get(url);
      return res.json({ key, cached: true });
    } catch (e) {
      return res.status(500).json({ error: "Failed to detect key", details: e.message });
    }
  }
  const deps = await getDependencyStatus();
  if (!deps.ytDlpOk) {
    return res.status(500).json({
      error: "Missing required dependency: yt-dlp",
      hint: "Install yt-dlp and ensure it is available in PATH.",
    });
  }
  if (!deps.pythonOk) {
    return res.status(500).json({
      error: "Missing required dependency: python3",
      hint: "Install Python 3 and ensure python3 is available in PATH.",
    });
  }
  if (!deps.essentiaOk) {
    return res.status(500).json({
      error: "Missing Python module: essentia",
      hint: "Install essentia in the Python environment used by this server.",
    });
  }
  const jobPromise = (async () => {
    const id = uuidv4();
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const audioPath = path.join(tmpDir, `${id}.wav`);
    await downloadAudio(url, audioPath);
    let keyResult = "";
    try {
      await new Promise((resolve, reject) => {
        execFile(
          deps.pythonBin, // already resolved, no need to re-evaluate platform
          [path.join(__dirname, "detect_key.py"), audioPath],
          { env: process.env, timeout: PYTHON_TIMEOUT_MS },
          (err, stdout, stderr) => {
            keyResult = stdout.trim();
            if (err) return reject(new Error(stderr || err));
            resolve();
          },
        );
      });
    } finally {
      safeUnlink(audioPath);
    }
    if (!keyResult) throw new Error("Key detection returned empty result");
    keyCache.set(url, keyResult);
    return keyResult;
  })();

  pendingJobs.set(url, jobPromise);
  try {
    const key = await jobPromise;
    res.json({ key, cached: false });
  } catch (e) {
    res.status(500).json({ error: "Failed to process audio", details: e.message, hint: "Video may be unavailable, blocked, too long, or network/proxy is restricted." });
  } finally {
    pendingJobs.delete(url);
  }
});

// POST /api/youtube-transpose
// { url: string, semitones: number }
app.post("/api/youtube-transpose", async (req, res) => {
  if (!enforceRateLimit(req, res)) return;
  const { url, semitones = 0 } = req.body;
  if (!url) return res.status(400).json({ error: "Missing YouTube URL" });
  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "Invalid YouTube URL", hint: "URL must be a valid youtube.com or youtu.be link." });
  const semitoneNum = Number(semitones);
  if (Number.isNaN(semitoneNum) || semitoneNum < -12 || semitoneNum > 12) {
    return res.status(400).json({ error: "Semitones must be between -12 and 12." });
  }
  const cacheKey = `${url}::${semitoneNum}`;
  if (transposeCache.has(cacheKey) && fs.existsSync(transposeCache.get(cacheKey))) {
    return res.download(transposeCache.get(cacheKey), "transposed.wav");
  }
  if (pendingJobs.has(cacheKey)) {
    try {
      const outPath = await pendingJobs.get(cacheKey);
      return res.download(outPath, "transposed.wav");
    } catch (e) {
      return res.status(500).json({ error: "Failed to transpose audio", details: e.message });
    }
  }
  const deps = await getDependencyStatus();
  if (!deps.ytDlpOk) {
    return res.status(500).json({
      error: "Missing required dependency: yt-dlp",
      hint: "Install yt-dlp and ensure it is available in PATH.",
    });
  }
  if (!deps.rubberbandOk) {
    return res.status(500).json({
      error: "Missing required dependency: rubberband",
      hint: "Install rubberband CLI and ensure it is available in PATH.",
    });
  }
  if (!deps.ffmpegOk) {
    return res.status(500).json({
      error: "Missing required dependency: ffmpeg",
      hint: "Install ffmpeg and ensure it is available in PATH.",
    });
  }
  const jobPromise = (async () => {
    const id = uuidv4();
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const audioPath = path.join(tmpDir, `${id}.wav`);
    const outPath = path.join(tmpDir, `${id}-out.wav`);

    try {
      await downloadAudio(url, audioPath);

      // Convert to 16-bit PCM WAV for rubberband compatibility
      const pcmPath = path.join(tmpDir, `${id}-pcm.wav`);
      await new Promise((resolve, reject) => {
        execFile(
          "ffmpeg",
          ["-y", "-i", audioPath, "-acodec", "pcm_s16le", "-ar", "44100", pcmPath],
          { timeout: 30000 },
          (err, _stdout, stderr) => {
            if (err) return reject(new Error(stderr || err));
            try { fs.unlinkSync(audioPath); } catch {}
            try { fs.renameSync(pcmPath, audioPath); } catch (renameErr) { return reject(renameErr); }
            resolve();
          }
        );
      });

      if (semitoneNum !== 0) {
        await new Promise((resolve, reject) => {
          execFile(
            "rubberband",
            ["-3", "--formant", "-p", semitoneNum.toString(), audioPath, outPath],
            { timeout: RUBBERBAND_TIMEOUT_MS },
            (err, _stdout, stderr) => {
              if (err) return reject(new Error(stderr || err));
              resolve();
            },
          );
        });
      } else {
        fs.copyFileSync(audioPath, outPath);
      }
    } finally {
      safeUnlink(audioPath);
    }

    transposeCache.set(cacheKey, outPath);
    return outPath;
  })();

  pendingJobs.set(cacheKey, jobPromise);
  try {
    const outPath = await jobPromise;
    res.download(outPath, "transposed.wav", (err) => { if (err) safeUnlink(outPath); });
  } catch (e) {
    res.status(500).json({ error: "Failed to process audio", details: e.message, hint: "Video may be unavailable, blocked, too long, or network/proxy is restricted." });
  } finally {
    pendingJobs.delete(cacheKey);
  }
});

const PORT = process.env.PORT || 4000;
const server = app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const deps = await getDependencyStatus();
  if (!deps.ytDlpOk) {
    console.warn("Dependency missing: yt-dlp");
  }
  if (!deps.rubberbandOk) {
    console.warn("Dependency missing: rubberband");
  }
  if (!deps.ffmpegOk) {
    console.warn("Dependency missing: ffmpeg");
  }
  if (!deps.pythonOk) {
    console.warn("Dependency missing: python3");
  } else if (!deps.essentiaOk) {
    console.warn("Python module missing: essentia (youtube-key endpoint will fail)");
  }
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log('Closed out remaining connections.');
    // Clean up temp files
    try {
      cleanupTmpDir();
      console.log('Temp files cleaned up.');
    } catch (e) {
      console.error('Error during temp cleanup:', e);
    }
    process.exit(0);
  });
  // Force exit if not closed in 10s
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
