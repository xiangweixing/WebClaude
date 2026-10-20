import fs from "node:fs";
import path from "node:path";
import { WorkspaceManager } from "../workspace.js";
import { BackupManager } from "../backup.js";
import { SearchReplaceEdit } from "@webclaude/protocol";

export class EditTools {
  constructor(
    private ws: WorkspaceManager,
    private backups: BackupManager
  ) {}

  private stripLineNumbers(text: string): string {
    return text
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\d+\s*[|:]\s?/, ""))
      .join("\n");
  }

  private applySingleEdit(
    currentText: string,
    rawSearch: string,
    rawReplace: string,
    isCRLF: boolean,
    chunkIndex: number,
    relPath: string
  ): string {
    const le = isCRLF ? "\r\n" : "\n";
    let search = isCRLF ? rawSearch.replace(/\r?\n/g, "\r\n") : rawSearch.replace(/\r\n/g, "\n");
    let replace = isCRLF ? rawReplace.replace(/\r?\n/g, "\r\n") : rawReplace.replace(/\r\n/g, "\n");

    // Stage 1: Exact match
    const firstIndex = currentText.indexOf(search);
    if (firstIndex !== -1) {
      const secondIndex = currentText.indexOf(search, firstIndex + 1);
      if (secondIndex !== -1) {
        throw new Error(
          `Edit chunk #${chunkIndex} SEARCH block matched multiple locations in '${relPath}'. Please provide more surrounding context lines to make it uniquely identifiable.`
        );
      }
      return currentText.slice(0, firstIndex) + replace + currentText.slice(firstIndex + search.length);
    }

    // Stage 2: Automatic line number stripping
    // (Claude often copies lines prefixed with "12 | " from read_file)
    const cleanedSearch = this.stripLineNumbers(search);
    const cleanedReplace = this.stripLineNumbers(replace);
    if (cleanedSearch !== search) {
      const s2Search = isCRLF ? cleanedSearch.replace(/\r?\n/g, "\r\n") : cleanedSearch.replace(/\r\n/g, "\n");
      const s2Replace = isCRLF ? cleanedReplace.replace(/\r?\n/g, "\r\n") : cleanedReplace.replace(/\r\n/g, "\n");
      const idx = currentText.indexOf(s2Search);
      if (idx !== -1) {
        const idx2 = currentText.indexOf(s2Search, idx + 1);
        if (idx2 !== -1) {
          throw new Error(
            `Edit chunk #${chunkIndex} SEARCH block (after stripping line numbers) matched multiple locations in '${relPath}'. Please provide more context.`
          );
        }
        return currentText.slice(0, idx) + s2Replace + currentText.slice(idx + s2Search.length);
      }
    }

    // Stage 3: Whitespace & blank line tolerance matching
    const searchTarget = cleanedSearch !== search ? cleanedSearch : search;
    const normCurrentLines = currentText.split(/\r?\n/).map((l) => l.trimEnd());
    const normSearchLines = searchTarget.split(/\r?\n/).map((l) => l.trimEnd());

    let sStart = 0;
    while (sStart < normSearchLines.length && normSearchLines[sStart] === "") sStart++;
    let sEnd = normSearchLines.length;
    while (sEnd > sStart && normSearchLines[sEnd - 1] === "") sEnd--;

    const trimmedSlice = normSearchLines.slice(sStart, sEnd);
    if (trimmedSlice.length > 0) {
      const matches: number[] = [];
      const origLines = currentText.split(/\r?\n/);

      for (let i = 0; i <= normCurrentLines.length - trimmedSlice.length; i++) {
        let matched = true;
        for (let j = 0; j < trimmedSlice.length; j++) {
          if (normCurrentLines[i + j] !== trimmedSlice[j]) {
            matched = false;
            break;
          }
        }
        if (matched) matches.push(i);
      }

      if (matches.length === 1) {
        const matchIdx = matches[0];
        const before = origLines.slice(0, matchIdx);
        const after = origLines.slice(matchIdx + trimmedSlice.length);
        const finalReplaceLines = (cleanedReplace !== replace ? cleanedReplace : replace)
          .replace(/\r\n/g, "\n")
          .split("\n");

        const combined = [...before, ...finalReplaceLines, ...after];
        return combined.join(le);
      } else if (matches.length > 1) {
        throw new Error(
          `Edit chunk #${chunkIndex} SEARCH block matched multiple locations in '${relPath}' after whitespace normalization. Please provide more surrounding context.`
        );
      }
    }

    // Detailed error snippet for Claude to debug easily
    const preview = search.length > 120 ? search.slice(0, 120) + "..." : search;
    const hasLineNums = cleanedSearch !== search;
    throw new Error(
      `Edit chunk #${chunkIndex} SEARCH block not found in '${relPath}'.${
        hasLineNums ? " (Detected and stripped line numbers, but target lines still could not be located)." : ""
      } Preview: '${preview.replace(/\n/g, "\\n")}'`
    );
  }

  public editFile(
    relPath: string,
    edits: SearchReplaceEdit[]
  ): { path: string; appliedEdits: number; backupId: string } {
    if (!relPath) throw new Error("path parameter is required.");
    if (!edits || !Array.isArray(edits) || edits.length === 0) {
      throw new Error("edits array must contain at least one { search, replace } chunk.");
    }

    const filePath = this.ws.safePath(relPath);
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${relPath}`);
    }

    const originalBuf = fs.readFileSync(filePath);
    let originalText = originalBuf.toString("utf8");

    // Detect line ending (CRLF vs LF)
    const isCRLF = originalText.includes("\r\n");

    // Backup before making any edits
    const backupId = this.backups.createBackup(filePath, "edit");

    let currentText = originalText;
    let count = 0;

    for (let i = 0; i < edits.length; i++) {
      const { search, replace } = edits[i];
      if (typeof search !== "string" || typeof replace !== "string") {
        throw new Error(`Edit chunk #${i + 1} must have string 'search' and 'replace' fields.`);
      }

      currentText = this.applySingleEdit(currentText, search, replace, isCRLF, i + 1, relPath);
      count++;
    }

    // Atomic write
    const tempFile = `${filePath}.webclaude-edit-tmp-${Date.now()}`;
    fs.writeFileSync(tempFile, Buffer.from(currentText, "utf8"));
    fs.renameSync(tempFile, filePath);

    return {
      path: relPath,
      appliedEdits: count,
      backupId,
    };
  }
}
