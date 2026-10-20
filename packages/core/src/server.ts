import http from "node:http";
import { WorkspaceManager } from "./workspace.js";
import { BackupManager } from "./backup.js";
import { ToolRegistry } from "./registry.js";
import { AuthManager } from "./auth.js";
import { EventBus, LogEvent } from "./events.js";

export interface ServerOptions {
  port?: number;
  host?: string;
  workspaceDir?: string;
  allowedCommands?: string[];
}

export class WebClaudeServer {
  public readonly port: number;
  public readonly host: string;
  private httpServer: http.Server | null = null;
  public readonly workspace: WorkspaceManager;
  public readonly backups: BackupManager;
  public readonly auth: AuthManager;
  public readonly events: EventBus;
  public readonly registry: ToolRegistry;

  constructor(options: ServerOptions = {}, registry: ToolRegistry) {
    this.port = options.port || 43127;
    this.host = options.host || "127.0.0.1";
    this.workspace = new WorkspaceManager(options.workspaceDir);
    this.backups = new BackupManager(() => this.workspace.root);
    this.auth = new AuthManager();
    this.events = new EventBus();
    this.registry = registry;
  }

  public start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.httpServer = http.createServer((req, res) => this.handleRequest(req, res));
      this.httpServer.on("error", reject);
      this.httpServer.listen(this.port, this.host, () => {
        resolve();
      });
    });
  }

  public stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.httpServer) {
        this.httpServer.close(() => resolve());
      } else {
        resolve();
      }
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const origin = req.headers.origin || "";

    // Set CORS headers
    if (origin.startsWith("chrome-extension://") || origin === "http://localhost" || origin.startsWith("http://127.0.0.1")) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    }
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || "/", `http://${this.host}:${this.port}`);

    // SSE Events endpoint
    if (req.method === "GET" && url.pathname === "/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });

      const onLog = (log: LogEvent) => {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      };

      this.events.on("log", onLog);
      req.on("close", () => {
        this.events.off("log", onLog);
      });
      return;
    }

    // Status endpoint
    if (req.method === "GET" && url.pathname === "/status") {
      const pairing = this.auth.getPairingInfo();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          workspace: this.workspace.root,
          pairingCode: pairing.code,
          pairingExpiresIn: pairing.expiresInSeconds,
          activeTokens: this.auth.getActiveTokenCount(),
          recentLogs: this.events.getRecentLogs().slice(0, 50),
        })
      );
      return;
    }

    // Read POST JSON body
    if (req.method === "POST") {
      let bodyStr = "";
      req.on("data", (chunk) => {
        bodyStr += chunk;
        if (bodyStr.length > 2 * 1024 * 1024) {
          res.writeHead(413, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Payload too large" }));
          req.destroy();
        }
      });

      req.on("end", async () => {
        let body: any = {};
        try {
          if (bodyStr) body = JSON.parse(bodyStr);
        } catch {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: "Malformed JSON body" }));
          return;
        }

        // Pair endpoint
        if (url.pathname === "/pair") {
          const result = this.auth.pair(body.code || "");
          res.writeHead(result.ok ? 200 : 401, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
          return;
        }

        // Undo endpoint
        if (url.pathname === "/undo") {
          // Token check
          const authHeader = req.headers.authorization || "";
          const token = authHeader.replace(/^Bearer\s+/i, "");
          if (!this.auth.verifyToken(token)) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Unauthorized" }));
            return;
          }

          try {
            const undoRes = this.backups.undo(body.backupId);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: true, result: undoRes }));
          } catch (e: any) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: e.message }));
          }
          return;
        }

        // RPC endpoint
        if (url.pathname === "/rpc") {
          const authHeader = req.headers.authorization || "";
          const token = authHeader.replace(/^Bearer\s+/i, "");
          if (!this.auth.verifyToken(token)) {
            res.writeHead(401, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ ok: false, error: "Unauthorized token" }));
            return;
          }

          const toolName = body.tool;
          const args = body.args || {};
          const callId = body.id || `call_${Date.now()}`;

          const startTime = Date.now();
          let output: any = null;
          let errorMsg: string | undefined = undefined;
          let ok = false;
          let backupId: string | undefined = undefined;

          try {
            output = await this.registry.execute(toolName, args);
            ok = true;
            if (output && typeof output === "object" && output.backupId) {
              backupId = output.backupId;
            }
          } catch (e: any) {
            errorMsg = e.message || "Tool execution failed";
          }

          const durationMs = Date.now() - startTime;

          // Emit log to EventBus
          this.events.emitLog({
            id: callId,
            timestamp: new Date().toISOString(),
            tool: toolName,
            args,
            durationMs,
            ok,
            error: errorMsg,
            backupId,
          });

          res.writeHead(ok ? 200 : 400, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              id: callId,
              tool: toolName,
              ok,
              output: typeof output === "string" ? output : JSON.stringify(output, null, 2),
              error: errorMsg,
              backupId,
            })
          );
          return;
        }

        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: "Not found" }));
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, error: "Not found" }));
  }
}
