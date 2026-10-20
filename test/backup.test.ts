import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { BackupManager } from "../packages/core/src/backup.js";

test("backup - creates backup and reverts changes via undo", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-bk-"));
  const backups = new BackupManager(() => tmpDir);

  const targetFile = path.join(tmpDir, "file.txt");
  fs.writeFileSync(targetFile, "version 1", "utf8");

  // Create backup before modifying
  const bkId = backups.createBackup(targetFile, "write");
  fs.writeFileSync(targetFile, "version 2", "utf8");
  assert.strictEqual(fs.readFileSync(targetFile, "utf8"), "version 2");

  // Undo
  const undoRes = backups.undo(bkId);
  assert.ok(undoRes.action.includes("Restored original"));
  assert.strictEqual(fs.readFileSync(targetFile, "utf8"), "version 1");

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("backup - undo removes newly created file if it did not exist before", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-bk-"));
  const backups = new BackupManager(() => tmpDir);

  const newFile = path.join(tmpDir, "newfile.txt");
  // File doesn't exist yet
  const bkId = backups.createBackup(newFile, "write");
  fs.writeFileSync(newFile, "created content", "utf8");
  assert.strictEqual(fs.existsSync(newFile), true);

  // Undo
  backups.undo(bkId);
  assert.strictEqual(fs.existsSync(newFile), false);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
