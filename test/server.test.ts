import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createWebClaudeCore } from "../packages/core/src/index.js";

test("server - lifecycle, pairing, and authenticated rpc call", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-srv-"));
  const port = 43199; // test port

  const { server } = createWebClaudeCore({
    port,
    workspaceDir: tmpDir,
    allowedCommands: ["node"],
  });

  await server.start();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // 1. Check status
    const statusRes = await fetch(`${baseUrl}/status`);
    const statusData = await statusRes.json();
    assert.strictEqual(statusData.ok, true);
    assert.ok(statusData.pairingCode);

    // 2. Reject unauthenticated RPC
    const unauthRes = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool: "workspace_info", args: {} }),
    });
    assert.strictEqual(unauthRes.status, 401);

    // 3. Pair with valid code
    const pairRes = await fetch(`${baseUrl}/pair`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: statusData.pairingCode }),
    });
    const pairData = await pairRes.json();
    assert.strictEqual(pairData.ok, true);
    assert.ok(pairData.token);

    // 4. Authenticated RPC call
    const rpcRes = await fetch(`${baseUrl}/rpc`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pairData.token}`,
      },
      body: JSON.stringify({ tool: "workspace_info", args: {} }),
    });
    const rpcData = await rpcRes.json();
    assert.strictEqual(rpcData.ok, true);
    assert.strictEqual(rpcData.tool, "workspace_info");
    assert.ok(rpcData.output.includes("platform"));
  } finally {
    await server.stop();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
