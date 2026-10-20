import { ToolCall } from "@webclaude/protocol";

export class ApprovalModal {
  private overlay: HTMLDivElement | null = null;

  public requestApproval(call: ToolCall): Promise<boolean> {
    return new Promise((resolve) => {
      this.close();

      this.overlay = document.createElement("div");
      this.overlay.id = "webclaude-approval-modal";
      this.overlay.innerHTML = `
        <div class="webclaude-modal-box">
          <div class="webclaude-modal-header">
            <span class="warning-icon">⚠️</span>
            <h3>Approval Required</h3>
          </div>
          <p class="webclaude-modal-desc">Claude requested to execute a system command in your workspace:</p>
          <div class="webclaude-code-preview">
            <code>${call.tool} ${JSON.stringify(call.args, null, 2)}</code>
          </div>
          <div class="webclaude-modal-actions">
            <button class="webclaude-btn webclaude-btn-reject" id="wc-btn-reject">Reject</button>
            <button class="webclaude-btn webclaude-btn-allow" id="wc-btn-allow">Allow Once</button>
          </div>
        </div>
      `;

      document.body.appendChild(this.overlay);

      const allowBtn = this.overlay.querySelector("#wc-btn-allow");
      const rejectBtn = this.overlay.querySelector("#wc-btn-reject");

      allowBtn?.addEventListener("click", () => {
        this.close();
        resolve(true);
      });

      rejectBtn?.addEventListener("click", () => {
        this.close();
        resolve(false);
      });
    });
  }

  private close() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }
}
