import { app, BrowserWindow, ipcMain, dialog } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createWebClaudeCore, WebClaudeServer, WorkspaceManager, BackupManager } from "@webclaude/core";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow: BrowserWindow | null = null;
let currentCore: ReturnType<typeof createWebClaudeCore> | null = null;
let selectedWorkspacePath: string = process.cwd();

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 720,
    minWidth: 780,
    minHeight: 560,
    title: "WebClaude - Local Agent Desktop",
    backgroundColor: "#0f172a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    autoHideMenuBar: true,
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", async () => {
  if (currentCore) {
    await currentCore.server.stop();
  }
  if (process.platform !== "darwin") {
    app.quit();
  }
});

// IPC Handlers
ipcMain.handle("workspace:select", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "Select Local Project Workspace",
    defaultPath: selectedWorkspacePath,
  });

  if (!result.canceled && result.filePaths.length > 0) {
    selectedWorkspacePath = result.filePaths[0];
    return selectedWorkspacePath;
  }
  return null;
});

ipcMain.handle("server:start", async (_, config: { workspace: string; port?: number }) => {
  try {
    if (currentCore) {
      await currentCore.server.stop();
    }

    selectedWorkspacePath = config.workspace;
    currentCore = createWebClaudeCore({
      port: config.port || 43127,
      workspaceDir: selectedWorkspacePath,
    });

    await currentCore.server.start();

    // Broadcast server log events to renderer
    currentCore.server.events.on("log", (log) => {
      mainWindow?.webContents.send("log:entry", log);
    });

    const pairing = currentCore.server.auth.getPairingInfo();
    return {
      ok: true,
      port: currentCore.server.port,
      workspace: currentCore.ws.root,
      pairingCode: pairing.code,
      expiresIn: pairing.expiresInSeconds,
    };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("server:stop", async () => {
  if (currentCore) {
    await currentCore.server.stop();
    currentCore = null;
  }
  return { ok: true };
});

ipcMain.handle("server:status", async () => {
  if (!currentCore) {
    return { running: false, workspace: selectedWorkspacePath };
  }
  const pairing = currentCore.server.auth.getPairingInfo();
  return {
    running: true,
    port: currentCore.server.port,
    workspace: currentCore.ws.root,
    pairingCode: pairing.code,
    expiresIn: pairing.expiresInSeconds,
    activeTokens: currentCore.server.auth.getActiveTokenCount(),
  };
});

ipcMain.handle("auth:rotate-code", async () => {
  if (!currentCore) return null;
  const newCode = currentCore.server.auth.rotatePairingCode();
  const info = currentCore.server.auth.getPairingInfo();
  return { code: newCode, expiresIn: info.expiresInSeconds };
});

ipcMain.handle("backup:undo", async (_, backupId: string) => {
  if (!currentCore) return { ok: false, error: "Server is not running" };
  try {
    const res = currentCore.backups.undo(backupId);
    return { ok: true, ...res };
  } catch (err: any) {
    return { ok: false, error: err.message };
  }
});
