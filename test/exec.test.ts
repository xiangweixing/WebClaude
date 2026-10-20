import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WorkspaceManager } from "../packages/core/src/workspace.js";
import { ExecTools } from "../packages/core/src/tools/exec.js";

test("exec - enforces command whitelist", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-exec-"));
  const ws = new WorkspaceManager(tmpDir);
  const exec = new ExecTools(ws, ["node"]);

  // node is whitelisted
  const nodeRes = await exec.runCommand("node", ["-e", "console.log('hello from node')"]);
  assert.strictEqual(nodeRes.exitCode, 0);
  assert.strictEqual(nodeRes.stdout, "hello from node");

  // curl is not whitelisted
  await assert.rejects(
    async () => {
      await exec.runCommand("curl", ["https://example.com"]);
    },
    /not in the allowed whitelist/
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
