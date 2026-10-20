import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const distDir = path.join(__dirname, "dist");

if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

console.log("Building WebClaude extension...");

// Build background service worker (esm)
execSync(
  `npx --yes esbuild "${path.join(__dirname, "src", "background.ts")}" --outfile="${path.join(distDir, "background.js")}" --bundle --format=esm --target=es2022`,
  { cwd: rootDir, stdio: "inherit" }
);

// Build content script (iife)
execSync(
  `npx --yes esbuild "${path.join(__dirname, "src", "content", "index.ts")}" --outfile="${path.join(distDir, "content.js")}" --bundle --format=iife --target=es2022 "--alias:@webclaude/protocol=${path.join(rootDir, "packages", "protocol", "src", "index.ts")}"`,
  { cwd: rootDir, stdio: "inherit" }
);

// Copy manifest.json
fs.copyFileSync(path.join(__dirname, "manifest.json"), path.join(distDir, "manifest.json"));

console.log("WebClaude extension successfully built to packages/extension/dist!");
