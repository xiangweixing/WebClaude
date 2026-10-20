export interface SearchReplaceEdit {
  search: string;
  replace: string;
}

export interface ToolCall {
  id: string;
  tool: string;
  args: Record<string, any>;
  raw: string;
  error?: string;
}

export interface ParseResult {
  calls: ToolCall[];
  hasCallBlocks: boolean;
}

/**
 * Extracts blocks matching ````webclaude ... ```` or ```webclaude ... ``` or raw @call blocks.
 */
export function extractWebClaudeBlocks(text: string): string[] {
  if (!text) return [];

  const blocks: string[] = [];
  // Regex to match 3 or more backticks
  const codeBlockRegex = /(`{3,})[^\n]*\n([\s\S]*?)\1/g;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    const header = match[0];
    const content = match[2];
    const firstLine = content.trim().split("\n")[0]?.trim() || "";

    if (header.includes("webclaude") || firstLine.startsWith("@call") || content.includes("@call")) {
      // If a code block contains multiple @call instructions, split them
      const callsInBlock = content.split(/(?=^[ \t]*@call\b)/m).filter((c) => c.trim().startsWith("@call"));
      if (callsInBlock.length > 0) {
        blocks.push(...callsInBlock);
      } else {
        blocks.push(content);
      }
    }
  }

  // If no backtick blocks matched, but the text contains @call
  if (blocks.length === 0 && text.includes("@call")) {
    const rawCalls = text.split(/(?=^[ \t]*@call\b)/m).filter((c) => c.trim().startsWith("@call"));
    if (rawCalls.length > 0) {
      blocks.push(...rawCalls);
    }
  }

  return blocks;
}

/**
 * Cleans string argument values (removes outer quotes, normalizes paths).
 */
export function cleanArgValue(key: string, val: string): string {
  let cleaned = val.trim();
  // Strip outer quotes if paired
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"') && cleaned.length >= 2) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'") && cleaned.length >= 2)
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }

  // For path parameters, strip leading slash (e.g. "/src/app.ts" -> "src/app.ts")
  // but preserve UNC prefixes ("//") or absolute drive letters
  if (key === "path" || key === "from" || key === "to") {
    if (/^[/\\](?![/\\])/.test(cleaned)) {
      cleaned = cleaned.replace(/^[/\\]+/, "");
    }
  }

  return cleaned;
}

/**
 * Parses a single webclaude call block into a ToolCall object.
 */
export function parseCallBlock(rawContent: string): ToolCall {
  const normalized = rawContent.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");

  let id = "";
  let tool = "";
  let headerIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (line.startsWith("@call")) {
      const parts = line.split(/\s+/);
      id = parts[1] || `call_${Date.now()}`;
      tool = parts[2] || "";
      headerIndex = i;
      break;
    }
  }

  if (!tool) {
    return {
      id: id || "unknown",
      tool: "unknown",
      args: {},
      raw: rawContent,
      error: "Missing '@call <id> <tool_name>' header line.",
    };
  }

  const remainingText = lines.slice(headerIndex + 1).join("\n");
  const args: Record<string, any> = {};

  // Check for specialized block formats:
  // 1. edit_file: SEARCH / REPLACE blocks (robust multiline regex tolerant to trailing spaces/comments/endings)
  const searchReplaceRegex =
    /^[ \t]*<<<<<<< SEARCH[^\r\n]*\r?\n([\s\S]*?)^[ \t]*=======[^\r\n]*\r?\n([\s\S]*?)^[ \t]*>>>>>>>[^\r\n]*/gm;
  const edits: SearchReplaceEdit[] = [];
  let srMatch: RegExpExecArray | null;

  while ((srMatch = searchReplaceRegex.exec(remainingText)) !== null) {
    edits.push({
      search: srMatch[1],
      replace: srMatch[2],
    });
  }

  if (edits.length > 0) {
    args.edits = edits;
  }

  // 2. write_file: CONTENT block
  const contentRegex = /^[ \t]*<<<<<<< CONTENT[^\r\n]*\r?\n([\s\S]*?)^[ \t]*>>>>>>>[^\r\n]*/gm;
  const contentMatch = contentRegex.exec(remainingText);
  if (contentMatch) {
    args.content = contentMatch[1];
  }

  // 3. Parse key-value lines outside of block markers
  // Strip out the content/search-replace blocks before parsing key-value lines
  const kvText = remainingText
    .replace(/^[ \t]*<<<<<<< SEARCH[^\r\n]*\r?\n[\s\S]*?^[ \t]*>>>>>>>[^\r\n]*/gm, "")
    .replace(/^[ \t]*<<<<<<< CONTENT[^\r\n]*\r?\n[\s\S]*?^[ \t]*>>>>>>>[^\r\n]*/gm, "");

  const kvLines = kvText.split("\n");
  for (const line of kvLines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("//")) continue;

    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const key = trimmed.slice(0, colonIdx).trim();
      const valStr = trimmed.slice(colonIdx + 1).trim();

      // Only assign if not already set by block parser
      if (args[key] === undefined) {
        if (valStr.startsWith("[") && valStr.endsWith("]")) {
          try {
            args[key] = JSON.parse(valStr);
          } catch {
            args[key] = valStr
              .slice(1, -1)
              .split(",")
              .map((s) => cleanArgValue(key, s.trim()));
          }
        } else if (valStr === "true") {
          args[key] = true;
        } else if (valStr === "false") {
          args[key] = false;
        } else if (/^-?\d+$/.test(valStr)) {
          args[key] = parseInt(valStr, 10);
        } else {
          // If key is args and it is space-separated strings
          if (key === "args" && valStr.length > 0 && !valStr.startsWith('"') && !valStr.startsWith("'")) {
            args[key] = valStr.split(/\s+/);
          } else {
            args[key] = cleanArgValue(key, valStr);
          }
        }
      }
    }
  }

  // Fallback 1: If edit_file without edits block, check if Claude supplied search/replace as key-values
  if (tool === "edit_file" && (!args.edits || args.edits.length === 0)) {
    const searchVal = args.search ?? args.old_string ?? args.old_text;
    const replaceVal = args.replace ?? args.new_string ?? args.new_text;
    if (typeof searchVal === "string" && typeof replaceVal === "string") {
      args.edits = [{ search: searchVal, replace: replaceVal }];
    }
  }

  // Fallback 2: If write_file without CONTENT block, check if Claude supplied content/text as key-value
  if (tool === "write_file" && args.content === undefined) {
    if (typeof args.text === "string") {
      args.content = args.text;
    }
  }

  // Final check: ensure path is cleaned if present
  if (typeof args.path === "string") {
    args.path = cleanArgValue("path", args.path);
  }

  return {
    id,
    tool,
    args,
    raw: rawContent,
  };
}

/**
 * Main parser: takes Claude's markdown response text, extracts all webclaude tool call blocks,
 * and parses them into ToolCalls.
 */
export function parseClaudeResponse(text: string): ParseResult {
  const blocks = extractWebClaudeBlocks(text);
  if (blocks.length === 0) {
    return { calls: [], hasCallBlocks: false };
  }

  const calls = blocks.map(parseCallBlock);
  return { calls, hasCallBlocks: true };
}
