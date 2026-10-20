import fs from "node:fs";
import path from "node:path";

export interface BackupMeta {
  backupId: string;
  timestamp: string;
  relativePath: string;
  action: "write" | "edit" | "delete";
  existedBefore: boolean;
}

export class BackupManager {
  constructor(private getWorkspaceRoot: () => string | null) {}

  private getBackupDir(): string {
    const root = this.getWorkspaceRoot();
    if (!root) throw new Error("No workspace configured.");
    const dir = path.join(root, ".webclaude-backups");
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  }

  /**
   * Creates a backup before a mutating operation on filePath.
   * Returns a unique backupId.
   */
  public createBackup(filePath: string, action: "write" | "edit" | "delete"): string {
    const root = this.getWorkspaceRoot();
    if (!root) throw new Error("No workspace configured.");

    const backupId = `bk_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const backupDir = path.join(this.getBackupDir(), backupId);
    fs.mkdirSync(backupDir, { recursive: true });

    const rel = path.relative(root, filePath).replace(/\\/g, "/");
    const existed = fs.existsSync(filePath);

    const meta: BackupMeta = {
      backupId,
      timestamp: new Date().toISOString(),
      relativePath: rel,
      action,
      existedBefore: existed,
    };

    if (existed) {
      const backupFilePath = path.join(backupDir, "original.data");
      fs.copyFileSync(filePath, backupFilePath);
    }

    fs.writeFileSync(path.join(backupDir, "meta.json"), JSON.stringify(meta, null, 2), "utf8");
    return backupId;
  }

  /**
   * Reverts changes made associated with backupId.
   */
  public undo(backupId: string): { restored: string; action: string } {
    const root = this.getWorkspaceRoot();
    if (!root) throw new Error("No workspace configured.");

    const backupDir = path.join(this.getBackupDir(), backupId);
    const metaPath = path.join(backupDir, "meta.json");

    if (!fs.existsSync(metaPath)) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const meta: BackupMeta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
    const targetPath = path.join(root, meta.relativePath);

    if (meta.existedBefore) {
      const originalFile = path.join(backupDir, "original.data");
      if (!fs.existsSync(originalFile)) {
        throw new Error(`Original backup content file missing for: ${backupId}`);
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.copyFileSync(originalFile, targetPath);
      return { restored: meta.relativePath, action: `Restored original file from ${backupId}` };
    } else {
      // The file was created by the action, so undo deletes it
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
      }
      return { restored: meta.relativePath, action: `Removed created file to revert ${backupId}` };
    }
  }

  /**
   * Lists the recent backups.
   */
  public listBackups(limit = 50): BackupMeta[] {
    try {
      const backupDir = this.getBackupDir();
      const entries = fs.readdirSync(backupDir, { withFileTypes: true });
      const metas: BackupMeta[] = [];

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const metaPath = path.join(backupDir, entry.name, "meta.json");
        if (fs.existsSync(metaPath)) {
          try {
            metas.push(JSON.parse(fs.readFileSync(metaPath, "utf8")));
          } catch {}
        }
      }

      return metas
        .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
        .slice(0, limit);
    } catch {
      return [];
    }
  }
}
