const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

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

  // Load the React build output
  win.loadFile(path.join(__dirname, "dist", "index.html"));
}

app.whenReady().then(() => {
  // Start backend server using Node, not Electron
  const nodeBinary = process.env.NODE_BINARY || process.argv[0] || "node";
  backendProcess = spawn(
    nodeBinary,
    [path.join(__dirname, "server", "index.cjs")],
    {
      stdio: "inherit",
      env: { ...process.env, PORT: process.env.BACKEND_PORT || "4000" },
    },
  );

  backendProcess.on("error", (err) => {
    console.error("Failed to start backend process:", err);
  });
  backendProcess.on("exit", (code, signal) => {
    console.log(`Backend process exited with code ${code}, signal ${signal}`);
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
