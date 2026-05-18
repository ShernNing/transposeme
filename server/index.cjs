const express = require("express");
const { execFile } = require("child_process");
const { promisify } = require("util");
const execFileAsync = promisify(execFile);

// Ensure system binaries and the correct Python are found by child processes.
// Active venvs (e.g. from a different project opened in VSCode) hijack python3 in PATH;
// strip the venv and promote Python framework / Homebrew paths to the front.
{
  const PRIORITY_PATHS = [
    "/Library/Frameworks/Python.framework/Versions/3.13/bin",
    "/Library/Frameworks/Python.framework/Versions/3.12/bin",
    "/Library/Frameworks/Python.framework/Versions/3.11/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
  ];
  const venvBin = process.env.VIRTUAL_ENV
    ? `${process.env.VIRTUAL_ENV}/bin`
    : null;
  // Remove venv bin and any PRIORITY_PATHS from their current positions,
  // then put PRIORITY_PATHS at the front so they always win.
  const baseParts = (process.env.PATH || "")
    .split(":")
    .filter((p) => p !== venvBin && !PRIORITY_PATHS.includes(p) && p.length > 0);
  process.env.PATH = [...PRIORITY_PATHS, ...baseParts].join(":");
  delete process.env.VIRTUAL_ENV;
  delete process.env.VIRTUAL_ENV_PROMPT;
}

// Dependency check helpers
const REQUIRED_BINARIES = ["ffmpeg", "rubberband"];
const REQUIRED_PYTHON = process.platform === "win32" ? "python" : "python3";
// essentia is optional (youtube-key endpoint only) — not included here to avoid
// arm64/x86_64 arch mismatch on Apple Silicon where essentia may be x86_64 compiled.
const REQUIRED_PYTHON_MODULES = ["yt_dlp"];

async function checkBinary(cmd) {
  try {
    await execFileAsync("which", [cmd]);
    return true;
  } catch {
    return false;
  }
}

async function checkPythonModule(module) {
  try {
    await execFileAsync(REQUIRED_PYTHON, ["-c", `import ${module}`]);
    return true;
  } catch {
    return false;
  }
}

async function checkAllDependencies() {
  const results = {};
  for (const bin of REQUIRED_BINARIES) {
    results[bin] = await checkBinary(bin);
  }
  results[REQUIRED_PYTHON] = await checkBinary(REQUIRED_PYTHON);
  for (const mod of REQUIRED_PYTHON_MODULES) {
    results[mod] = await checkPythonModule(mod);
  }
  return results;
}

async function printDependencyErrors(results) {
  let ok = true;
  for (const [dep, present] of Object.entries(results)) {
    if (!present) {
      ok = false;
      console.error(`\x1b[31m[ERROR]\x1b[0m Missing dependency: ${dep}`);
    }
  }
  if (!ok) {
    console.error(
      "\x1b[33mPlease install the missing dependencies and restart the server.\x1b[0m",
    );
    console.error("\x1b[33mSee README.md for setup instructions.\x1b[0m");
  }
}

(async () => {
  const depResults = await checkAllDependencies();
  await printDependencyErrors(depResults);
})();
const cors = require("cors");
const helmet = require("helmet");
const fs = require("fs");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const REQUEST_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const YT_TIMEOUT_MS = 120000;
const RUBBERBAND_TIMEOUT_MS = 120000;
const RB_THREADS = String(Math.max(2, Math.min(os.cpus().length, 8)));
const PYTHON_TIMEOUT_MS = 60000;
const MAX_VIDEO_DURATION_SECONDS = 1200;
const COOKIES_PATH = process.env.COOKIES_PATH || "/app/cookies.txt";
const COOKIES_EXISTS = fs.existsSync(COOKIES_PATH);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
if (CORS_ORIGIN === "*" && process.env.NODE_ENV === "production") {
  console.warn("[startup] Warning: CORS_ORIGIN is wildcard (*) in production. Set CORS_ORIGIN env var to restrict access.");
}
const CACHE_MAX_SIZE = parseInt(process.env.MAX_CACHE_SIZE || "100", 10);
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
    if (this._isExpired(entry)) {
      this.map.delete(key);
      return undefined;
    }
    return entry.value;
  }
  has(key) {
    return this.get(key) !== undefined;
  }
  set(key, value) {
    if (this.map.has(key))
      this.map.delete(key); // refresh insertion order
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
app.set("trust proxy", 1);
app.use(helmet());

const corsOptions = {
  origin: CORS_ORIGIN,
  methods: ["GET", "POST"],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10kb" }));

// Log environment info at startup (mask sensitive values)
function logEnv() {
  const env = { ...process.env };
  if (env.PATH) env.PATH = env.PATH.split(":").slice(0, 3).join(":") + "...";
  if (env.NODE_BINARY) env.NODE_BINARY = "[set]";
  if (env.IS_BACKEND) env.IS_BACKEND = "[set]";
  console.log("[startup] Environment:", env);
}
logEnv();

// Request logging middleware (detailed)
app.use((req, res, next) => {
  const start = Date.now();
  const logBody =
    req.method === "POST" ? ` body=${JSON.stringify(req.body)}` : "";
  res.on("finish", () => {
    const duration = Date.now() - start;
    console.log(
      `[request] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms${logBody}`,
    );
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
    files.forEach((file) => {
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
      youtubeTranspose: "/api/youtube-transpose (POST)",
      fetchUrl: "/api/fetch-url (POST)",
    },
  });
});

const ALLOWED_CHORD_HOSTS = new Set([
  "www.ultimate-guitar.com",
  "tabs.ultimate-guitar.com",
  "www.worshiptogether.com",
  "worshiptogether.com",
  "pnwchords.com",
  "www.pnwchords.com",
]);

// POST /api/fetch-url
// { url: string }
// Proxy for chord sheet fetching — only allowed hosts above.
const axios = require("axios");
app.post("/api/fetch-url", async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== "string")
    return res.status(400).json({ error: "Missing url" });
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return res.status(400).json({ error: "Invalid URL" });
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    return res.status(400).json({ error: "Only http/https URLs allowed" });
  if (!ALLOWED_CHORD_HOSTS.has(parsed.hostname))
    return res.status(403).json({ error: "Host not allowed" });

  try {
    const response = await axios.get(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Accept-Encoding": "gzip, deflate, br",
      },
      timeout: 15000,
      maxRedirects: 5,
      maxContentLength: 5 * 1024 * 1024,
      responseType: "text",
      validateStatus: (status) => status < 500,
      beforeRedirect: (options, { headers }) => {
        const location = headers.location;
        if (location) {
          try {
            const redirectHost = new URL(location, url).hostname;
            if (!ALLOWED_CHORD_HOSTS.has(redirectHost)) {
              throw new Error(`Redirect to disallowed host: ${redirectHost}`);
            }
          } catch (e) {
            throw e;
          }
        }
      },
    });
    if (response.status >= 400) {
      return res.status(404).json({ error: `Upstream returned ${response.status}` });
    }
    res.type("text/plain").send(response.data);
  } catch (e) {
    res.status(500).json({ error: "Fetch failed", details: e.message });
  }
});

// Global error handlers
process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

const YOUTUBE_URL_RE =
  /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts\/)/;
function isValidYouTubeUrl(url) {
  try {
    new URL(url);
  } catch {
    return false;
  }
  return YOUTUBE_URL_RE.test(url);
}

function safeUnlink(filePath) {
  fs.unlink(filePath, () => {});
}

function getClientIp(req) {
  return (
    req.ip ||
    req.headers["x-forwarded-for"] ||
    req.socket.remoteAddress ||
    "unknown"
  );
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
    "--extractor-args",
    "youtube:player_client=tv_embedded,web",
    "--proxy",
    "",
    "--match-filter",
    `duration <= ${MAX_VIDEO_DURATION_SECONDS}`,
    "-x",
    "--audio-format",
    "wav",
    "-o",
    audioPath,
  ];
  if (COOKIES_EXISTS) {
    ytDlpArgs.unshift("--cookies", COOKIES_PATH);
  }
  ytDlpArgs.push(url);

  await new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      ytDlpArgs,
      { env: getDirectNetworkEnv(), timeout: YT_TIMEOUT_MS },
      (err, _stdout, stderr) => {
        if (err) {
          const e = new Error(stderr || err.message);
          e.stderr = stderr;
          return reject(e);
        }
        resolve();
      },
    );
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
  if (
    !fresh &&
    depStatusCache &&
    Date.now() - depStatusCachedAt < DEP_STATUS_TTL_MS
  ) {
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

  depStatusCache = {
    ytDlpOk,
    rubberbandOk,
    ffmpegOk,
    pythonOk,
    essentiaOk,
    pythonBin,
  };
  depStatusCachedAt = Date.now();
  return depStatusCache;
}

app.get("/api/health", async (_req, res) => {
  const status = await getDependencyStatus({ fresh: true });
  const ok =
    status.ytDlpOk && status.rubberbandOk && status.ffmpegOk && status.pythonOk;
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
  if (!isValidYouTubeUrl(url))
    return res.status(400).json({
      error: "Invalid YouTube URL",
      hint: "URL must be a valid youtube.com or youtu.be link.",
    });
  if (keyCache.has(url)) {
    return res.json({ key: keyCache.get(url), cached: true });
  }
  if (pendingJobs.has(url)) {
    try {
      const key = await pendingJobs.get(url);
      return res.json({ key, cached: true });
    } catch (e) {
      return res
        .status(500)
        .json({ error: "Failed to detect key", details: e.message });
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
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });

    // Reuse already-downloaded audio from a prior transpose(semitones=0) request if available
    const transposeCacheKey = `${url}::0::p`;
    const cachedAudioPath = transposeCache.has(transposeCacheKey)
      ? transposeCache.get(transposeCacheKey)
      : null;
    const reusingCached = cachedAudioPath && fs.existsSync(cachedAudioPath);

    let audioPath;
    if (reusingCached) {
      audioPath = cachedAudioPath;
    } else {
      audioPath = path.join(tmpDir, `${uuidv4()}.wav`);
      await downloadAudio(url, audioPath);
    }

    let keyResult = "";
    try {
      await new Promise((resolve, reject) => {
        execFile(
          deps.pythonBin,
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
      if (!reusingCached) safeUnlink(audioPath);
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
    res.status(500).json({
      error: "Failed to process audio",
      details: e.message,
      hint: "Video may be unavailable, blocked, too long, or network/proxy is restricted.",
    });
  } finally {
    pendingJobs.delete(url);
  }
});

// POST /api/detect-key
// Body: raw audio binary (application/octet-stream)
// Header: X-Filename: originalfile.mp3
app.post("/api/detect-key", express.raw({ type: "application/octet-stream", limit: "100mb" }), async (req, res) => {
  if (!enforceRateLimit(req, res)) return;
  if (!req.body || !req.body.length) return res.status(400).json({ error: "No audio data provided" });
  const deps = await getDependencyStatus();
  if (!deps.pythonOk) return res.status(500).json({ error: "Missing python3", hint: "Install Python 3." });
  if (!deps.essentiaOk) return res.status(500).json({ error: "Missing essentia", hint: "pip install essentia" });
  const rawName = req.headers["x-filename"] || "";
  const ext = path.extname(rawName).toLowerCase() || ".mp3";
  const id = uuidv4();
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const audioPath = path.join(tmpDir, `${id}${ext}`);
  try {
    fs.writeFileSync(audioPath, req.body);
    let keyResult = "";
    await new Promise((resolve, reject) => {
      execFile(
        deps.pythonBin,
        [path.join(__dirname, "detect_key.py"), audioPath],
        { env: process.env, timeout: PYTHON_TIMEOUT_MS },
        (err, stdout, stderr) => {
          keyResult = stdout.trim();
          if (err) return reject(new Error(stderr || err.message));
          resolve();
        },
      );
    });
    if (!keyResult) throw new Error("Key detection returned empty result");
    res.json({ key: keyResult });
  } catch (e) {
    res.status(500).json({ error: "Failed to detect key", details: e.message });
  } finally {
    safeUnlink(audioPath);
  }
});

// POST /api/youtube-transpose
// { url: string, semitones: number }
app.post("/api/youtube-transpose", async (req, res) => {
  if (!enforceRateLimit(req, res)) return;
  const { url, semitones = 0, tempoMode = false } = req.body;
  if (!url) return res.status(400).json({ error: "Missing YouTube URL" });
  if (!isValidYouTubeUrl(url))
    return res.status(400).json({
      error: "Invalid YouTube URL",
      hint: "URL must be a valid youtube.com or youtu.be link.",
    });
  const semitoneNum = Number(semitones);
  if (Number.isNaN(semitoneNum) || semitoneNum < -12 || semitoneNum > 12) {
    return res
      .status(400)
      .json({ error: "Semitones must be between -12 and 12." });
  }
  const isTempo = tempoMode === true;
  const cacheKey = `${url}::${semitoneNum}::${isTempo ? "t" : "p"}`;
  if (
    transposeCache.has(cacheKey) &&
    fs.existsSync(transposeCache.get(cacheKey))
  ) {
    return res.download(transposeCache.get(cacheKey), "transposed.wav");
  }
  if (pendingJobs.has(cacheKey)) {
    try {
      const outPath = await pendingJobs.get(cacheKey);
      return res.download(outPath, "transposed.wav");
    } catch (e) {
      return res
        .status(500)
        .json({ error: "Failed to transpose audio", details: e.message });
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

      if (semitoneNum !== 0 || isTempo) {
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
              try { fs.renameSync(pcmPath, audioPath); } catch (e) { return reject(e); }
              resolve();
            },
          );
        });

        const timeRatio = (1 / Math.pow(2, semitoneNum / 12)).toFixed(6);
        const rbArgs = ["--threads", RB_THREADS, "--formant"];
        if (isTempo) {
          rbArgs.push("-t", timeRatio);
        } else {
          rbArgs.push("-p", semitoneNum.toString());
        }
        rbArgs.push(audioPath, outPath);
        await new Promise((resolve, reject) => {
          execFile(
            "rubberband",
            rbArgs,
            { timeout: RUBBERBAND_TIMEOUT_MS },
            (err, _stdout, stderr) => {
              if (err) return reject(new Error(stderr || err));
              resolve();
            },
          );
        });
      } else {
        // No pitch/tempo change — skip PCM conversion entirely
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
    res.download(outPath, "transposed.wav", (err) => {
      if (err) safeUnlink(outPath);
    });
  } catch (e) {
    res.status(500).json({
      error: "Failed to process audio",
      details: e.message,
      hint: "Video may be unavailable, blocked, too long, or network/proxy is restricted.",
    });
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
    console.warn(
      "Python module missing: essentia (youtube-key endpoint will fail)",
    );
  }
});

// Graceful shutdown
function shutdown(signal) {
  console.log(`\nReceived ${signal}. Shutting down gracefully...`);
  server.close(() => {
    console.log("Closed out remaining connections.");
    // Clean up temp files
    try {
      cleanupTmpDir();
      console.log("Temp files cleaned up.");
    } catch (e) {
      console.error("Error during temp cleanup:", e);
    }
    process.exit(0);
  });
  // Force exit if not closed in 10s
  setTimeout(() => {
    console.error(
      "Could not close connections in time, forcefully shutting down",
    );
    process.exit(1);
  }, 10000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
