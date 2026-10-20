import { test } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { WorkspaceManager } from "../packages/core/src/workspace.js";
import { BackupManager } from "../packages/core/src/backup.js";
import { EditTools } from "../packages/core/src/tools/edit.js";

test("edit - applies exact search and replace edits", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-edit-"));
  const ws = new WorkspaceManager(tmpDir);
  const backups = new BackupManager(() => ws.root);
  const editor = new EditTools(ws, backups);

  const testFile = path.join(tmpDir, "sample.ts");
  fs.writeFileSync(
    testFile,
    "function hello() {\n  console.log('original');\n}\n",
    "utf8"
  );

  const res = editor.editFile("sample.ts", [
    {
      search: "console.log('original');",
      replace: "console.log('modified');",
    },
  ]);

  assert.strictEqual(res.appliedEdits, 1);
  assert.ok(res.backupId);

  const updated = fs.readFileSync(testFile, "utf8");
  assert.ok(updated.includes("console.log('modified');"));
  assert.ok(!updated.includes("console.log('original');"));

  // Clean up
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("edit - throws error when SEARCH block not found", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-edit-"));
  const ws = new WorkspaceManager(tmpDir);
  const backups = new BackupManager(() => ws.root);
  const editor = new EditTools(ws, backups);

  const testFile = path.join(tmpDir, "sample.ts");
  fs.writeFileSync(testFile, "const x = 10;", "utf8");

  assert.throws(() => {
    editor.editFile("sample.ts", [
      { search: "const y = 20;", replace: "const y = 30;" },
    ]);
  }, /SEARCH block not found/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("edit - throws error when SEARCH block matches multiple locations", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-edit-"));
  const ws = new WorkspaceManager(tmpDir);
  const backups = new BackupManager(() => ws.root);
  const editor = new EditTools(ws, backups);

  const testFile = path.join(tmpDir, "sample.ts");
  fs.writeFileSync(testFile, "let a = 1;\nlet a = 1;", "utf8");

  assert.throws(() => {
    editor.editFile("sample.ts", [{ search: "let a = 1;", replace: "let a = 2;" }]);
  }, /matched multiple locations/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("edit - automatically strips line number prefixes copied from read_file", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-edit-"));
  const ws = new WorkspaceManager(tmpDir);
  const backups = new BackupManager(() => ws.root);
  const editor = new EditTools(ws, backups);

  const testFile = path.join(tmpDir, "sample.ts");
  fs.writeFileSync(
    testFile,
    "const port = 3000;\nconst hostname = '127.0.0.1';\n",
    "utf8"
  );

  // Claude copied line numbers: "1 | const port = 3000;"
  const res = editor.editFile("sample.ts", [
    {
      search: "1 | const port = 3000;\n2 | const hostname = '127.0.0.1';",
      replace: "const port = 8080;\nconst hostname = '0.0.0.0';",
    },
  ]);

  assert.strictEqual(res.appliedEdits, 1);
  const updated = fs.readFileSync(testFile, "utf8");
  assert.ok(updated.includes("const port = 8080;"));
  assert.ok(updated.includes("const hostname = '0.0.0.0';"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("edit - tolerant to trailing whitespace and blank line differences", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-edit-"));
  const ws = new WorkspaceManager(tmpDir);
  const backups = new BackupManager(() => ws.root);
  const editor = new EditTools(ws, backups);

  const testFile = path.join(tmpDir, "sample.ts");
  fs.writeFileSync(
    testFile,
    "function run() {\n  return 42;\n}\n",
    "utf8"
  );

  // Search has trailing whitespace on lines and an extra trailing blank line
  const res = editor.editFile("sample.ts", [
    {
      search: "function run() {   \n  return 42;   \n\n",
      replace: "function run() {\n  return 100;\n}\n",
    },
  ]);

  assert.strictEqual(res.appliedEdits, 1);
  const updated = fs.readFileSync(testFile, "utf8");
  assert.ok(updated.includes("return 100;"));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("workspace - safePath tolerates outer quotes", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "wc-ws-"));
  const ws = new WorkspaceManager(tmpDir);

  const p1 = ws.safePath('"src/index.ts"');
  const p2 = ws.safePath("'src/index.ts'");
  const p3 = ws.safePath("src/index.ts");

  assert.strictEqual(p1, p3);
  assert.strictEqual(p2, p3);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
