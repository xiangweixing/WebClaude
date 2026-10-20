// Desktop Renderer logic
declare global {
  interface Window {
    api: {
      selectWorkspace: () => Promise<string | null>;
      startServer: (config: { workspace: string; port?: number }) => Promise<any>;
      stopServer: () => Promise<any>;
      getStatus: () => Promise<any>;
      refreshPairingCode: () => Promise<any>;
      undoBackup: (backupId: string) => Promise<any>;
      onLog: (callback: (log: any) => void) => () => void;
    };
  }
}

const workspaceInput = document.getElementById("workspace-input") as HTMLInputElement;
const portInput = document.getElementById("port-input") as HTMLInputElement;
const browseBtn = document.getElementById("browse-btn") as HTMLButtonElement;
const toggleBtn = document.getElementById("toggle-btn") as HTMLButtonElement;
const statusPill = document.getElementById("status-pill") as HTMLDivElement;
const statusText = document.getElementById("status-text") as HTMLSpanElement;
const serverUrlText = document.getElementById("server-url-text") as HTMLSpanElement;

const pairingCard = document.getElementById("pairing-card") as HTMLDivElement;
const codeDisplay = document.getElementById("code-display") as HTMLDivElement;
const timerDisplay = document.getElementById("timer-display") as HTMLSpanElement;
const refreshCodeBtn = document.getElementById("refresh-code-btn") as HTMLButtonElement;

const logsBody = document.getElementById("logs-body") as HTMLTableSectionElement;
const clearLogsBtn = document.getElementById("clear-logs-btn") as HTMLButtonElement;

let isRunning = false;
let countdownTimer: any = null;
let remainingSeconds = 0;

function updateTimer() {
  if (remainingSeconds <= 0) {
    timerDisplay.textContent = "Expired. Click to refresh";
    return;
  }
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  timerDisplay.textContent = `Expires in ${mins}m ${secs < 10 ? "0" : ""}${secs}s`;
  remainingSeconds--;
}

function startCountdown(seconds: number) {
  if (countdownTimer) clearInterval(countdownTimer);
  remainingSeconds = seconds;
  updateTimer();
  countdownTimer = setInterval(updateTimer, 1000);
}

function renderRunningState(data: { port: number; workspace: string; pairingCode: string; expiresIn: number }) {
  isRunning = true;
  statusPill.classList.add("running");
  statusText.textContent = "Running";
  toggleBtn.textContent = "Stop Service";
  toggleBtn.classList.remove("btn-primary");
  toggleBtn.classList.add("btn-danger");

  workspaceInput.value = data.workspace;
  workspaceInput.disabled = true;
  portInput.disabled = true;
  browseBtn.disabled = true;

  serverUrlText.textContent = `http://127.0.0.1:${data.port}`;
  pairingCard.style.display = "block";
  codeDisplay.textContent = data.pairingCode;
  startCountdown(data.expiresIn);
}

function renderStoppedState() {
  isRunning = false;
  statusPill.classList.remove("running");
  statusText.textContent = "Stopped";
  toggleBtn.textContent = "Start Service";
  toggleBtn.classList.remove("btn-danger");
  toggleBtn.classList.add("btn-primary");

  workspaceInput.disabled = false;
  portInput.disabled = false;
  browseBtn.disabled = false;

  pairingCard.style.display = "none";
  if (countdownTimer) clearInterval(countdownTimer);
}

function appendLog(log: any) {
  const emptyRow = logsBody.querySelector(".empty-row");
  if (emptyRow) emptyRow.remove();

  const tr = document.createElement("tr");

  const timeStr = (log.timestamp || "").slice(11, 19);
  const statusHtml = log.ok
    ? `<span class="status-tag ok">OK</span>`
    : `<span class="status-tag error">ERR</span>`;

  let details = "";
  if (log.args?.path) details = log.args.path;
  else if (log.args?.command) details = `${log.args.command} ${(log.args.args || []).join(" ")}`;
  else if (log.args?.query) details = `query: "${log.args.query}"`;
  else if (log.args?.message) details = `"${log.args.message}"`;

  let actionHtml = "-";
  if (log.backupId) {
    actionHtml = `<button class="btn btn-small btn-secondary undo-btn" data-backup="${log.backupId}">Undo</button>`;
  }

  tr.innerHTML = `
    <td>${timeStr}</td>
    <td>${statusHtml}</td>
    <td><span class="tool-name">${log.tool}</span></td>
    <td title="${details}">${details || "-"}</td>
    <td>${log.durationMs}ms</td>
    <td>${actionHtml}</td>
  `;

  logsBody.insertBefore(tr, logsBody.firstChild);

  // Bind undo button
  const undoBtn = tr.querySelector(".undo-btn") as HTMLButtonElement;
  if (undoBtn) {
    undoBtn.addEventListener("click", async () => {
      undoBtn.disabled = true;
      undoBtn.textContent = "Undoing...";
      const res = await window.api.undoBackup(log.backupId);
      if (res.ok) {
        undoBtn.textContent = "Undone ✓";
      } else {
        alert("Failed to undo: " + res.error);
        undoBtn.disabled = false;
        undoBtn.textContent = "Undo";
      }
    });
  }
}

// Event Listeners
browseBtn.addEventListener("click", async () => {
  const chosen = await window.api.selectWorkspace();
  if (chosen) {
    workspaceInput.value = chosen;
  }
});

toggleBtn.addEventListener("click", async () => {
  if (isRunning) {
    await window.api.stopServer();
    renderStoppedState();
  } else {
    const ws = workspaceInput.value.trim();
    if (!ws) {
      alert("Please select a workspace directory first.");
      return;
    }
    const port = parseInt(portInput.value, 10) || 43127;
    const res = await window.api.startServer({ workspace: ws, port });
    if (res.ok) {
      renderRunningState(res);
    } else {
      alert("Failed to start service: " + res.error);
    }
  }
});

refreshCodeBtn.addEventListener("click", async () => {
  const res = await window.api.refreshPairingCode();
  if (res) {
    codeDisplay.textContent = res.code;
    startCountdown(res.expiresIn);
  }
});

clearLogsBtn.addEventListener("click", () => {
  logsBody.innerHTML = `
    <tr class="empty-row">
      <td colspan="6">No activity yet. Trigger tool calls via Claude Web.</td>
    </tr>
  `;
});

// Subscribe to log stream
window.api.onLog(appendLog);

// Init check
window.api.getStatus().then((status) => {
  if (status.workspace) {
    workspaceInput.value = status.workspace;
  }
  if (status.running) {
    renderRunningState(status);
  } else {
    renderStoppedState();
  }
});
