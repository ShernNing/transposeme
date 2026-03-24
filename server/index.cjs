const express = require("express");
const cors = require("cors");
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
const transposeCache = new Map();
const keyCache = new Map();
const requestHits = new Map();

const app = express();
app.use(cors());
app.use(express.json());

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

async function getDependencyStatus() {
  const pythonBin = process.platform === "win32" ? "python" : "python3";
  const [ytDlpOk, rubberbandOk, pythonOk] = await Promise.all([
    checkCommand("yt-dlp"),
    checkCommand("rubberband", ["--version"]),
    checkCommand(pythonBin, ["--version"]),
  ]);

  let essentiaOk = false;
  if (pythonOk) {
    essentiaOk = await checkCommand(pythonBin, ["-c", "import essentia"]);
  }

  return {
    ytDlpOk,
    rubberbandOk,
    pythonOk,
    essentiaOk,
    pythonBin,
  };
}

app.get("/api/health", async (_req, res) => {
  const status = await getDependencyStatus();
  const ok = status.ytDlpOk && status.rubberbandOk && status.pythonOk;
  res.status(ok ? 200 : 503).json({
    ok,
    dependencies: status,
  });
});

// POST /api/youtube-key
// { url: string }
app.post("/api/youtube-key", async (req, res) => {
  if (!enforceRateLimit(req, res)) return;
  const { url } = req.body;
  if (!url) return res.status(400).json({ error: "Missing YouTube URL" });
  if (keyCache.has(url)) {
    return res.json({ key: keyCache.get(url), cached: true });
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
  const id = uuidv4();
  const tempDir = path.join(__dirname, "tmp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  const audioPath = path.join(tempDir, `${id}.wav`);
  let ytDlpStdout = "";
  let ytDlpStderr = "";
  try {
    const ytDlpArgs = [
      "--proxy",
      "",
      "--match-filter",
      `duration <= ${MAX_VIDEO_DURATION_SECONDS}`,
      "-x",
      "--audio-format",
      "wav",
      "-o",
      audioPath,
      url,
    ];
    await new Promise((resolve, reject) => {
      execFile("yt-dlp", ytDlpArgs, { env: getDirectNetworkEnv(), timeout: YT_TIMEOUT_MS }, (err, stdout, stderr) => {
        ytDlpStdout = stdout;
        ytDlpStderr = stderr;
        if (err) return reject(stderr || err);
        resolve();
      });
    });
  } catch (e) {
    return res.status(500).json({
      error: "Failed to download audio from YouTube",
      details: e.toString(),
      ytDlpStdout,
      ytDlpStderr,
      hint: "Video may be unavailable, blocked, too long, or network/proxy is restricted.",
    });
  }
  // Detect key using Python script
  let keyResult = "";
  try {
    await new Promise((resolve, reject) => {
      execFile(
        process.platform === "win32" ? "python" : "python3",
        [path.join(__dirname, "detect_key.py"), audioPath],
        { env: process.env, timeout: PYTHON_TIMEOUT_MS },
        (err, stdout, stderr) => {
          keyResult = stdout.trim();
          if (err) return reject(stderr || err);
          resolve();
        },
      );
    });
  } catch (e) {
    safeUnlink(audioPath);
    return res.status(500).json({
      error: "Failed to detect key",
      details: e.toString(),
      keyResult,
    });
  }
  safeUnlink(audioPath);
  keyCache.set(url, keyResult);
  res.json({ key: keyResult, cached: false });
});
// (removed duplicate imports and app initialization)

// POST /api/youtube-transpose
// { url: string, semitones: number }
app.post("/api/youtube-transpose", async (req, res) => {
  if (!enforceRateLimit(req, res)) return;
  const { url, semitones = 0 } = req.body;
  if (!url) return res.status(400).json({ error: "Missing YouTube URL" });
  const semitoneNum = Number(semitones);
  if (Number.isNaN(semitoneNum) || semitoneNum < -12 || semitoneNum > 12) {
    return res.status(400).json({ error: "Semitones must be between -12 and 12." });
  }
  const cacheKey = `${url}::${semitoneNum}`;
  if (transposeCache.has(cacheKey) && fs.existsSync(transposeCache.get(cacheKey))) {
    return res.download(transposeCache.get(cacheKey), "transposed.wav");
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
  const id = uuidv4();
  const tempDir = path.join(__dirname, "tmp");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
    console.log("Created tempDir:", tempDir);
  } else {
    console.log("TempDir exists:", tempDir);
  }
  const audioPath = path.join(tempDir, `${id}.wav`);
  const outPath = path.join(tempDir, `${id}-out.wav`);
  console.log("audioPath:", audioPath);
  console.log("outPath:", outPath);

  // Download audio using yt-dlp
  let ytDlpStdout = "";
  let ytDlpStderr = "";
  try {
    const ytDlpArgs = [
      "--proxy",
      "",
      "--match-filter",
      `duration <= ${MAX_VIDEO_DURATION_SECONDS}`,
      "-x",
      "--audio-format",
      "wav",
      "-o",
      audioPath,
      url,
    ];
    console.log("Running yt-dlp:", "yt-dlp", ytDlpArgs.join(" "));
    await new Promise((resolve, reject) => {
      execFile("yt-dlp", ytDlpArgs, { env: getDirectNetworkEnv(), timeout: YT_TIMEOUT_MS }, (err, stdout, stderr) => {
        ytDlpStdout = stdout;
        ytDlpStderr = stderr;
        console.log("yt-dlp stdout:", stdout);
        console.error("yt-dlp stderr:", stderr);
        if (err) return reject(stderr || err);
        resolve();
      });
    });
  } catch (e) {
    console.error("yt-dlp error:", e);
    return res.status(500).json({
      error: "Failed to download audio from YouTube",
      details: e.toString(),
      ytDlpStdout,
      ytDlpStderr,
      hint: "Video may be unavailable, blocked, too long, or network/proxy is restricted.",
    });
  }

  // Transpose audio using Rubber Band CLI to preserve tempo
  let rubberbandStdout = "";
  let rubberbandStderr = "";
  try {
    if (semitoneNum !== 0) {
      // Use rubberband CLI for pitch shifting
      await new Promise((resolve, reject) => {
        execFile(
          "rubberband",
          ["-3", "--formant", "-p", semitoneNum.toString(), audioPath, outPath],
          { timeout: RUBBERBAND_TIMEOUT_MS },
          (err, stdout, stderr) => {
            rubberbandStdout = stdout;
            rubberbandStderr = stderr;
            console.log("rubberband stdout:", stdout);
            console.error("rubberband stderr:", stderr);
            if (err) return reject(stderr || err);
            resolve();
          },
        );
      });
    } else {
      fs.copyFileSync(audioPath, outPath);
    }
  } catch (e) {
    console.error("rubberband error:", e);
    return res.status(500).json({
      error: "Failed to transpose audio",
      details: e.toString(),
      rubberbandStdout,
      rubberbandStderr,
    });
  }

  // Send file
  transposeCache.set(cacheKey, outPath);
  res.download(outPath, "transposed.wav", (err) => {
    safeUnlink(audioPath);
    if (err) safeUnlink(outPath);
  });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  const deps = await getDependencyStatus();
  if (!deps.ytDlpOk) {
    console.warn("Dependency missing: yt-dlp");
  }
  if (!deps.rubberbandOk) {
    console.warn("Dependency missing: rubberband");
  }
  if (!deps.pythonOk) {
    console.warn("Dependency missing: python3");
  } else if (!deps.essentiaOk) {
    console.warn("Python module missing: essentia (youtube-key endpoint will fail)");
  }
});
