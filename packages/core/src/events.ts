import { EventEmitter } from "node:events";

export interface LogEvent {
  id: string;
  timestamp: string;
  tool: string;
  args: Record<string, any>;
  durationMs: number;
  ok: boolean;
  error?: string;
  backupId?: string;
}

export class EventBus extends EventEmitter {
  private recentLogs: LogEvent[] = [];

  public emitLog(event: LogEvent): void {
    this.recentLogs.unshift(event);
    if (this.recentLogs.length > 200) {
      this.recentLogs.pop();
    }
    this.emit("log", event);
  }

  public getRecentLogs(): LogEvent[] {
    return [...this.recentLogs];
  }

  public clear(): void {
    this.recentLogs = [];
    this.emit("clear");
  }
}
