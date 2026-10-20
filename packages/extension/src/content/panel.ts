import { AgentLoop, AgentLoopState } from "./agent-loop.js";
import { ClaudeDomAdapter } from "./claude-dom.js";
import { WebClaudeToast } from "./toast.js";

export class WebClaudePanel {
  private panel: HTMLElement | null = null;
  private toggleBtn: HTMLElement | null = null;
  private isVisible = false;

  constructor(
    private loop: AgentLoop,
    private dom: ClaudeDomAdapter,
    private toast: WebClaudeToast
  ) {}

  public init() {
    this.injectStyles();
    this.createFloatingButton();
    this.createPanel();
    this.refreshConnection();

    this.loop.onStateChange((state) => this.updateLoopUI(state));
  }

  private injectStyles() {
    if (document.getElementById("webclaude-styles")) return;
    const style = document.createElement("style");
    style.id = "webclaude-styles";
    style.textContent = `
      #webclaude-launcher {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 999999;
        background: linear-gradient(135deg, #6366f1, #4f46e5);
        color: #fff;
        border: 0;
        border-radius: 999px;
        padding: 10px 18px;
        font: 600 13px system-ui, sans-serif;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: transform 0.2s, box-shadow 0.2s;
      }
      #webclaude-launcher:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 20px rgba(99, 102, 241, 0.45);
      }
      #webclaude-launcher .dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ef4444;
      }
      #webclaude-launcher.connected .dot {
        background: #10b981;
        box-shadow: 0 0 8px #10b981;
      }

      #webclaude-panel {
        position: fixed;
        right: 20px;
        bottom: 74px;
        width: 380px;
        max-height: 80vh;
        background: #0f172a;
        color: #f1f5f9;
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6);
        z-index: 999999;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font: 13px system-ui, sans-serif;
      }
      #webclaude-panel.open {
        display: flex;
      }

      .wc-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 14px 18px;
        border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      }
      .wc-header h3 {
        margin: 0;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .wc-close-btn {
        background: transparent;
        border: 0;
        color: #94a3b8;
        font-size: 18px;
        cursor: pointer;
      }

      .wc-body {
        padding: 16px 18px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .wc-section {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.06);
        border-radius: 10px;
        padding: 12px;
      }

      .wc-section-title {
        font-size: 11px;
        text-transform: uppercase;
        font-weight: 700;
        color: #94a3b8;
        margin-bottom: 8px;
      }

      .wc-input-row {
        display: flex;
        gap: 8px;
      }
      .wc-input {
        background: #000;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 8px;
        color: #fff;
        padding: 6px 10px;
        font-size: 13px;
        flex: 1;
      }

      .wc-btn {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: #fff;
        border-radius: 8px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s;
      }
      .wc-btn:hover {
        background: rgba(255, 255, 255, 0.15);
      }
      .wc-btn-primary {
        background: #6366f1;
        border: 0;
      }
      .wc-btn-primary:hover {
        background: #4f46e5;
      }

      .wc-status-box {
        background: #000;
        border-radius: 8px;
        padding: 10px;
        font-family: ui-monospace, monospace;
        font-size: 11px;
        color: #cbd5e1;
        white-space: pre-wrap;
        word-break: break-all;
        max-height: 80px;
        overflow-y: auto;
      }

      .wc-toggle-label {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 12px;
        cursor: pointer;
      }

      /* Modal and Mentions */
      #webclaude-approval-modal {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.65);
        backdrop-filter: blur(4px);
        z-index: 1000000;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .webclaude-modal-box {
        background: #0f172a;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 14px;
        padding: 20px;
        width: 440px;
        box-shadow: 0 20px 50px rgba(0, 0, 0, 0.8);
        color: #f1f5f9;
        font: 13px system-ui, sans-serif;
      }
      .webclaude-code-preview {
        background: #000;
        padding: 10px;
        border-radius: 8px;
        margin: 12px 0;
        max-height: 180px;
        overflow: auto;
        font-family: monospace;
        font-size: 11px;
        color: #93c5fd;
      }
      .webclaude-modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .webclaude-btn-allow {
        background: #10b981;
        color: #fff;
        border: 0;
        border-radius: 8px;
        padding: 8px 16px;
        cursor: pointer;
        font-weight: 600;
      }
      .webclaude-btn-reject {
        background: #ef4444;
        color: #fff;
        border: 0;
        border-radius: 8px;
        padding: 8px 16px;
        cursor: pointer;
        font-weight: 600;
      }

      #webclaude-mention-popup {
        position: fixed;
        background: #1e293b;
        border: 1px solid rgba(255, 255, 255, 0.15);
        border-radius: 10px;
        padding: 8px;
        z-index: 1000000;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
        cursor: pointer;
      }
      .mention-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 6px 10px;
        border-radius: 6px;
      }
      .mention-item:hover {
        background: #334155;
      }
      .mention-text strong {
        display: block;
        color: #a5b4fc;
        font-size: 13px;
      }
      .mention-text span {
        font-size: 11px;
        color: #94a3b8;
      }
    `;
    document.head.appendChild(style);
  }

  private createFloatingButton() {
    this.toggleBtn = document.createElement("button");
    this.toggleBtn.id = "webclaude-launcher";
    this.toggleBtn.innerHTML = `
      <span class="dot"></span>
      <span>WebClaude</span>
    `;
    document.body.appendChild(this.toggleBtn);

    this.toggleBtn.addEventListener("click", () => {
      this.isVisible = !this.isVisible;
      this.panel?.classList.toggle("open", this.isVisible);
    });
  }

  private createPanel() {
    this.panel = document.createElement("div");
    this.panel.id = "webclaude-panel";
    this.panel.innerHTML = `
      <div class="wc-header">
        <h3>🤖 WebClaude Agent</h3>
        <button class="wc-close-btn" id="wc-close">×</button>
      </div>

      <div class="wc-body">
        <!-- Connection Status -->
        <div class="wc-section">
          <div class="wc-section-title">Local Service</div>
          <div id="wc-conn-desc" style="color: #94a3b8; font-size: 12px; margin-bottom: 8px;">Checking connection...</div>
          <div class="wc-input-row" id="wc-pairing-row">
            <input type="text" class="wc-input" id="wc-pair-code" placeholder="6-digit pairing code" maxlength="6" />
            <button class="wc-btn wc-btn-primary" id="wc-pair-btn">Pair</button>
          </div>
        </div>

        <!-- Agent Loop & Auto-Send -->
        <div class="wc-section">
          <div class="wc-section-title">Agent Controls</div>
          <label class="wc-toggle-label" style="margin-bottom: 8px;">
            <span>Auto-Send Replies (Opt-in)</span>
            <input type="checkbox" id="wc-auto-send-toggle" />
          </label>
          <label class="wc-toggle-label" style="margin-bottom: 12px;">
            <span>Completion Chime</span>
            <input type="checkbox" id="wc-sound-toggle" checked />
          </label>
          <div style="display: flex; gap: 8px;">
            <button class="wc-btn" id="wc-pause-btn" style="flex: 1;">Pause</button>
            <button class="wc-btn" id="wc-selftest-btn" style="flex: 1;">Self-Test</button>
          </div>
        </div>

        <!-- Activity Status -->
        <div class="wc-section">
          <div class="wc-section-title">Current Round Status</div>
          <div class="wc-status-box" id="wc-loop-status">Idle. Type @webclaude to start.</div>
        </div>
      </div>
    `;

    document.body.appendChild(this.panel);

    this.panel.querySelector("#wc-close")?.addEventListener("click", () => {
      this.isVisible = false;
      this.panel?.classList.remove("open");
    });

    const pairBtn = this.panel.querySelector("#wc-pair-btn") as HTMLButtonElement;
    const pairInput = this.panel.querySelector("#wc-pair-code") as HTMLInputElement;

    pairBtn?.addEventListener("click", async () => {
      const code = pairInput.value.trim();
      if (!code) return;
      pairBtn.disabled = true;
      pairBtn.textContent = "Pairing...";

      const res: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "PAIR", code }, resolve);
      });

      if (res?.ok) {
        pairInput.value = "";
        alert("Paired successfully with local workspace!");
        this.refreshConnection();
      } else {
        alert("Pairing failed: " + (res?.error || "Unknown"));
      }
      pairBtn.disabled = false;
      pairBtn.textContent = "Pair";
    });

    // Auto-send toggle with terms warning confirmation
    const autoSendToggle = this.panel.querySelector("#wc-auto-send-toggle") as HTMLInputElement;
    autoSendToggle?.addEventListener("change", (e) => {
      if (autoSendToggle.checked) {
        const confirmed = confirm(
          "Notice on Automated Access:\n\nAnthropic Consumer Terms of Service restrict non-human automated script access on personal claude.ai accounts. By enabling Auto-Send, tool results will be submitted automatically up to 15 rounds without manual click.\n\nDo you want to proceed?"
        );
        if (confirmed) {
          this.loop.setAutoSend(true);
        } else {
          autoSendToggle.checked = false;
          this.loop.setAutoSend(false);
        }
      } else {
        this.loop.setAutoSend(false);
      }
    });

    // Sound toggle
    const soundToggle = this.panel.querySelector("#wc-sound-toggle") as HTMLInputElement;
    if (soundToggle) {
      soundToggle.checked = this.toast.isSoundEnabled();
      soundToggle.addEventListener("change", () => {
        this.toast.setSoundEnabled(soundToggle.checked);
      });
    }

    // Pause button
    const pauseBtn = this.panel.querySelector("#wc-pause-btn") as HTMLButtonElement;
    let isPaused = false;
    pauseBtn?.addEventListener("click", () => {
      isPaused = !isPaused;
      this.loop.setPaused(isPaused);
      pauseBtn.textContent = isPaused ? "Resume" : "Pause";
    });

    // Self-test button
    const selfTestBtn = this.panel.querySelector("#wc-selftest-btn") as HTMLButtonElement;
    selfTestBtn?.addEventListener("click", () => {
      const report = this.dom.selfTest();
      alert(
        `WebClaude DOM Self-Test Report:\n\n` +
          `• Composer Input: ${report.composerFound ? "FOUND ✓" : "NOT FOUND ✗"}\n` +
          `• Send Button: ${report.sendButtonFound ? "FOUND ✓" : "NOT FOUND ✗"}\n` +
          `• Assistant Messages: ${report.assistantMessageCount} found\n` +
          `• Currently Streaming: ${report.isStreaming ? "YES" : "NO"}\n` +
          `• Conversation ID: ${report.conversationId || "New Chat"}`
      );
    });
  }

  private updateLoopUI(state: AgentLoopState) {
    if (!this.panel) return;
    const statusBox = this.panel.querySelector("#wc-loop-status");
    if (statusBox) {
      statusBox.textContent = `[Round #${state.currentRound}] ${state.statusMessage}`;
    }

    const toggle = this.panel.querySelector("#wc-auto-send-toggle") as HTMLInputElement;
    if (toggle) {
      toggle.checked = state.autoSendEnabled;
    }
  }

  public async refreshConnection() {
    const res: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, resolve);
    });

    const desc = this.panel?.querySelector("#wc-conn-desc");
    const pairingRow = this.panel?.querySelector("#wc-pairing-row") as HTMLElement;

    if (res?.ok) {
      this.toggleBtn?.classList.add("connected");
      if (res.hasToken) {
        if (desc) desc.textContent = `Connected: ${res.data.workspace || "Workspace"}`;
        if (pairingRow) pairingRow.style.display = "none";
      } else {
        if (desc) desc.textContent = `Service running on port 43127. Enter pairing code:`;
        if (pairingRow) pairingRow.style.display = "flex";
      }
    } else {
      this.toggleBtn?.classList.remove("connected");
      if (desc) desc.textContent = `Disconnected: ${res?.error || "Local service not running"}`;
    }
  }
}
