export interface TaskCompletionDetails {
  durationMs: number;
  durationFormatted: string;
  rounds: number;
  totalCalls: number;
}

export class WebClaudeToast {
  private activeToast: HTMLElement | null = null;
  private soundEnabled = true;

  constructor() {
    this.injectStyles();
    this.loadSoundPreference();
  }

  private async loadSoundPreference() {
    const data = await chrome.storage.local.get(["soundEnabled"]);
    if (data.soundEnabled !== undefined) {
      this.soundEnabled = !!data.soundEnabled;
    }
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
    chrome.storage.local.set({ soundEnabled: enabled });
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  private injectStyles() {
    if (document.getElementById("webclaude-toast-styles")) return;
    const style = document.createElement("style");
    style.id = "webclaude-toast-styles";
    style.textContent = `
      #webclaude-toast-container {
        position: fixed;
        top: 24px;
        right: 24px;
        z-index: 9999999;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      }
      .webclaude-toast {
        pointer-events: auto;
        min-width: 320px;
        max-width: 420px;
        background: rgba(15, 23, 42, 0.92);
        backdrop-filter: blur(16px);
        border: 1px solid rgba(99, 102, 241, 0.35);
        border-radius: 14px;
        box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55), 0 0 20px rgba(99, 102, 241, 0.15);
        color: #f1f5f9;
        padding: 16px 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        transform: translateY(-20px);
        opacity: 0;
        transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease;
      }
      .webclaude-toast.show {
        transform: translateY(0);
        opacity: 1;
      }
      .webclaude-toast.hide {
        transform: translateY(-15px);
        opacity: 0;
      }
      .wc-toast-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .wc-toast-title-badge {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 14px;
        font-weight: 700;
        color: #38bdf8;
      }
      .wc-toast-close {
        background: transparent;
        border: 0;
        color: #94a3b8;
        font-size: 18px;
        line-height: 1;
        cursor: pointer;
        padding: 2px 4px;
        border-radius: 4px;
        transition: color 0.15s;
      }
      .wc-toast-close:hover {
        color: #fff;
      }
      .wc-toast-duration {
        font-size: 15px;
        font-weight: 700;
        color: #10b981;
        display: flex;
        align-items: center;
        gap: 6px;
        margin-top: 2px;
      }
      .wc-toast-stats {
        font-size: 12px;
        color: #94a3b8;
      }
    `;
    document.head.appendChild(style);
  }

  private playChime() {
    if (!this.soundEnabled) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      // Gentle chord: D5 (587Hz) then A5 (880Hz)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = "sine";
      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.frequency.setValueAtTime(587.33, now);
      osc.frequency.setValueAtTime(880.0, now + 0.12);

      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      osc.start(now);
      osc.stop(now + 0.45);
    } catch {}
  }

  public showCompletion(details: TaskCompletionDetails) {
    let container = document.getElementById("webclaude-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "webclaude-toast-container";
      document.body.appendChild(container);
    }

    if (this.activeToast) {
      this.activeToast.remove();
      this.activeToast = null;
    }

    const toast = document.createElement("div");
    toast.className = "webclaude-toast";
    toast.innerHTML = `
      <div class="wc-toast-header">
        <div class="wc-toast-title-badge">
          <span>🎉</span>
          <span>WebClaude 任务已完成</span>
        </div>
        <button class="wc-toast-close" title="关闭">×</button>
      </div>
      <div class="wc-toast-duration">
        <span>⏱️</span>
        <span>总耗时：${details.durationFormatted}</span>
      </div>
      <div class="wc-toast-stats">
        共完成 ${details.rounds} 轮交互 · 累计执行 ${details.totalCalls} 次工具操作
      </div>
    `;

    container.appendChild(toast);
    this.activeToast = toast;

    // Trigger animation in next frame
    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    this.playChime();

    const closeToast = () => {
      toast.classList.remove("show");
      toast.classList.add("hide");
      setTimeout(() => {
        toast.remove();
        if (this.activeToast === toast) {
          this.activeToast = null;
        }
      }, 350);
    };

    toast.querySelector(".wc-toast-close")?.addEventListener("click", closeToast);

    // Auto dismiss after 8 seconds
    setTimeout(closeToast, 8000);
  }
}
