import fs from "node:fs";
import path from "node:path";

export const DEFAULT_IGNORED_DIRS = [
  "node_modules",
  ".git",
  ".webclaude-backups",
  "dist",
  "build",
  ".next",
  ".nuxt",
  ".venv",
  "venv",
  "__pycache__",
  ".cache",
  ".turbo",
];

export const SENSITIVE_PATTERNS = [
  /^\.env(\..+)?$/i,
  /\.pem$/i,
  /\.key$/i,
  /^id_rsa/i,
  /^id_ed25519/i,
  /\.pfx$/i,
  /\.keystore$/i,
];

export class WorkspaceManager {
  private _root: string | null = null;

  constructor(initialRoot?: string) {
    if (initialRoot) {
      this.setRoot(initialRoot);
    }
  }

  public get root(): string | null {
    return this._root;
  }

  public setRoot(dirPath: string): string {
    if (!dirPath || typeof dirPath !== "string") {
      throw new Error("Invalid workspace directory path.");
    }
    const resolved = path.resolve(dirPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Directory does not exist: ${resolved}`);
    }
    const stat = fs.statSync(resolved);
    if (!stat.isDirectory()) {
      throw new Error(`Path is not a directory: ${resolved}`);
    }
    this._root = fs.realpathSync(resolved);
    return this._root;
  }

  /**
   * Validates and resolves a relative path within the workspace.
   * Throws errors if path escapes workspace, targets symlinks, or touches sensitive files.
   */
  public safePath(rel = "", allowSensitive = false): string {
    if (!this._root) {
      throw new Error("No workspace selected. Please configure a workspace first.");
    }

    if (typeof rel !== "string" || rel.includes("\0")) {
      throw new Error("Invalid path parameter.");
    }

    // Clean outer quotes if any
    let cleanedRel = rel.trim();
    if (
      (cleanedRel.startsWith('"') && cleanedRel.endsWith('"')) ||
      (cleanedRel.startsWith("'") && cleanedRel.endsWith("'"))
    ) {
      cleanedRel = cleanedRel.slice(1, -1).trim();
    }

    // Normalize forward/back slashes
    const normalized = cleanedRel.replace(/[\\/]+/g, path.sep).trim();

    // Reject absolute paths, drive letters, UNC paths
    if (
      path.isAbsolute(normalized) ||
      /^[a-zA-Z]:/.test(cleanedRel) ||
      cleanedRel.startsWith("\\\\") ||
      cleanedRel.startsWith("//") ||
      cleanedRel.startsWith("/") ||
      cleanedRel.startsWith("\\")
    ) {
      throw new Error("Absolute and UNC paths are forbidden.");
    }

    const resolved = path.resolve(this._root, normalized || ".");
    const relative = path.relative(this._root, resolved);

    // Escape check
    if (relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
      throw new Error("Path escapes selected workspace root.");
    }

    // Check sensitive patterns unless explicitly allowed
    if (!allowSensitive && relative) {
      const parts = relative.split(path.sep);
      for (const part of parts) {
        if (part === ".webclaude-backups") {
          throw new Error("Access to .webclaude-backups internal directory is forbidden.");
        }
        for (const pattern of SENSITIVE_PATTERNS) {
          if (pattern.test(part)) {
            throw new Error(`Access to sensitive file '${part}' is restricted for security.`);
          }
        }
      }
    }

    // Verify no symbolic links in the path
    let cursor = this._root;
    const parts = relative ? relative.split(path.sep) : [];
    for (const part of parts) {
      cursor = path.join(cursor, part);
      try {
        const lstat = fs.lstatSync(cursor);
        if (lstat.isSymbolicLink()) {
          throw new Error(`Symlinks are forbidden inside workspace: ${part}`);
        }
      } catch (e: any) {
        if (e.code !== "ENOENT") throw e;
      }
    }

    return resolved;
  }

  public toRelative(absPath: string): string {
    if (!this._root) return absPath;
    const rel = path.relative(this._root, absPath);
    return rel.replace(/\\/g, "/");
  }
}
