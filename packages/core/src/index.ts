import { WorkspaceManager } from "./workspace.js";
import { BackupManager } from "./backup.js";
import { FsTools, EditTools, SearchTools, ExecTools, GitTools } from "./tools/index.js";
import { ToolRegistry } from "./registry.js";
import { WebClaudeServer, ServerOptions } from "./server.js";

export * from "./workspace.js";
export * from "./backup.js";
export * from "./tools/index.js";
export * from "./registry.js";
export * from "./auth.js";
export * from "./events.js";
export * from "./server.js";

export const DEFAULT_ALLOWED_COMMANDS = [
  "git",
  "node",
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "python",
  "python3",
  "pip",
  "pytest",
  "go",
  "cargo",
  "dotnet",
  "tsc",
  "make",
];

export function createWebClaudeCore(options: ServerOptions = {}) {
  const allowedCommands = options.allowedCommands || DEFAULT_ALLOWED_COMMANDS;
  const ws = new WorkspaceManager(options.workspaceDir);
  const backups = new BackupManager(() => ws.root);

  const fsTools = new FsTools(ws, backups, allowedCommands);
  const editTools = new EditTools(ws, backups);
  const searchTools = new SearchTools(ws);
  const execTools = new ExecTools(ws, allowedCommands);
  const gitTools = new GitTools(execTools);

  const registry = new ToolRegistry(fsTools, editTools, searchTools, execTools, gitTools);

  const server = new WebClaudeServer(
    {
      port: options.port || 43127,
      host: options.host || "127.0.0.1",
      workspaceDir: options.workspaceDir,
      allowedCommands,
    },
    registry
  );

  return {
    ws,
    backups,
    registry,
    server,
  };
}
