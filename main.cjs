const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

// Prevent multiple instances (important for packaged apps on macOS/Windows)
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  return;
}

let backendProcess;

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Window event logging
  win.on("focus", () => console.log("[Electron] Window focused"));
  win.on("blur", () => console.log("[Electron] Window blurred"));
  win.on("minimize", () => console.log("[Electron] Window minimized"));
  win.on("restore", () => console.log("[Electron] Window restored"));
  win.on("close", () => console.log("[Electron] Window closed"));

  // Load the React build output
  win.loadFile(path.join(__dirname, "dist", "index.html"));
}

app.whenReady().then(() => {
  // Prevent recursive Electron spawn: only spawn backend if not running as backend
  const isElectron = !!process.versions.electron;
  const isBackend = process.env.IS_BACKEND === "1";

  // Only the primary instance should start the backend
  if (
    !isBackend &&
    app.isReady() &&
    app.commandLine.hasSwitch("no-backend") === false
  ) {
    const nodeBinary = process.env.NODE_BINARY || process.argv[0] || "node";
    backendProcess = spawn(
      nodeBinary,
      [path.join(__dirname, "server", "index.cjs")],
      {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          PORT: process.env.BACKEND_PORT || "4000",
          IS_BACKEND: "1",
        },
      },
    );

    backendProcess.stdout.on("data", (data) => {
      console.log(`[backend stdout]: ${data}`);
    });
    backendProcess.stderr.on("data", (data) => {
      console.error(`[backend stderr]: ${data}`);
    });
    backendProcess.on("error", (err) => {
      console.error("Failed to start backend process:", err);
    });
    backendProcess.on("exit", (code, signal) => {
      console.log(`Backend process exited with code ${code}, signal ${signal}`);
    });
  }
  // macOS: Focus window if user tries to open a second instance
  app.on("second-instance", () => {
    const wins = BrowserWindow.getAllWindows();
    if (wins.length) {
      if (wins[0].isMinimized()) wins[0].restore();
      wins[0].focus();
    }
  });

  createWindow();

  app.on("activate", function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (backendProcess) backendProcess.kill();
  if (process.platform !== "darwin") app.quit();
});
