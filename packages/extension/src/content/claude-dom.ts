export interface SelfTestReport {
  composerFound: boolean;
  sendButtonFound: boolean;
  isStreaming: boolean;
  assistantMessageCount: number;
  conversationId: string | null;
}

export class ClaudeDomAdapter {
  public composer(): HTMLElement | null {
    return (
      document.querySelector('div.ProseMirror[contenteditable="true"]') ||
      document.querySelector('div[contenteditable="true"][data-testid*="composer"]') ||
      document.querySelector('div[contenteditable="true"]')
    );
  }

  public setComposerText(text: string): boolean {
    const editor = this.composer();
    if (!editor) return false;

    editor.focus();

    // Select all existing content
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editor);
    selection?.removeAllRanges();
    selection?.addRange(range);

    // Try ClipboardEvent paste
    try {
      const dt = new DataTransfer();
      dt.setData("text/plain", text);
      const pasteEvt = new ClipboardEvent("paste", {
        bubbles: true,
        cancelable: true,
        clipboardData: dt,
      });
      editor.dispatchEvent(pasteEvt);
    } catch {}

    // Fallback if content was not inserted
    if (!editor.textContent || !editor.textContent.includes(text.slice(0, 20))) {
      try {
        document.execCommand("insertText", false, text);
      } catch {
        editor.innerText = text;
        editor.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    return true;
  }

  public getComposerText(): string {
    const editor = this.composer();
    return editor ? (editor.textContent || "").trim() : "";
  }

  public sendButton(): HTMLButtonElement | null {
    return (
      (document.querySelector('button[aria-label="Send Message"]') as HTMLButtonElement) ||
      (document.querySelector('button[aria-label="Send message"]') as HTMLButtonElement) ||
      (document.querySelector('button[data-testid*="send"]') as HTMLButtonElement) ||
      (document.querySelector('button:has(svg.lucide-arrow-up)') as HTMLButtonElement) ||
      (document.querySelector('fieldset button[type="button"]') as HTMLButtonElement)
    );
  }

  public isStreaming(): boolean {
    const stopBtn =
      document.querySelector('button[aria-label="Stop Response"]') ||
      document.querySelector('button[aria-label="Stop response"]') ||
      document.querySelector('button[data-testid*="stop"]') ||
      document.querySelector('button:has(svg.lucide-square)');
    return !!stopBtn;
  }

  public assistantMessages(): HTMLElement[] {
    // Select elements containing Claude's responses
    const elements = Array.from(
      document.querySelectorAll(
        '[data-is-streaming], div.font-claude-message, div[data-testid*="assistant"], .standard-markdown'
      )
    ) as HTMLElement[];

    return elements;
  }

  public extractCodeBlocks(msgNode: HTMLElement): string[] {
    const preNodes = Array.from(msgNode.querySelectorAll("pre"));
    const texts: string[] = [];
    for (const node of preNodes) {
      const innerCode = node.querySelector("code");
      const text = (innerCode ? innerCode.textContent : node.textContent) || "";
      if (text.trim()) {
        texts.push(text);
      }
    }
    // If no <pre> blocks found, or if message text contains @call directly, provide full message text
    if (texts.length === 0 && (msgNode.textContent || "").includes("@call")) {
      texts.push(msgNode.textContent || "");
    }
    return texts;
  }

  public conversationId(): string | null {
    const match = /\/chat\/([a-zA-Z0-9_-]+)/.exec(window.location.pathname);
    return match ? match[1] : null;
  }

  public selfTest(): SelfTestReport {
    return {
      composerFound: !!this.composer(),
      sendButtonFound: !!this.sendButton(),
      isStreaming: this.isStreaming(),
      assistantMessageCount: this.assistantMessages().length,
      conversationId: this.conversationId(),
    };
  }
}
