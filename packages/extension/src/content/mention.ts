import { ClaudeDomAdapter } from "./claude-dom.js";
import { buildProtocolPrompt } from "@webclaude/protocol";

export class MentionHandler {
  private popup: HTMLDivElement | null = null;
  private isListening = false;

  constructor(private dom: ClaudeDomAdapter) {}

  public init() {
    if (this.isListening) return;
    this.isListening = true;

    document.addEventListener("input", (e) => this.handleInput(e), true);
    document.addEventListener("keydown", (e) => this.handleKeyDown(e), true);
  }

  private handleInput(e: Event) {
    const editor = this.dom.composer();
    if (!editor || !editor.contains(e.target as Node)) return;

    const text = this.dom.getComposerText();
    // Check if ending with @ or @web...
    const match = /@([a-zA-Z0-9]*)$/.exec(text);

    if (match && "webclaude".startsWith(match[1].toLowerCase())) {
      this.showMentionPopup();
    } else {
      this.hideMentionPopup();
    }
  }

  private handleKeyDown(e: KeyboardEvent) {
    if (this.popup && (e.key === "Tab" || e.key === "Enter")) {
      e.preventDefault();
      e.stopPropagation();
      this.insertMention();
      return;
    }

    // Intercept Send button (Enter key without Shift)
    if (e.key === "Enter" && !e.shiftKey) {
      this.interceptSendBeforeSubmit();
    }
  }

  public async interceptSendBeforeSubmit(): Promise<void> {
    const text = this.dom.getComposerText();
    if (!text.includes("@webclaude")) return;

    const convId = this.dom.conversationId() || "new_chat";
    const storageKey = `initialized_${convId}`;
    const stored = await chrome.storage.local.get(storageKey);

    if (stored[storageKey]) {
      // Already initialized in this conversation, no need to reinject full protocol
      return;
    }

    // Fetch workspace info from background
    const statusRes: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: "GET_STATUS" }, resolve);
    });

    if (!statusRes?.ok) {
      console.warn("[WebClaude] Local service not connected. Sending prompt as-is.");
      return;
    }

    const wsPath = statusRes.data?.workspace || "Local Workspace";
    const wsName = wsPath.split(/[\\/]/).pop() || "Workspace";

    // Request project tree if available
    let tree: string | undefined;
    const treeRes: any = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: "EXECUTE_TOOL",
          tool: "directory_tree",
          args: { path: "", max_depth: 3 },
        },
        resolve
      );
    });

    if (treeRes?.ok && treeRes?.output) {
      try {
        const parsed = JSON.parse(treeRes.output);
        tree = parsed.tree;
      } catch {
        tree = treeRes.output;
      }
    }

    const fullPrompt = buildProtocolPrompt(
      {
        workspaceName: wsName,
        platform: navigator.platform,
        tree,
      },
      text
    );

    // Replace composer text with expanded system prompt + user request
    this.dom.setComposerText(fullPrompt);

    // Mark as initialized
    await chrome.storage.local.set({ [storageKey]: true });
  }

  private showMentionPopup() {
    if (this.popup) return;

    this.popup = document.createElement("div");
    this.popup.id = "webclaude-mention-popup";
    this.popup.innerHTML = `
      <div class="mention-item">
        <span class="mention-icon">🤖</span>
        <div class="mention-text">
          <strong>@webclaude</strong>
          <span>Local Code Editing Agent</span>
        </div>
      </div>
    `;

    document.body.appendChild(this.popup);

    const editor = this.dom.composer();
    if (editor) {
      const rect = editor.getBoundingClientRect();
      this.popup.style.left = `${rect.left + 16}px`;
      this.popup.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    }

    this.popup.addEventListener("click", () => this.insertMention());
  }

  private hideMentionPopup() {
    if (this.popup) {
      this.popup.remove();
      this.popup = null;
    }
  }

  private insertMention() {
    const text = this.dom.getComposerText();
    const replaced = text.replace(/@[a-zA-Z0-9]*$/, "@webclaude ");
    this.dom.setComposerText(replaced);
    this.hideMentionPopup();
  }
}
