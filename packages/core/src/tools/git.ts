import { ExecTools } from "./exec.js";

export class GitTools {
  constructor(private execTools: ExecTools) {}

  public async status(): Promise<string> {
    const res = await this.execTools.runCommand("git", ["status", "--porcelain=v1", "-b"]);
    if (res.exitCode !== 0) {
      throw new Error(`git status failed: ${res.stderr || res.stdout}`);
    }
    return res.stdout || "Working directory clean.";
  }

  public async diff(path = "", staged = false): Promise<string> {
    const args = ["diff"];
    if (staged) args.push("--staged");
    if (path) {
      args.push("--", path);
    }

    const res = await this.execTools.runCommand("git", args);
    if (res.exitCode !== 0) {
      throw new Error(`git diff failed: ${res.stderr || res.stdout}`);
    }
    return res.stdout || "(no changes)";
  }

  public async commit(message: string, paths: string[] | string = []): Promise<string> {
    if (!message || typeof message !== "string") {
      throw new Error("message parameter is required for git_commit.");
    }

    const pathList = Array.isArray(paths) ? paths : paths ? [paths] : [];
    const addArgs = ["add"];
    if (pathList.length > 0) {
      addArgs.push(...pathList);
    } else {
      addArgs.push(".");
    }

    const addRes = await this.execTools.runCommand("git", addArgs);
    if (addRes.exitCode !== 0) {
      throw new Error(`git add failed: ${addRes.stderr || addRes.stdout}`);
    }

    const commitRes = await this.execTools.runCommand("git", ["commit", "-m", message]);
    if (commitRes.exitCode !== 0) {
      throw new Error(`git commit failed: ${commitRes.stderr || commitRes.stdout}`);
    }

    return commitRes.stdout;
  }
}
