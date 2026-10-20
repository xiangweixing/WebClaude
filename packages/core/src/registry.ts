import { FsTools } from "./tools/fs.js";
import { EditTools } from "./tools/edit.js";
import { SearchTools } from "./tools/search.js";
import { ExecTools } from "./tools/exec.js";
import { GitTools } from "./tools/git.js";

export type ToolRisk = "read" | "write" | "execute";

export interface ToolDefinition {
  name: string;
  description: string;
  risk: ToolRisk;
  handler: (args: Record<string, any>) => Promise<any> | any;
}

export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  constructor(
    private fsTools: FsTools,
    private editTools: EditTools,
    private searchTools: SearchTools,
    private execTools: ExecTools,
    private gitTools: GitTools
  ) {
    this.registerDefaults();
  }

  private registerDefaults() {
    this.register({
      name: "workspace_info",
      description: "Get current workspace information, platform, and allowed commands",
      risk: "read",
      handler: () => this.fsTools.workspaceInfo(),
    });

    this.register({
      name: "list_directory",
      description: "List directory contents (excludes ignored folders)",
      risk: "read",
      handler: (args) => this.fsTools.listDirectory(args.path || ""),
    });

    this.register({
      name: "directory_tree",
      description: "Get ASCII directory tree overview",
      risk: "read",
      handler: (args) => this.fsTools.directoryTree(args.path || "", args.max_depth || 5),
    });

    this.register({
      name: "read_file",
      description: "Read file lines with numbering",
      risk: "read",
      handler: (args) =>
        this.fsTools.readFile(
          args.path,
          args.start_line ? parseInt(args.start_line, 10) : undefined,
          args.end_line ? parseInt(args.end_line, 10) : undefined
        ),
    });

    this.register({
      name: "search",
      description: "Search workspace files for regex or text string",
      risk: "read",
      handler: (args) =>
        this.searchTools.search(
          args.query,
          args.path || "",
          args.regex === true || args.regex === "true",
          args.max_results ? parseInt(args.max_results, 10) : 100
        ),
    });

    this.register({
      name: "edit_file",
      description: "Apply atomic search/replace edits with automatic backup",
      risk: "write",
      handler: (args) => this.editTools.editFile(args.path, args.edits || []),
    });

    this.register({
      name: "write_file",
      description: "Create or overwrite a file with automatic backup",
      risk: "write",
      handler: (args) => this.fsTools.writeFile(args.path, args.content || ""),
    });

    this.register({
      name: "create_directory",
      description: "Create directory recursively",
      risk: "write",
      handler: (args) => this.fsTools.createDirectory(args.path),
    });

    this.register({
      name: "move_path",
      description: "Rename or move a file or directory",
      risk: "write",
      handler: (args) => this.fsTools.movePath(args.from, args.to),
    });

    this.register({
      name: "delete_path",
      description: "Delete file or directory with automatic backup",
      risk: "write",
      handler: (args) => this.fsTools.deletePath(args.path),
    });

    this.register({
      name: "run_command",
      description: "Run an approved command within workspace",
      risk: "execute",
      handler: (args) =>
        this.execTools.runCommand(
          args.command,
          Array.isArray(args.args)
            ? args.args
            : typeof args.args === "string"
              ? args.args.split(/\s+/)
              : [],
          args.timeout ? parseInt(args.timeout, 10) : 120
        ),
    });

    this.register({
      name: "git_status",
      description: "Get git status in porcelain format",
      risk: "read",
      handler: () => this.gitTools.status(),
    });

    this.register({
      name: "git_diff",
      description: "Get git diff for workspace or specific path",
      risk: "read",
      handler: (args) =>
        this.gitTools.diff(args.path || "", args.staged === true || args.staged === "true"),
    });

    this.register({
      name: "git_commit",
      description: "Stage changes and commit with message",
      risk: "execute",
      handler: (args) => this.gitTools.commit(args.message, args.paths),
    });
  }

  public register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  public get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  public getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  public async execute(name: string, args: Record<string, any>): Promise<any> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: '${name}'. Check spelling and available tools.`);
    }
    return await tool.handler(args);
  }
}
