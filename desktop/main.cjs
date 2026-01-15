const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");

let backendProcess;

function ensureDirs(rootDir) {
  const dirs = [
    path.join(rootDir, "inbox"),
    path.join(rootDir, "data"),
    path.join(rootDir, "processed"),
    path.join(rootDir, "pending_review"),
    path.join(rootDir, "failed")
  ];

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function getBackendPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend", "dist", "server.js");
  }
  return path.join(__dirname, "..", "backend", "dist", "server.js");
}

function getFrontendIndex() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "frontend", "dist", "index.html");
  }
  return path.join(__dirname, "..", "frontend", "dist", "index.html");
}

function startBackend() {
  const rootDir = path.join(app.getPath("userData"), "price-tracker");
  ensureDirs(rootDir);

  const backendPath = getBackendPath();
  const dbPath = path.join(rootDir, "data", "price_tracker.db");

  const env = {
    ...process.env,
    PORT: "3100",
    PRICE_TRACKER_ROOT: rootDir,
    DATABASE_URL: `file:${dbPath}`
  };

  backendProcess = spawn(process.execPath, [backendPath], {
    env,
    stdio: "ignore",
    windowsHide: true
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 720,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile(getFrontendIndex());
}

app.whenReady().then(() => {
  startBackend();
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProcess) {
    backendProcess.kill();
    backendProcess = null;
  }
});
