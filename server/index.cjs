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

if (require.main === module) {
  (async () => {
    const depResults = await checkAllDependencies();
    await printDependencyErrors(depResults);
  })();
}
const cors = require("cors");
const helmet = require("helmet");
const fs = require("fs");
const os = require("os");
const { v4: uuidv4 } = require("uuid");
const path = require("path");
const REQUEST_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 20;
const YT_TIMEOUT_MS = 300000;
const RUBBERBAND_TIMEOUT_MS = 600000;
const PYTHON_TIMEOUT_MS = 60000;
const MAX_VIDEO_DURATION_SECONDS = 1200;
const COOKIES_PATH = process.env.COOKIES_PATH || "/app/cookies.txt";
const COOKIES_EXISTS = fs.existsSync(COOKIES_PATH);

// --- YouTube extraction tuning (all overridable via env) ---------------------
// Optional proxy for yt-dlp. Datacenter IPs (Render, etc.) get bot-flagged by
// YouTube; routing through a residential/mobile proxy is the single biggest fix.
// Example: "http://user:pass@host:port" or "socks5://host:port".
const YTDLP_PROXY = process.env.YTDLP_PROXY || "";
// Player clients tried in order. YouTube breaks individual clients frequently,
// so we rotate. Override with a comma list, e.g. "tv,web_safari,mweb".
const YTDLP_PLAYER_CLIENTS = (
  process.env.YTDLP_PLAYER_CLIENTS || "default,tv,web_safari,mweb"
)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
// PO Token (Proof-of-Origin) provider base URL. With the bgutil yt-dlp plugin +
// a reachable provider server, yt-dlp can fetch without (or alongside) cookies —
// the most robust fix for datacenter blocks. e.g. "http://127.0.0.1:4416".
const POT_PROVIDER_BASE_URL = process.env.POT_PROVIDER_BASE_URL || "";
// Whole-loop retries over the client rotation on transient failure.
const YTDLP_MAX_ATTEMPTS = Math.max(
  1,
  parseInt(process.env.YTDLP_MAX_ATTEMPTS || "2", 10) || 2,
);
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
if (CORS_ORIGIN === "*" && process.env.NODE_ENV === "production") {
  console.warn("[startup] Warning: CORS_ORIGIN is wildcard (*) in production. Set CORS_ORIGIN env var to restrict access.");
}
const CACHE_MAX_SIZE = parseInt(process.env.MAX_CACHE_SIZE || "100", 10);
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

class BoundedCache {
  // onEvict(value) runs when an entry is dropped (TTL expiry, LRU eviction, or
  // overwrite). Caches that store temp-file paths pass safeUnlink here so the
  // file is deleted from disk instead of leaking until the 6h sweep.
  constructor(maxSize, ttlMs, onEvict) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.onEvict = onEvict;
    this.map = new Map();
  }
  _isExpired(entry) {
    return Date.now() - entry.ts > this.ttlMs;
  }
  _evict(value) {
    if (this.onEvict) {
      try {
        this.onEvict(value);
      } catch {
        /* best-effort cleanup */
      }
    }
  }
  get(key) {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (this._isExpired(entry)) {
      this.map.delete(key);
      this._evict(entry.value);
      return undefined;
    }
    return entry.value;
  }
  has(key) {
    return this.get(key) !== undefined;
  }
  set(key, value) {
    const existing = this.map.get(key);
    if (existing) {
      this.map.delete(key); // refresh insertion order
      if (existing.value !== value) this._evict(existing.value);
    } else if (this.map.size >= this.maxSize) {
      // evict oldest entry
      const oldestKey = this.map.keys().next().value;
      const oldest = this.map.get(oldestKey);
      this.map.delete(oldestKey);
      this._evict(oldest.value);
    }
    this.map.set(key, { value, ts: Date.now() });
  }
}

// transposeCache and sourceCache store temp-file paths — unlink on eviction.
const transposeCache = new BoundedCache(CACHE_MAX_SIZE, CACHE_TTL_MS, (p) =>
  safeUnlink(p),
);
const keyCache = new BoundedCache(CACHE_MAX_SIZE, CACHE_TTL_MS);
// Decoded source audio (PCM 16le 44.1k wav) cached per URL — downloaded + decoded
// once, then reused for every transpose/key request. Avoids re-downloading the
// same video for each semitone change.
const sourceCache = new BoundedCache(CACHE_MAX_SIZE, CACHE_TTL_MS, (p) =>
  safeUnlink(p),
);
const requestHits = new Map();
// In-flight job deduplication: jobKey -> Promise
const pendingJobs = new Map();
// In-flight source download/decode dedup: url -> Promise<pcmPath>
const pendingSource = new Map();

const app = express();
app.set("trust proxy", 1);
app.use(helmet());

const corsOptions = {
  origin: CORS_ORIGIN,
  methods: ["GET", "POST"],
};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10kb" }));

// Log a safe allowlist of env vars at startup. Never dump full process.env —
// it leaks secrets (cookies path, API keys, tokens) into logs.
function logEnv() {
  // YTDLP_PROXY omitted on purpose — it can embed proxy credentials.
  const SAFE_KEYS = [
    "NODE_ENV",
    "PORT",
    "CORS_ORIGIN",
    "COOKIES_PATH",
    "YTDLP_PLAYER_CLIENTS",
    "POT_PROVIDER_BASE_URL",
  ];
  const safe = {};
  for (const k of SAFE_KEYS) {
    if (process.env[k] != null) safe[k] = process.env[k];
  }
  if (process.env.PATH)
    safe.PATH = process.env.PATH.split(":").slice(0, 3).join(":") + "...";
  console.log("[startup] Environment:", safe);
}
if (require.main === module) logEnv();

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
setInterval(cleanupTmpDir, 60 * 60 * 1000).unref(); // every hour

// Periodically prune stale IPs from the rate-limit map
setInterval(() => {
  const now = Date.now();
  for (const [ip, bucket] of requestHits.entries()) {
    const recent = bucket.filter((ts) => now - ts < REQUEST_WINDOW_MS);
    if (recent.length === 0) requestHits.delete(ip);
    else requestHits.set(ip, recent);
  }
}, REQUEST_WINDOW_MS).unref();

// Add a root route for GET / with API info
app.get("/", (_req, res) => {
  res.status(200).json({
    message: "TransposeMe Server is running.",
    routes: {
      health: "/api/health",
      status: "/api/status",
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

async function getWritableCookiesPath() {
  if (!COOKIES_EXISTS) return null;
  // /etc/secrets is read-only on Render; copy to writable tmp location
  const dest = path.join(tmpDir, "cookies.txt");
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  fs.copyFileSync(COOKIES_PATH, dest);
  return dest;
}

// Map raw yt-dlp/ffmpeg stderr to a typed, user-actionable error. Lets the
// frontend show a useful message instead of a wall of yt-dlp output, and lets
// downloadAudio decide whether rotating to another client could help.
const YT_ERROR_PATTERNS = [
  {
    re: /sign in to confirm|not a bot|confirm you'?re|consent|account.*cookies|use --cookies/i,
    code: "BOT_CHECK",
    hint: "YouTube is blocking this server (bot check). Refresh cookies, enable a PO-token provider, or use the desktop app (downloads from your own connection).",
    retryable: true,
  },
  {
    re: /private video|video unavailable|has been removed|account.*terminated|who has blocked it|not available in your country|region/i,
    code: "UNAVAILABLE",
    hint: "This video is private, removed, or region-locked.",
    retryable: false,
  },
  {
    re: /requested format is not available|no video formats|unable to extract|drm/i,
    code: "FORMAT",
    hint: "Could not extract a downloadable stream. The video may be DRM-protected, a live stream, or yt-dlp needs updating.",
    retryable: true,
  },
  {
    re: /http error 429|too many requests|rate.?limit/i,
    code: "RATE_LIMIT",
    hint: "YouTube rate-limited this server. Wait a minute and retry, or route through a proxy.",
    retryable: true,
  },
  {
    re: /does not pass filter|duration.*<=|matchfilter/i,
    code: "TOO_LONG",
    hint: `Video exceeds the ${Math.round(MAX_VIDEO_DURATION_SECONDS / 60)}-minute limit.`,
    retryable: false,
  },
  {
    re: /timed out|timeout/i,
    code: "TIMEOUT",
    hint: "Download timed out. Try again, or use a shorter video.",
    retryable: true,
  },
];

function classifyYtError(stderr = "") {
  for (const p of YT_ERROR_PATTERNS) {
    if (p.re.test(stderr))
      return { code: p.code, hint: p.hint, retryable: p.retryable };
  }
  return {
    code: "UNKNOWN",
    hint: "Video may be unavailable, blocked, too long, or the network is restricted.",
    retryable: true,
  };
}

function decorateYtError(e) {
  const raw = e?.stderr || e?.message || "yt-dlp failed";
  const { code, hint } = classifyYtError(raw);
  const err = new Error(raw);
  err.code = code;
  err.hint = hint;
  err.stderr = e?.stderr;
  return err;
}

// Consistent JSON body for a failed extraction. Carries the typed `code` and a
// user-facing `hint` so the frontend can show something better than raw stderr.
function ytErrorResponse(e, error = "Failed to process audio") {
  const { code, hint } = e?.code
    ? { code: e.code, hint: e.hint }
    : classifyYtError(e?.message || "");
  return { error, code: code || "UNKNOWN", details: e?.message, hint };
}

// Build the yt-dlp argv for one player client. Cookies, proxy and PO-token
// provider are all optional and only added when configured.
function buildYtDlpArgs({ url, outPath, client, cookiesPath }) {
  const args = [
    // EJS challenge solver (sig/n decryption). Node.js is in the Docker image.
    "--remote-components",
    "ejs:github",
    "--js-runtimes",
    "node",
    "--extractor-args",
    `youtube:player_client=${client}`,
    "--match-filter",
    `duration <= ${MAX_VIDEO_DURATION_SECONDS}`,
    "-f",
    "bestaudio/best",
    "-N",
    "4",
    "-o",
    outPath,
  ];
  if (POT_PROVIDER_BASE_URL) {
    args.push(
      "--extractor-args",
      `youtubepot-bgutilhttp:base_url=${POT_PROVIDER_BASE_URL}`,
    );
  }
  if (YTDLP_PROXY) {
    args.push("--proxy", YTDLP_PROXY);
  }
  if (cookiesPath) {
    args.unshift("--cookies", cookiesPath);
  }
  args.push(url);
  return args;
}

function runYtDlp(args) {
  return new Promise((resolve, reject) => {
    execFile(
      "yt-dlp",
      args,
      { env: getNetworkEnv(), timeout: YT_TIMEOUT_MS },
      (err, _stdout, stderr) => {
        if (err) {
          const e = new Error(stderr || err.message);
          e.stderr = stderr || err.message;
          return reject(e);
        }
        resolve();
      },
    );
  });
}

// Download the native best-audio stream to outPath (raw container — m4a/opus/webm).
// No WAV extraction here: decoding to PCM happens once in getSourceAudio, avoiding a
// redundant transcode. `-N` downloads fragments in parallel for faster network IO.
//
// Rotates through YTDLP_PLAYER_CLIENTS and retries the whole loop YTDLP_MAX_ATTEMPTS
// times — YouTube breaks individual clients constantly, so a single hardcoded client
// fails far more often than a rotation. Stops early on non-retryable errors
// (private/removed video, too long) so we fail fast with a clear reason.
async function downloadAudio(url, outPath) {
  const cookiesPath = await getWritableCookiesPath();
  const clients = YTDLP_PLAYER_CLIENTS.length
    ? YTDLP_PLAYER_CLIENTS
    : ["default"];
  let lastErr;
  for (let attempt = 0; attempt < YTDLP_MAX_ATTEMPTS; attempt++) {
    for (const client of clients) {
      try {
        await runYtDlp(buildYtDlpArgs({ url, outPath, client, cookiesPath }));
        return; // success
      } catch (e) {
        lastErr = e;
        const { code, retryable } = classifyYtError(e.stderr);
        safeUnlink(outPath); // remove any partial file before retrying
        safeUnlink(outPath + ".part");
        if (!retryable) throw decorateYtError(e);
        console.warn(
          `[yt-dlp] client=${client} attempt=${attempt + 1}/${YTDLP_MAX_ATTEMPTS} failed: ${code}`,
        );
      }
    }
  }
  throw decorateYtError(lastErr || new Error("yt-dlp failed"));
}

// Returns a path to the decoded source audio (PCM 16le 44.1k WAV) for a URL,
// cached per URL. Downloads + decodes once; subsequent calls (other semitones,
// key detection) reuse the same file. Concurrent callers share one in-flight job.
async function getSourceAudio(url) {
  const cached = sourceCache.get(url);
  if (cached && fs.existsSync(cached)) return cached;
  if (pendingSource.has(url)) return pendingSource.get(url);

  const promise = (async () => {
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    const id = uuidv4();
    const dlPath = path.join(tmpDir, `${id}.download`);
    const pcmPath = path.join(tmpDir, `${id}-src.wav`);
    await downloadAudio(url, dlPath);
    // Single decode: native container -> PCM 16le 44.1k WAV (rubberband + essentia ready)
    await new Promise((resolve, reject) => {
      execFile(
        "ffmpeg",
        ["-y", "-i", dlPath, "-acodec", "pcm_s16le", "-ar", "44100", pcmPath],
        { timeout: 60000 },
        (err, _stdout, stderr) => {
          safeUnlink(dlPath);
          if (err) return reject(new Error(stderr || err));
          resolve();
        },
      );
    });
    sourceCache.set(url, pcmPath);
    return pcmPath;
  })();

  pendingSource.set(url, promise);
  try {
    return await promise;
  } finally {
    pendingSource.delete(url);
  }
}

// When YTDLP_PROXY is configured, the explicit --proxy flag drives routing, so
// pass the env through untouched. Otherwise strip ambient proxy vars so a stray
// HTTP_PROXY on the host can't silently route (and break) yt-dlp.
function getNetworkEnv() {
  if (YTDLP_PROXY) return process.env;
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

app.get("/api/health", (_req, res) => {
  res.status(200).json({ ok: true });
});

app.get("/api/status", async (_req, res) => {
  const status = await getDependencyStatus({ fresh: true });
  const ok =
    status.ytDlpOk && status.rubberbandOk && status.ffmpegOk && status.pythonOk;
  const { pythonBin: _pythonBin, ...publicStatus } = status;
  res.status(ok ? 200 : 503).json({
    ok,
    dependencies: publicStatus,
    // Booleans only — never leak proxy URL / cookie contents.
    youtube: {
      cookiesConfigured: COOKIES_EXISTS,
      proxyConfigured: !!YTDLP_PROXY,
      potProviderConfigured: !!POT_PROVIDER_BASE_URL,
      playerClients: YTDLP_PLAYER_CLIENTS,
    },
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
      return res.status(502).json(ytErrorResponse(e, "Failed to detect key"));
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
    // Reuse the decoded source audio cached per URL (shared with transpose).
    // Do not delete it here — it stays cached for subsequent requests.
    const audioPath = await getSourceAudio(url);

    let keyResult = "";
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
    if (!keyResult) throw new Error("Key detection returned empty result");
    keyCache.set(url, keyResult);
    return keyResult;
  })();

  pendingJobs.set(url, jobPromise);
  try {
    const key = await jobPromise;
    res.json({ key, cached: false });
  } catch (e) {
    res.status(502).json(ytErrorResponse(e, "Failed to process audio"));
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
  // Strip playlist/radio params — yt-dlp fetches playlist metadata which
  // hits YouTube's rate limit. Only the video ID is needed.
  const normalizedUrl = (() => {
    try {
      const u = new URL(url);
      const videoId = u.searchParams.get("v");
      if (videoId && (u.hostname.includes("youtube.com"))) {
        return `https://www.youtube.com/watch?v=${videoId}`;
      }
    } catch (_) {}
    return url;
  })();
  const semitoneNum = Number(semitones);
  if (Number.isNaN(semitoneNum) || semitoneNum < -12 || semitoneNum > 12) {
    return res
      .status(400)
      .json({ error: "Semitones must be between -12 and 12." });
  }
  const isTempo = tempoMode === true;
  const cacheKey = `${normalizedUrl}::${semitoneNum}::${isTempo ? "t" : "p"}`;
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
        .status(502)
        .json(ytErrorResponse(e, "Failed to transpose audio"));
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
    const outPath = path.join(tmpDir, `${id}-out.wav`);

    // Cached, decoded source PCM (downloaded once per URL). Never unlinked here.
    const srcPath = await getSourceAudio(normalizedUrl);

    if (semitoneNum !== 0 || isTempo) {
      const timeRatio = (1 / Math.pow(2, semitoneNum / 12)).toFixed(6);
      const rbArgs = ["-R", "--formant", "--ignore-clipping"];
      if (isTempo) {
        rbArgs.push("-t", timeRatio);
      } else {
        rbArgs.push("-p", semitoneNum.toString());
      }
      rbArgs.push(srcPath, outPath);
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
      // No pitch/tempo change — serve a copy of the source PCM
      fs.copyFileSync(srcPath, outPath);
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
    res.status(502).json(ytErrorResponse(e, "Failed to process audio"));
  } finally {
    pendingJobs.delete(cacheKey);
  }
});

// Graceful shutdown
function shutdown(server, signal) {
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

// Only boot the HTTP server when run directly (not when imported by tests).
if (require.main === module) {
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

  process.on("SIGINT", () => shutdown(server, "SIGINT"));
  process.on("SIGTERM", () => shutdown(server, "SIGTERM"));
}

module.exports = {
  app,
  BoundedCache,
  isValidYouTubeUrl,
  classifyYtError,
  buildYtDlpArgs,
};
