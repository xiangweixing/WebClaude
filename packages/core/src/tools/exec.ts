import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { WorkspaceManager } from "../workspace.js";

const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KiB

export class ExecTools {
  constructor(
    private ws: WorkspaceManager,
    private allowedCommands: string[]
  ) {}

  /**
   * Resolves the executable path on Windows (e.g. npm -> npm.cmd) so it can be spawned with shell: false.
   */
  private resolveExecutable(cmd: string): string {
    if (os.platform() !== "win32") {
      return cmd;
    }

    const pathExts = (process.env.PATHEXT || ".COM;.EXE;.BAT;.CMD").split(";");
    const pathDirs = (process.env.PATH || "").split(path.delimiter);

    // If cmd already has an extension
    if (path.extname(cmd)) {
      return cmd;
    }

    for (const dir of pathDirs) {
      for (const ext of pathExts) {
        const candidate = path.join(dir, `${cmd}${ext}`);
        if (fs.existsSync(candidate)) {
          return candidate;
        }
      }
    }

    return cmd;
  }

  public async runCommand(
    command: string,
    args: string[] = [],
    timeoutSeconds = 120
  ): Promise<{ exitCode: number | null; stdout: string; stderr: string; timedOut: boolean }> {
    const root = this.ws.root;
    if (!root) throw new Error("No workspace selected.");

    if (!command || typeof command !== "string") {
      throw new Error("command parameter is required.");
    }

    // Clean base command name
    const baseCmd = path.basename(command).toLowerCase().replace(/\.(exe|cmd|bat)$/, "");

    // Verify against allowed commands whitelist
    const isAllowed = this.allowedCommands.some((c) => c.toLowerCase() === baseCmd);
    if (!isAllowed) {
      throw new Error(
        `Command '${baseCmd}' is not in the allowed whitelist (${this.allowedCommands.join(", ")}). Modify allowed commands in settings if needed.`
      );
    }

    // Ensure args is string array
    const cleanArgs = Array.isArray(args) ? args.map(String) : [];

    const exePath = this.resolveExecutable(command);

    return new Promise((resolve) => {
      let stdoutBuf = "";
      let stderrBuf = "";
      let timedOut = false;

      const proc = spawn(exePath, cleanArgs, {
        cwd: root,
        shell: false, // Critical: prevent shell injection, chaining, and subshells
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, timeoutSeconds * 1000);

      proc.stdout?.on("data", (chunk: Buffer) => {
        stdoutBuf += chunk.toString("utf8");
        if (stdoutBuf.length > MAX_OUTPUT_BYTES * 2) {
          // Truncate keeping head and tail
          const head = stdoutBuf.slice(0, MAX_OUTPUT_BYTES / 2);
          const tail = stdoutBuf.slice(-MAX_OUTPUT_BYTES / 2);
          stdoutBuf = `${head}\n... [stdout truncated] ...\n${tail}`;
        }
      });

      proc.stderr?.on("data", (chunk: Buffer) => {
        stderrBuf += chunk.toString("utf8");
        if (stderrBuf.length > MAX_OUTPUT_BYTES * 2) {
          const head = stderrBuf.slice(0, MAX_OUTPUT_BYTES / 2);
          const tail = stderrBuf.slice(-MAX_OUTPUT_BYTES / 2);
          stderrBuf = `${head}\n... [stderr truncated] ...\n${tail}`;
        }
      });

      proc.on("error", (err: Error) => {
        clearTimeout(timer);
        resolve({
          exitCode: 1,
          stdout: stdoutBuf,
          stderr: `Execution error: ${err.message}`,
          timedOut: false,
        });
      });

      proc.on("close", (code: number | null) => {
        clearTimeout(timer);
        resolve({
          exitCode: code,
          stdout: stdoutBuf.trim(),
          stderr: stderrBuf.trim(),
          timedOut,
        });
      });
    });
  }
}
