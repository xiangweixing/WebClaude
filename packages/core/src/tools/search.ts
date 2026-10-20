import fs from "node:fs";
import path from "node:path";
import { WorkspaceManager, DEFAULT_IGNORED_DIRS } from "../workspace.js";

export interface SearchMatch {
  file: string;
  line: number;
  content: string;
}

export class SearchTools {
  constructor(private ws: WorkspaceManager) {}

  public search(
    query: string,
    relSubPath = "",
    isRegex = false,
    maxResults = 100
  ): { query: string; totalMatches: number; matches: SearchMatch[] } {
    if (!query) throw new Error("query parameter is required.");

    const targetDir = this.ws.safePath(relSubPath);
    let matcher: RegExp;

    try {
      matcher = isRegex ? new RegExp(query, "i") : new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    } catch (e: any) {
      throw new Error(`Invalid regex query: ${e.message}`);
    }

    const matches: SearchMatch[] = [];

    const searchDir = (dir: string) => {
      if (matches.length >= maxResults) return;

      let entries: fs.Dirent[] = [];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }

      for (const entry of entries) {
        if (matches.length >= maxResults) break;
        if (DEFAULT_IGNORED_DIRS.includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          try {
            if (fs.lstatSync(fullPath).isSymbolicLink()) continue;
          } catch {
            continue;
          }
          searchDir(fullPath);
        } else if (entry.isFile()) {
          // Skip large files (> 512KB) and known binary extensions
          const ext = path.extname(entry.name).toLowerCase();
          if ([".png", ".jpg", ".jpeg", ".gif", ".ico", ".pdf", ".zip", ".tar", ".gz", ".exe", ".dll", ".node"].includes(ext)) {
            continue;
          }

          try {
            const stat = fs.statSync(fullPath);
            if (stat.size > 512 * 1024) continue;

            const buf = fs.readFileSync(fullPath);
            if (buf.subarray(0, 1024).includes(0)) continue; // binary check

            const lines = buf.toString("utf8").split(/\r?\n/);
            const relFile = this.ws.toRelative(fullPath);

            for (let i = 0; i < lines.length; i++) {
              if (matcher.test(lines[i])) {
                matches.push({
                  file: relFile,
                  line: i + 1,
                  content: lines[i].trim().slice(0, 200),
                });
                if (matches.length >= maxResults) break;
              }
            }
          } catch {}
        }
      }
    };

    searchDir(targetDir);

    return {
      query,
      totalMatches: matches.length,
      matches,
    };
  }
}
