import { ClaudeDomAdapter } from "./claude-dom.js";
import { ApprovalModal } from "./approval.js";
import { parseClaudeResponse, formatBatchResults, ToolResult, ToolCall, formatDuration } from "@webclaude/protocol";
import { TaskCompletionDetails } from "./toast.js";

export interface AgentLoopState {
  currentRound: number;
  isPaused: boolean;
  autoSendEnabled: boolean;
  statusMessage: string;
}

export class AgentLoop {
  private dom = new ClaudeDomAdapter();
  private approval = new ApprovalModal();
  private processedCallIds = new Set<string>();
  private observer: MutationObserver | null = null;
  private debounceTimer: any = null;
  private wasStreaming = false;

  private currentRound = 0;
  private isPaused = false;
  private autoSendEnabled = false;
  private statusMessage = "Idle";
  private taskStartTime: number | null = null;
  private totalCallsCount = 0;
  private onStateChangeCallbacks: Array<(state: AgentLoopState) => void> = [];
  private onTaskCompleteCallbacks: Array<(details: TaskCompletionDetails) => void> = [];

  constructor() {
    this.loadSettings();
  }

  private async loadSettings() {
    const data = await chrome.storage.local.get(["autoSendEnabled"]);
    this.autoSendEnabled = !!data.autoSendEnabled;
    this.notifyState();
  }

  public setAutoSend(enabled: boolean) {
    this.autoSendEnabled = enabled;
    chrome.storage.local.set({ autoSendEnabled: enabled });
    this.notifyState();
  }

  public setPaused(paused: boolean) {
    this.isPaused = paused;
    this.statusMessage = paused ? "Paused" : "Active";
    this.notifyState();
  }

  public onStateChange(cb: (state: AgentLoopState) => void) {
    this.onStateChangeCallbacks.push(cb);
    this.notifyState();
  }

  public onTaskComplete(cb: (details: TaskCompletionDetails) => void) {
    this.onTaskCompleteCallbacks.push(cb);
  }

  private notifyState() {
    const state: AgentLoopState = {
      currentRound: this.currentRound,
      isPaused: this.isPaused,
      autoSendEnabled: this.autoSendEnabled,
      statusMessage: this.statusMessage,
    };
    for (const cb of this.onStateChangeCallbacks) cb(state);
  }

  public start() {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      const streaming = this.dom.isStreaming();

      if (this.wasStreaming && !streaming) {
        // Stream just ended! Debounce 800ms for final DOM commit
        if (this.debounceTimer) clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
          this.checkAndProcessLatestReply();
        }, 800);
      }

      this.wasStreaming = streaming;
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
  }

  public stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }

  private async checkAndProcessLatestReply() {
    if (this.isPaused) {
      this.statusMessage = "Paused (calls skipped)";
      this.notifyState();
      return;
    }

    const messages = this.dom.assistantMessages();
    if (messages.length === 0) return;

    const latestMessage = messages[messages.length - 1];
    const codeBlocks = this.dom.extractCodeBlocks(latestMessage);
    const combinedText = codeBlocks.join("\n\n");

    const parseResult = parseClaudeResponse(combinedText);
    if (!parseResult.hasCallBlocks || parseResult.calls.length === 0) {
      // Normal response without tool calls - check if task just completed
      if (this.currentRound > 0 && this.taskStartTime !== null) {
        const elapsedMs = Date.now() - this.taskStartTime;
        const durationFormatted = formatDuration(elapsedMs);
        const details: TaskCompletionDetails = {
          durationMs: elapsedMs,
          durationFormatted,
          rounds: this.currentRound,
          totalCalls: this.totalCallsCount,
        };

        this.statusMessage = `🎉 任务完成！总耗时：${durationFormatted}（共 ${this.currentRound} 轮交互，执行 ${this.totalCallsCount} 次工具）`;
        this.notifyState();

        for (const cb of this.onTaskCompleteCallbacks) {
          try {
            cb(details);
          } catch {}
        }

        // Reset for next task
        this.taskStartTime = null;
        this.currentRound = 0;
        this.totalCallsCount = 0;
        return;
      }

      this.statusMessage = "Claude completed task (no tool calls).";
      this.notifyState();
      return;
    }

    // Filter out already processed calls in this session
    const newCalls = parseResult.calls.filter((c) => !this.processedCallIds.has(c.id));
    if (newCalls.length === 0) return;

    // Start stopwatch on first tool call batch
    if (this.taskStartTime === null) {
      this.taskStartTime = Date.now();
    }
    this.totalCallsCount += newCalls.length;

    // Mark as processed
    for (const c of newCalls) {
      this.processedCallIds.add(c.id);
    }

    this.currentRound++;
    this.statusMessage = `Executing ${newCalls.length} tool call(s) for round #${this.currentRound}...`;
    this.notifyState();

    const results: ToolResult[] = [];

    for (const call of newCalls) {
      // Risk check
      if (call.tool === "run_command" || call.tool === "git_commit") {
        this.statusMessage = `Awaiting approval for ${call.tool}...`;
        this.notifyState();
        const approved = await this.approval.requestApproval(call);
        if (!approved) {
          results.push({
            id: call.id,
            tool: call.tool,
            ok: false,
            error: "User rejected tool execution request.",
          });
          continue;
        }
      }

      // Execute via background
      const execRes: any = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: "EXECUTE_TOOL",
            id: call.id,
            tool: call.tool,
            args: call.args,
          },
          resolve
        );
      });

      results.push({
        id: call.id,
        tool: call.tool,
        ok: !!execRes?.ok,
        output: execRes?.output,
        error: execRes?.error,
        backupId: execRes?.backupId,
      });
    }

    const formattedBatch = formatBatchResults(results);

    // Inset into composer
    const currentComposerText = this.dom.getComposerText();
    if (currentComposerText && !currentComposerText.startsWith("````webclaude-result")) {
      this.statusMessage = `Results ready, but composer has existing draft. Click to overwrite.`;
      this.notifyState();
      return;
    }

    this.dom.setComposerText(formattedBatch);

    if (!this.autoSendEnabled) {
      // SEMI-AUTOMATIC MODE (DEFAULT): Do NOT click send!
      this.statusMessage = `✅ Round #${this.currentRound} complete. Results inserted into input. Press Enter to send.`;
      this.notifyState();
    } else {
      // AUTO-SEND OPT-IN MODE
      if (this.currentRound >= 15) {
        this.statusMessage = `⚠️ Reached maximum auto-send round limit (15). Please review and send manually.`;
        this.notifyState();
        return;
      }

      this.statusMessage = `Auto-sending round #${this.currentRound} in 1.5s...`;
      this.notifyState();

      setTimeout(() => {
        if (!this.isPaused && this.autoSendEnabled) {
          const sendBtn = this.dom.sendButton();
          if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
            this.statusMessage = `Waiting for Claude reply (Round #${this.currentRound})...`;
            this.notifyState();
          }
        }
      }, 1500);
    }
  }
}
