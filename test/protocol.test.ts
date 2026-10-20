import { test } from "node:test";
import assert from "node:assert";
import {
  parseClaudeResponse,
  formatSingleResult,
  formatBatchResults,
  buildProtocolPrompt,
  formatDuration,
} from "../packages/protocol/src/index.js";

test("protocol - parses single @call block with key-values", () => {
  const reply = `
I will check the directory tree for you.

\`\`\`\`webclaude
@call 1 list_directory
path: src
\`\`\`\`
  `;

  const res = parseClaudeResponse(reply);
  assert.strictEqual(res.hasCallBlocks, true);
  assert.strictEqual(res.calls.length, 1);
  assert.strictEqual(res.calls[0].id, "1");
  assert.strictEqual(res.calls[0].tool, "list_directory");
  assert.strictEqual(res.calls[0].args.path, "src");
});

test("protocol - parses edit_file with SEARCH/REPLACE blocks", () => {
  const reply = `
\`\`\`\`webclaude
@call 2 edit_file
path: src/index.ts
<<<<<<< SEARCH
const a = 1;
=======
const a = 2;
>>>>>>> REPLACE
\`\`\`\`
  `;

  const res = parseClaudeResponse(reply);
  assert.strictEqual(res.hasCallBlocks, true);
  assert.strictEqual(res.calls.length, 1);
  assert.strictEqual(res.calls[0].tool, "edit_file");
  assert.strictEqual(res.calls[0].args.path, "src/index.ts");
  assert.ok(Array.isArray(res.calls[0].args.edits));
  assert.strictEqual(res.calls[0].args.edits.length, 1);
  assert.strictEqual(res.calls[0].args.edits[0].search.trim(), "const a = 1;");
  assert.strictEqual(res.calls[0].args.edits[0].replace.trim(), "const a = 2;");
});

test("protocol - parses write_file with CONTENT block", () => {
  const reply = `
\`\`\`\`webclaude
@call 3 write_file
path: hello.txt
<<<<<<< CONTENT
Hello World
Second Line
>>>>>>> END
\`\`\`\`
  `;

  const res = parseClaudeResponse(reply);
  assert.strictEqual(res.calls.length, 1);
  assert.strictEqual(res.calls[0].tool, "write_file");
  assert.strictEqual(res.calls[0].args.path, "hello.txt");
  assert.ok(res.calls[0].args.content.includes("Hello World"));
});

test("protocol - formats single result and batch results", () => {
  const formatted = formatSingleResult({
    id: "1",
    tool: "read_file",
    ok: true,
    output: "1 | console.log('hi');",
  });

  assert.ok(formatted.includes("@result 1 read_file ok"));
  assert.ok(formatted.includes("1 | console.log('hi');"));

  const batch = formatBatchResults([
    { id: "1", tool: "read_file", ok: true, output: "content" },
    { id: "2", tool: "write_file", ok: false, error: "Disk full" },
  ]);

  assert.ok(batch.includes("@result 1 read_file ok"));
  assert.ok(batch.includes("@result 2 write_file error"));
});

test("protocol - builds prompt correctly", () => {
  const prompt = buildProtocolPrompt(
    {
      workspaceName: "MyProject",
      platform: "win32",
      tree: "src/\n└── index.ts",
    },
    "@webclaude please fix the typo"
  );

  assert.ok(prompt.includes("MyProject"));
  assert.ok(prompt.includes("src/"));
  assert.ok(prompt.includes("please fix the typo"));
  assert.ok(!prompt.includes("@webclaude please"));
});

test("protocol - formats duration correctly", () => {
  assert.strictEqual(formatDuration(450), "450ms");
  assert.strictEqual(formatDuration(12400), "12.4s");
  assert.strictEqual(formatDuration(75000), "1分15秒");
  assert.strictEqual(formatDuration(125000), "2分05秒");
});

test("protocol - parses edit_file with trailing whitespace and custom annotations", () => {
  const reply = `
\`\`\`\`webclaude
@call 10 edit_file
path: "src/app.ts"
<<<<<<< SEARCH: src/app.ts   
const a = 1;   
=======   
const a = 2;   
>>>>>>> REPLACE   
\`\`\`\`
  `;

  const res = parseClaudeResponse(reply);
  assert.strictEqual(res.calls.length, 1);
  assert.strictEqual(res.calls[0].args.path, "src/app.ts");
  assert.ok(res.calls[0].args.edits);
  assert.strictEqual(res.calls[0].args.edits.length, 1);
  assert.ok(res.calls[0].args.edits[0].search.includes("const a = 1;"));
});

test("protocol - parses edit_file ending with >>>>>>> or >>>>>>> END", () => {
  const reply = `
\`\`\`\`webclaude
@call 11 edit_file
path: /src/app.ts
<<<<<<< SEARCH
const a = 1;
=======
const a = 2;
>>>>>>> END
\`\`\`\`
  `;

  const res = parseClaudeResponse(reply);
  assert.strictEqual(res.calls.length, 1);
  assert.strictEqual(res.calls[0].args.path, "src/app.ts");
  assert.strictEqual(res.calls[0].args.edits.length, 1);
});

test("protocol - falls back to key-value search/replace when no markers used", () => {
  const reply = `
\`\`\`\`webclaude
@call 12 edit_file
path: src/app.ts
search: const a = 1;
replace: const a = 2;
\`\`\`\`
  `;

  const res = parseClaudeResponse(reply);
  assert.strictEqual(res.calls.length, 1);
  assert.strictEqual(res.calls[0].args.edits.length, 1);
  assert.strictEqual(res.calls[0].args.edits[0].search, "const a = 1;");
  assert.strictEqual(res.calls[0].args.edits[0].replace, "const a = 2;");
});
