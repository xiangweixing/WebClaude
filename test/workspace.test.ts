import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WorkspaceManager } from "../packages/core/src/workspace.js";

test("workspace - safePath prevents path traversal and absolute paths", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-test-"));
  const ws = new WorkspaceManager(tmpDir);

  // Valid relative path
  const valid = ws.safePath("src/index.js");
  assert.strictEqual(valid, path.join(tmpDir, "src", "index.js"));

  // Reject absolute paths
  assert.throws(() => ws.safePath("C:\\Windows\\System32"), /Absolute/);
  assert.throws(() => ws.safePath("/etc/passwd"), /Absolute/);

  // Reject escape paths
  assert.throws(() => ws.safePath("../../escape.txt"), /escapes/);
  assert.throws(() => ws.safePath("src/../../escape.txt"), /escapes/);

  // Reject sensitive paths
  assert.throws(() => ws.safePath(".env"), /sensitive/);
  assert.throws(() => ws.safePath("config/.env.production"), /sensitive/);
  assert.throws(() => ws.safePath("keys/id_rsa"), /sensitive/);

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
