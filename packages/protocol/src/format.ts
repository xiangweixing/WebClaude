export interface ToolResult {
  id: string;
  tool: string;
  ok: boolean;
  output?: string;
  error?: string;
  backupId?: string;
}

/**
 * Formats a single tool execution result into a ````webclaude-result code block.
 */
export function formatSingleResult(result: ToolResult): string {
  const status = result.ok ? "ok" : "error";
  const lines: string[] = [`@result ${result.id} ${result.tool} ${status}`];

  if (result.backupId) {
    lines.push(`backup: ${result.backupId}`);
  }

  const payload = result.ok ? (result.output || "(success with no output)") : (result.error || "Unknown error");
  lines.push(payload);

  return `\`\`\`\`webclaude-result\n${lines.join("\n")}\n\`\`\`\``;
}

/**
 * Formats multiple tool results into one combined markdown text block for injection into the composer.
 */
export function formatBatchResults(results: ToolResult[]): string {
  if (results.length === 0) return "";
  return results.map(formatSingleResult).join("\n\n");
}

/**
 * Formats duration in milliseconds to human-readable string.
 * Examples: 450 -> "450ms", 12400 -> "12.4s", 75000 -> "1分15秒"
 */
export function formatDuration(ms: number): string {
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${ms}ms`;
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) {
    return `${totalSeconds.toFixed(1)}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSecs = Math.round(totalSeconds % 60);
  return `${minutes}分${remainingSecs < 10 ? "0" : ""}${remainingSecs}秒`;
}
