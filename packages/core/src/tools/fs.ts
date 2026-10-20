import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WorkspaceManager, DEFAULT_IGNORED_DIRS } from "../workspace.js";
import { BackupManager } from "../backup.js";

const MAX_READ_BYTES = 1024 * 1024; // 1 MiB
const MAX_WRITE_BYTES = 1024 * 1024; // 1 MiB

export class FsTools {
  constructor(
    private ws: WorkspaceManager,
    private backups: BackupManager,
    private allowedCommands: string[]
  ) {}

  public workspaceInfo() {
    const root = this.ws.root;
    if (!root) throw new Error("No workspace selected.");

    const isGit = fs.existsSync(path.join(root, ".git"));
    return {
      workspaceName: path.basename(root),
      workspacePath: root,
      platform: `${os.platform()} (${os.arch()})`,
      isGitRepository: isGit,
      allowedCommands: this.allowedCommands,
    };
  }

  public listDirectory(relPath = ""): { path: string; entries: Array<{ name: string; type: string }> } {
    const target = this.ws.safePath(relPath);
    const stat = fs.statSync(target);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${relPath}`);
    }

    const items = fs.readdirSync(target, { withFileTypes: true });
    const filtered = items
      .filter((d) => !DEFAULT_IGNORED_DIRS.includes(d.name))
      .slice(0, 500)
      .map((d) => ({
        name: d.name,
        type: d.isDirectory() ? "directory" : d.isFile() ? "file" : "other",
      }))
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));

    return { path: relPath, entries: filtered };
  }

  public directoryTree(relPath = "", maxDepth = 5): { tree: string; count: number } {
    const target = this.ws.safePath(relPath);
    const lines: string[] = [];
    let count = 0;

    const walk = (dir: string, prefix: string, depth: number) => {
      if (depth > maxDepth || count >= 1500) return;
      let items: fs.Dirent[] = [];
      try {
        items = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      const filtered = items
        .filter((d) => !DEFAULT_IGNORED_DIRS.includes(d.name))
        .sort((a, b) => a.name.localeCompare(b.name))
        .slice(0, 200);

      for (let i = 0; i < filtered.length && count < 1500; i++) {
        const item = filtered[i];
        const last = i === filtered.length - 1;
        count++;
        lines.push(prefix + (last ? "└── " : "├── ") + item.name + (item.isDirectory() ? "/" : ""));

        if (item.isDirectory()) {
          const sub = path.join(dir, item.name);
          try {
            if (fs.lstatSync(sub).isSymbolicLink()) continue;
          } catch {}
          walk(sub, prefix + (last ? "    " : "│   "), depth + 1);
        }
      }
    };

    walk(target, "", 0);
    return { tree: lines.join("\n"), count };
  }

  public readFile(
    relPath: string,
    startLine?: number,
    endLine?: number
  ): { path: string; totalLines: number; startLine: number; endLine: number; content: string } {
    if (!relPath) throw new Error("path parameter is required.");
    const filePath = this.ws.safePath(relPath);

    const stat = fs.statSync(filePath);
    if (!stat.isFile()) throw new Error(`Path is not a regular file: ${relPath}`);
    if (stat.size > MAX_READ_BYTES) {
      throw new Error(`File is too large (${(stat.size / 1024).toFixed(1)} KiB, max allowed is 1 MiB)`);
    }

    const buffer = fs.readFileSync(filePath);
    // Quick binary check (null byte inspection)
    if (buffer.subarray(0, 4096).includes(0)) {
      throw new Error("Binary files cannot be read as text.");
    }

    const rawText = buffer.toString("utf8");
    const isCRLF = rawText.includes("\r\n");
    const lines = rawText.split(isCRLF ? "\r\n" : "\n");
    const totalLines = lines.length;

    const start = Math.max(1, startLine || 1);
    const end = Math.min(totalLines, endLine || Math.min(totalLines, start + 399)); // default 400 lines max
    const selected = lines.slice(start - 1, end);

    // Number lines for Claude's convenience
    const numbered = selected.map((line, idx) => `${start + idx} | ${line}`).join("\n");

    return {
      path: relPath,
      totalLines,
      startLine: start,
      endLine: end,
      content: numbered,
    };
  }

  public writeFile(
    relPath: string,
    content: string
  ): { path: string; bytesWritten: number; backupId?: string } {
    if (!relPath) throw new Error("path parameter is required.");
    if (typeof content !== "string") throw new Error("content parameter must be a string.");

    const buf = Buffer.from(content, "utf8");
    if (buf.length > MAX_WRITE_BYTES) {
      throw new Error(`Content exceeds max write limit of 1 MiB.`);
    }

    const filePath = this.ws.safePath(relPath);
    let backupId: string | undefined;

    // Backup if file already exists or create backup record
    backupId = this.backups.createBackup(filePath, "write");

    fs.mkdirSync(path.dirname(filePath), { recursive: true });

    // Atomic write
    const tempFile = `${filePath}.webclaude-tmp-${Date.now()}`;
    fs.writeFileSync(tempFile, buf);
    fs.renameSync(tempFile, filePath);

    return {
      path: relPath,
      bytesWritten: buf.length,
      backupId,
    };
  }

  public createDirectory(relPath: string): { path: string; created: boolean } {
    if (!relPath) throw new Error("path parameter is required.");
    const dirPath = this.ws.safePath(relPath);
    fs.mkdirSync(dirPath, { recursive: true });
    return { path: relPath, created: true };
  }

  public movePath(fromRel: string, toRel: string): { from: string; to: string } {
    if (!fromRel || !toRel) throw new Error("Both 'from' and 'to' paths are required.");
    const fromPath = this.ws.safePath(fromRel);
    const toPath = this.ws.safePath(toRel);

    if (!fs.existsSync(fromPath)) {
      throw new Error(`Source path does not exist: ${fromRel}`);
    }
    if (fs.existsSync(toPath)) {
      throw new Error(`Destination path already exists: ${toRel}`);
    }

    this.backups.createBackup(fromPath, "delete");
    fs.mkdirSync(path.dirname(toPath), { recursive: true });
    fs.renameSync(fromPath, toPath);

    return { from: fromRel, to: toRel };
  }

  public deletePath(relPath: string): { path: string; backupId: string } {
    if (!relPath) throw new Error("path parameter is required.");
    const target = this.ws.safePath(relPath);

    if (!fs.existsSync(target)) {
      throw new Error(`Path does not exist: ${relPath}`);
    }

    const backupId = this.backups.createBackup(target, "delete");
    const stat = fs.statSync(target);

    if (stat.isDirectory()) {
      fs.rmSync(target, { recursive: true, force: true });
    } else {
      fs.unlinkSync(target);
    }

    return { path: relPath, backupId };
  }
}
