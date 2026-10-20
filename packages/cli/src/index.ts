#!/usr/bin/env node
import path from "node:path";
import { createWebClaudeCore } from "@webclaude/core";

function printHelp() {
  console.log(`
WebClaude CLI - Local Agent Service for Claude Web

Usage:
  webclaude serve [options]

Options:
  -w, --workspace <path>   Workspace directory to serve (default: current directory)
  -p, --port <port>         Port to listen on (default: 43127)
  -h, --help               Show this help message
`);
}

async function main() {
  const args = process.argv.slice(2);
  let workspaceDir = process.cwd();
  let port = 43127;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "-h" || arg === "--help") {
      printHelp();
      process.exit(0);
    } else if (arg === "-w" || arg === "--workspace") {
      workspaceDir = args[++i];
    } else if (arg === "-p" || arg === "--port") {
      port = parseInt(args[++i], 10);
    } else if (arg === "serve") {
      // standard command verb, ignore
    }
  }

  const resolvedDir = path.resolve(workspaceDir);

  try {
    const { server, ws } = createWebClaudeCore({
      port,
      workspaceDir: resolvedDir,
    });

    await server.start();
    const pairing = server.auth.getPairingInfo();

    console.log(`
=====================================================
  WebClaude Local Service Started
=====================================================
  • Host:         http://${server.host}:${server.port}
  • Workspace:    ${ws.root}
  • Pairing Code: ${pairing.code} (valid for 5 minutes)
=====================================================
Enter this 6-digit code in the Chrome/Edge extension to pair.
Press Ctrl+C to stop.
`);

    // Stream logs to console
    server.events.on("log", (log) => {
      const statusIcon = log.ok ? "✓" : "✗";
      const dur = `${log.durationMs}ms`;
      console.log(`[${log.timestamp.slice(11, 19)}] ${statusIcon} ${log.tool.padEnd(16)} (${dur})`);
      if (log.backupId) {
        console.log(`    ↳ Backup: ${log.backupId}`);
      }
      if (!log.ok && log.error) {
        console.log(`    ↳ Error: ${log.error}`);
      }
    });

    const cleanup = async () => {
      console.log("\nShutting down WebClaude service...");
      await server.stop();
      process.exit(0);
    };

    process.on("SIGINT", cleanup);
    process.on("SIGTERM", cleanup);
  } catch (err: any) {
    console.error(`Error starting WebClaude: ${err.message}`);
    process.exit(1);
  }
}

main();
