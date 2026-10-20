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

console.log("Building WebClaude CLI...");

execSync(
  `npx --yes esbuild "${path.join(__dirname, "src", "index.ts")}" --outfile="${path.join(distDir, "index.js")}" --bundle --platform=node --format=esm --target=node20 "--alias:@webclaude/core=${path.join(rootDir, "packages", "core", "src", "index.ts")}" "--alias:@webclaude/protocol=${path.join(rootDir, "packages", "protocol", "src", "index.ts")}"`,
  { cwd: rootDir, stdio: "inherit" }
);

console.log("WebClaude CLI successfully built to packages/cli/dist/index.js!");
