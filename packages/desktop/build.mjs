import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "../..");
const distDir = path.join(__dirname, "dist");
const rendererDist = path.join(distDir, "renderer");

if (!fs.existsSync(rendererDist)) {
  fs.mkdirSync(rendererDist, { recursive: true });
}

console.log("Building WebClaude Desktop...");

// Bundle main.ts (esm/cjs for Electron main)
execSync(
  `npx --yes esbuild "${path.join(__dirname, "src", "main.ts")}" --outfile="${path.join(distDir, "main.js")}" --bundle --platform=node --format=esm --external:electron "--alias:@webclaude/core=${path.join(rootDir, "packages", "core", "src", "index.ts")}" "--alias:@webclaude/protocol=${path.join(rootDir, "packages", "protocol", "src", "index.ts")}"`,
  { cwd: rootDir, stdio: "inherit" }
);

// Bundle preload.ts
execSync(
  `npx --yes esbuild "${path.join(__dirname, "src", "preload.ts")}" --outfile="${path.join(distDir, "preload.js")}" --bundle --platform=node --format=cjs --external:electron`,
  { cwd: rootDir, stdio: "inherit" }
);

// Bundle renderer app.ts
execSync(
  `npx --yes esbuild "${path.join(__dirname, "src", "renderer", "app.ts")}" --outfile="${path.join(rendererDist, "app.js")}" --bundle --format=iife --target=es2022`,
  { cwd: rootDir, stdio: "inherit" }
);

// Copy index.html and styles.css
fs.copyFileSync(
  path.join(__dirname, "src", "renderer", "index.html"),
  path.join(rendererDist, "index.html")
);
fs.copyFileSync(
  path.join(__dirname, "src", "renderer", "styles.css"),
  path.join(rendererDist, "styles.css")
);

console.log("WebClaude Desktop successfully built to packages/desktop/dist!");
