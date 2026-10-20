import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("api", {
  selectWorkspace: () => ipcRenderer.invoke("workspace:select"),
  startServer: (config: { workspace: string; port?: number }) =>
    ipcRenderer.invoke("server:start", config),
  stopServer: () => ipcRenderer.invoke("server:stop"),
  getStatus: () => ipcRenderer.invoke("server:status"),
  refreshPairingCode: () => ipcRenderer.invoke("auth:rotate-code"),
  undoBackup: (backupId: string) => ipcRenderer.invoke("backup:undo", backupId),
  onLog: (callback: (log: any) => void) => {
    const listener = (_: any, log: any) => callback(log);
    ipcRenderer.on("log:entry", listener);
    return () => ipcRenderer.removeListener("log:entry", listener);
  },
});
