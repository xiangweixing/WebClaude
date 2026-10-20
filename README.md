# WebClaude

<p align="center">
  <strong>Local Workspace Code Agent for Claude Web via Browser Extension and Local Sandbox Service</strong><br>
  No Public IP / Tunnel Required · No Paid Official Connector Required · Pure Local Loopback · Cross-Platform (Windows & Linux)
</p>

<p align="center">
  English | <a href="README_ZH.md">简体中文</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Node.js-20%2B%20LTS-green?style=flat-square" alt="Node.js">
  <img src="https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge%20(MV3)-purple?style=flat-square" alt="Browser">
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" alt="License">
</p>

---

## Table of Contents

- [1. Background & Problem Statement](#1-background--problem-statement)
- [2. Key Features](#2-key-features)
- [3. Architecture & Implementation](#3-architecture--implementation)
  - [3.1 Overall Architecture & Data Flow](#31-overall-architecture--data-flow)
  - [3.2 Text-Based RPC Tool Protocol](#32-text-based-rpc-tool-protocol)
  - [3.3 Browser Extension Layer (`packages/extension`)](#33-browser-extension-layer-packagesextension)
  - [3.4 Local Core Service & Security Sandbox (`packages/core`)](#34-local-core-service--security-sandbox-packagescore)
  - [3.5 Desktop Client & Headless CLI](#35-desktop-client--headless-cli)
- [4. Security Model & Compliance](#4-security-model--compliance)
- [5. Installation & Getting Started](#5-installation--getting-started)
  - [5.1 Prerequisites](#51-prerequisites)
  - [5.2 Build from Source](#52-build-from-source)
  - [5.3 Start the Local Service](#53-start-the-local-service)
  - [5.4 Load the Browser Extension](#54-load-the-browser-extension)
  - [5.5 Pair and Start Coding on Claude.ai](#55-pair-and-start-coding-on-claudeai)
- [6. Supported Tool Protocol Reference](#6-supported-tool-protocol-reference)
- [7. Frequently Asked Questions (FAQ)](#7-frequently-asked-questions-faq)
- [License & Disclaimer](#license--disclaimer)

---

## 1. Background & Problem Statement

Many developers prefer discussing architecture and writing code directly inside the [Claude Web interface (`claude.ai`)](https://claude.ai), but encounter friction with existing workflows:

1. **Tedious & Error-Prone Copy-Pasting**: Providing context requires manually pasting multiple source files into the chat. When Claude suggests modifications, developers must manually locate files, track down line numbers, and paste changes, which is slow and interruptive.
2. **High Barriers for Official Custom Connectors**: Official Claude Custom Connectors rely on remote MCP over cloud infrastructure, requiring local machines to expose endpoints publicly via tunnels (e.g. Cloudflare Tunnel, ngrok) with complex OAuth 2.1 authentication. Furthermore, key features require Pro, Team, or Enterprise subscriptions.
3. **Account Risk with Autonomous Bots**: Fully automated headless scrapers or bot scripts that bombard user web accounts violate Anthropic's consumer Terms of Service (ToS) and carry ban risks.

**WebClaude** was created to solve these exact challenges: **A lightweight Chrome/Edge MV3 browser extension coupled with a local loopback server (`127.0.0.1`), enabling Claude Web to read, search, edit, verify, and revert local workspace code directly from the chat window. All communication remains closed-loop on your machine with zero public exposure, defaulting to a safe semi-automatic human-in-the-loop workflow.**

---

## 2. Key Features

- 📁 **Deep Workspace Awareness**
  - **Directory Tree (`directory_tree`)**: Generates an ASCII tree overview of the project, automatically excluding `node_modules`, `.git`, `dist`, and other irrelevant folders.
  - **Directory Listing (`list_directory`)**: Inspects files and subfolders within any relative subpath on demand.
  - **Workspace Metadata (`workspace_info`)**: Detects operating system, Git repository status, and approved command whitelists.
- 🔍 **Efficient Code Search & Inspection**
  - **Paged Line Reading (`read_file`)**: Reads specific line ranges (e.g., lines 1–100) with line numbers; rejects binary files and files larger than 1 MiB.
  - **Regex & Literal Search (`search`)**: Searches across workspace files for keywords or regex patterns, returning compact `file:line:content` matches to avoid excessive context consumption.
- ✏️ **Precise Code Editing with Safe Rollback**
  - **3-Stage Intelligent Matching Pipeline (`edit_file`)**: Uses diff syntax (`<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE`) with an adaptive matching engine: **Exact Match → Line Number Stripping → Whitespace & Blank Line Normalization**. Even if Claude accidentally copies line number prefixes (`12 | `) from `read_file` or wraps paths in quotes/slashes, edits match reliably and atomically without altering CRLF/LF line endings.
  - **Full File Creation & Overwrite (`write_file`)**: Creates new files or overwrites existing ones safely.
  - **Safe Path Manipulation (`delete_path` / `move_path`)**: Moves or deletes files safely within the workspace.
  - **Atomic Pre-Write Snapshots & One-Click Undo**: Any write or delete operation automatically creates a snapshot under `.webclaude-backups/`. Revert any change with a single click from the Desktop UI or the browser side panel!
- ⚡ **Controlled Command Execution & Git Workflow**
  - **Whitelisted Command Execution (`run_command`)**: Runs approved commands (`npm test`, `pytest`, `cargo check`, etc.) inside the project root. Explicitly executes with `shell: false` to prevent shell injection or command chaining attacks.
  - **Git Status & Diff Review (`git_status`, `git_diff`, `git_commit`)**: Reviews working tree/staged diffs and commits locally. **`git push` is strictly prohibited by design** so you always keep final control.
- 🔔 **Task Completion Notification & Duration Tracking**
  - **Stopwatch & Round Counter**: Automatically starts timing on the first tool invocation and computes the total duration when Claude outputs its final response.
  - **Modern Floating Toast Card**: Shows a clean notification in the top-right corner: `🎉 WebClaude Task Completed`, `⏱️ Total Duration: Xs/m`, `Completed N rounds · Executed M tools`.
  - **Subtle Audio Chime (Web Audio API)**: Synthesizes a soft two-tone chime natively without external audio assets (toggleable / mutable with one click).
- 🤝 **Semi-Automatic (Default Safe) & Full-Auto Modes**
  - **Semi-Automatic Mode (Recommended Default)**: After executing tools locally, the extension populates the formatted results into Claude's composer input. **You review the text and press Enter to send**. Complete control with zero copy-pasting, fully compliant with user interaction models.
  - **Full-Auto Mode (Opt-In)**: Once enabled in the side panel, the extension automatically triggers send after a 1.5-second cancellation delay, bounded by a 15-round safety circuit breaker.

---

## 3. Architecture & Implementation

### 3.1 Overall Architecture & Data Flow

WebClaude consists of three decoupled layers: **Protocol (`packages/protocol`)**, **Local Core & Sandbox (`packages/core`)**, and **Presentation (`packages/extension` & `packages/desktop` / `packages/cli`)**.

```
                       ┌────────────────────────────────────────────────────────┐
                       │               Browser: https://claude.ai               │
                       │                                                        │
                       │   User prompt: "@webclaude please fix the timeout"     │
                       │             │                                          │
                       │             ▼                                          │
                       │   [MentionHandler] Injects protocol instructions & tree│
                       │             │                                          │
                       │             ▼ (Sent to Claude cloud model)             │
                       │   [Claude Reply] Contains ````webclaude @call block    │
                       │             │                                          │
                       │             ▼ (Stream ends, 800ms DOM debounce)        │
                       │   [AgentLoop] Extracts call blocks & deduplicates      │
                       │             │                                          │
                       │             ▼ (chrome.runtime.sendMessage)             │
                       │   [Background SW] Dispatches HTTP POST request         │
                       └─────────────┬──────────────────────────────────────────┘
                                     │
                    127.0.0.1:43127  │ HTTP RPC (Authorization: Bearer <Token>)
                                     ▼
                       ┌────────────────────────────────────────────────────────┐
                       │            Local Server (WebClaude Desktop / CLI)      │
                       │                                                        │
                       │   [AuthManager] Validates 6-digit pair code & token    │
                       │   [WorkspaceManager] safePath traversal & secret check │
                       │   [BackupManager] Creates atomic snapshot in .backups  │
                       │   [ToolRegistry] Dispatches Fs/Edit/Search/Exec/Git    │
                       │   [EventBus] SSE broadcasts live logs to Desktop UI    │
                       └─────────────┬──────────────────────────────────────────┘
                                     │
                                     ▼ Returns JSON result
                       ┌────────────────────────────────────────────────────────┐
                       │   [AgentLoop] Formats into ````webclaude-result        │
                       │             │                                          │
                       │             ▼                                          │
                       │   [ClaudeDomAdapter] Inserts into chat input composer  │
                       │             │                                          │
                       │   ┌─────────┴─────────────────────┐                    │
                       │   ▼ (Default Semi-Auto)           ▼ (Optional Auto-Send│
                       │ User reviews & presses Enter      Auto-sends in 1.5s   │
                       └────────────────────────────────────────────────────────┘
```

### 3.2 Text-Based RPC Tool Protocol

Because Claude Web does not expose direct function calling APIs to third-party clients, WebClaude uses a **robust text-based protocol inside fenced Markdown blocks**:

1. **Quadruple Backticks (````)**: Standard Markdown uses triple backticks (```). To prevent nested source code from prematurely closing code blocks, WebClaude uses quadruple backticks ````webclaude as outer fences.
2. **Structured Header**: Starts with `@call <id> <tool_name>`, followed by key-value pairs `param: value`.
3. **Payload Blocks**:
   - For `edit_file`: uses `<<<<<<< SEARCH`, `=======`, and `>>>>>>> REPLACE`.
   - For `write_file`: uses `<<<<<<< CONTENT` and `>>>>>>> END`.
4. **Result Format**: The extension feeds results back using ````webclaude-result blocks with `@result <id> <tool_name> ok/error` and backup identifiers.

### 3.3 Browser Extension Layer (`packages/extension`)

- **DOM Adapter (`ClaudeDomAdapter`)**: Centralizes DOM selectors for `claude.ai` (ProseMirror composer, send button, streaming stop button, message list) and includes a built-in `selfTest()` diagnostic. When Claude updates its UI, only selectors in this single file require updating.
- **Mention Autocomplete (`MentionHandler`)**: Listens to input events; typing `@` displays a floating menu for `@webclaude`. Upon sending, it fetches project tree metadata from the local service and injects tool instructions seamlessly.
- **Agent Loop Controller (`AgentLoop`)**: Observes DOM streaming state with `MutationObserver`. Once streaming finishes and settles (800ms debounce), it extracts tool blocks, deduplicates calls using session hashes, and triggers execution.
- **Risk Approval Modal (`ApprovalModal`)**: When high-risk tools are requested (`run_command`, `git_commit`), a modal appears in the middle of the Claude window with command details, requiring explicit approval before execution.

### 3.4 Local Core Service & Security Sandbox (`packages/core`)

- **Strict Path Sandbox (`WorkspaceManager.safePath`)**:
  - Rejects absolute paths (`C:\Windows`, `/etc/`), drive letters, and UNC paths.
  - Normalizes relative paths and verifies `path.relative`. Any path escaping the workspace root via `..` throws an immediate exception.
  - Recursively verifies each path segment to disallow Symlinks and Windows Junctions.
  - Blocks sensitive patterns such as `.env*`, `id_rsa*`, `*.pem`, `*.key`.
- **Pre-Write Snapshots & Atomic Writes (`BackupManager`)**:
  - Before modifying or deleting files, backups are stored under `.webclaude-backups/<id>/` with metadata.
  - Writes are atomic: content is written to a temporary file first, then swapped using `fs.renameSync` to prevent corruption.
- **Shell-Less Process Spawning (`ExecTools`)**:
  - Commands are limited to an approved whitelist (`git`, `node`, `npm`, `npx`, `python`, `cargo`, `go`, etc.).
  - Spawned using `child_process.spawn` with **`shell: false` explicitly enforced**, neutralizing shell injection attempts via `|`, `&&`, `;`, or `>`.
- **Dynamic Pairing Authentication (`AuthManager`)**:
  - Generates a random 6-digit pairing code valid for 5 minutes, with brute-force protection (locked for 10 minutes after 5 consecutive failed attempts).
  - Issues a 64-character bearer token upon successful pairing.

### 3.5 Desktop Client & Headless CLI

- **Desktop App (Electron)**: Built with a modern dark theme and glassmorphism styling. Features a native folder picker, pairing code countdown, real-time SSE activity feed, and an **Undo** button for every historical file edit.
- **Headless CLI**: A single bundled executable for headless Linux environments or remote servers via `webclaude serve -w <path>`, fully accessible over SSH port forwarding (`ssh -L 43127:127.0.0.1:43127`).

---

## 4. Security Model & Compliance

| Security Dimension | Official Remote MCP / Tunnel | Traditional Scrapers / Bots | WebClaude Solution |
|---|---|---|---|
| **Network Exposure** | Requires public HTTPS endpoint | Third-party cloud relays | **Listens on `127.0.0.1` only, zero public exposure** |
| **Data Privacy** | Code passes through third-party tunnels | Account cookies/tokens exposed | **Direct browser-to-localhost communication, zero third parties** |
| **Terms of Service (ToS)** | Compliant (Official Connector) | High ban risk (unattended bot scripts) | **Semi-automatic default (human reviews and presses Enter)** |
| **Destructive Edits** | Relies on model accuracy, no rollback | Direct overwrites with data loss | **Pre-write atomic snapshots, instant one-click Undo** |
| **Command Execution** | Often requires open shell access | Dangerous shell injection risk | **Strict command whitelist + `shell: false` + approval modal** |

---

## 5. Installation & Getting Started

### 5.1 Prerequisites

- **OS**: Windows 10/11 or Linux (Ubuntu, Debian, Fedora, Arch, etc.)
- **Node.js**: Node.js 20+ LTS (tested on Node.js v22)
- **Browser**: Google Chrome or Microsoft Edge

### 5.2 Build from Source

Clone the repository and install dependencies:

```bash
# Install dependencies
npm install

# Run automated test suite (20 unit and integration tests)
npm test

# Build extension, desktop app, and CLI
npm run build
```

Build outputs will be generated in:
- Browser extension: `packages/extension/dist/`
- Desktop client: `packages/desktop/dist/`
- CLI tool: `packages/cli/dist/index.js`

### 5.3 Start the Local Service

You can choose either the Desktop GUI or the Headless CLI:

#### Option 1: Desktop Client (Recommended)
```bash
npm run desktop
```
1. Click **Browse...** to select your local project folder.
2. Verify the port (default `43127`) and click **Start Service**.
3. Status changes to **Running** and displays a **6-digit pairing code**.

#### Option 2: Headless CLI
```bash
# Serve current directory
npm run cli

# Or specify custom workspace and port
npm run cli -- -w D:\Workspace\my-web-project -p 43127
```

### 5.4 Load the Browser Extension

1. Open Chrome or Edge and navigate to:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the **`packages/extension/dist`** folder in this repository.

### 5.5 Pair and Start Coding on Claude.ai

1. Open [https://claude.ai](https://claude.ai) and open or refresh any chat.
2. Look for the floating **WebClaude** button in the bottom-right corner.
3. Click the floating button, enter the **6-digit pairing code** from your Desktop app or CLI, and click **Pair**.
4. Type `@` in the chat input to see the `@webclaude` autocomplete menu, and press Enter or Tab.
5. Enter your instruction and send:
   ```text
   @webclaude Check the project tree, update version to 0.3.0 in package.json, add release notes to README.md, and show git diff
   ```
6. **Experience the Human-in-the-Loop Workflow**:
   - Claude analyzes the request and outputs a tool call block.
   - WebClaude executes the tool locally and populates results into the input box.
   - Status indicates: `✅ Round #1 complete. Results inserted into input. Press Enter to send.`
   - Review the output and press **Enter** to continue to the next round until the task finishes!
7. **One-Click Undo**:
   - If you want to revert changes, click **Undo** next to any log item in the Desktop window or the side panel.

---

## 6. Supported Tool Protocol Reference

Claude triggers tools using the following formats:

### 1. `workspace_info` (Workspace Metadata)
````webclaude
@call 1 workspace_info
````

### 2. `list_directory` (List Files)
````webclaude
@call 2 list_directory
path: src/components
````

### 3. `directory_tree` (ASCII Tree Overview)
````webclaude
@call 3 directory_tree
path: .
max_depth: 3
````

### 4. `read_file` (Read File with Line Numbers)
````webclaude
@call 4 read_file
path: src/index.ts
start_line: 1
end_line: 80
````

### 5. `search` (Keyword or Regex Search)
````webclaude
@call 5 search
query: handleLogin
path: src
regex: false
````

### 6. `edit_file` (Precise Search/Replace - Recommended)
````webclaude
@call 6 edit_file
path: src/config.ts
<<<<<<< SEARCH
export const TIMEOUT = 1000;
=======
export const TIMEOUT = 5000;
>>>>>>> REPLACE
````

### 7. `write_file` (Write/Overwrite File)
````webclaude
@call 7 write_file
path: src/types.ts
<<<<<<< CONTENT
export interface UserProfile {
  id: string;
  name: string;
}
>>>>>>> END
````

### 8. `run_command` (Run Approved Command - Triggers UI Approval)
````webclaude
@call 8 run_command
command: npm
args: test
timeout: 60
````

### 9. `git_status` / `git_diff` / `git_commit` (Git Workflow)
````webclaude
@call 9 git_diff
path: src/config.ts
staged: false
````

---

## 7. Frequently Asked Questions (FAQ)

### Q1: The extension floating button shows a red dot and says "Disconnected"?
- Ensure the local service is running via `npm run desktop` or `npm run cli`.
- Verify the local port matches `43127` in both the service and extension settings.
- Click **Self-Test** in the side panel to check detailed connectivity.

### Q2: Pairing fails or says "Pairing code expired"?
- The 6-digit pairing code expires after **5 minutes**. Click the refresh icon (↻) in the Desktop app to generate a fresh code.
- 5 consecutive failed attempts trigger a 10-minute brute-force lockout. Wait for the countdown to expire before retrying.

### Q3: Claude.ai updated its UI and the extension cannot find the input box?
- Click the floating button and run **Self-Test**. The diagnostic will show whether `Composer Input` or `Send Button` were successfully resolved.
- DOM selectors are cleanly isolated in `packages/extension/src/content/claude-dom.ts`. Simply update class names or attributes in this file and run `npm run build:extension`.

### Q4: Can WebClaude push commits to remote Git repositories?
- No. For safety, WebClaude supports `git_status`, `git_diff`, and local `git_commit`, but **strictly disallows `git push`**. Pushing to remote repositories must always be performed manually in your terminal.

### Q5: Why does `edit_file` occasionally report "SEARCH block not found"?
- This commonly happens when Claude copies line number prefixes (`12 | `) from `read_file` into the `SEARCH` block, or adds trailing spaces/newlines.
- WebClaude includes a **3-stage matching pipeline** (Exact Match → Strip Line Numbers → Whitespace Normalization) that automatically resolves almost all such issues.
- In rare edge cases, simply reply to Claude: *"Please provide a clean SEARCH block with 2-3 lines of context without line numbers."*

---

## License & Disclaimer

Distributed under the [MIT License](LICENSE). Contributions, issues, and feature suggestions are welcome!

> ⚠️ **Disclaimer**: WebClaude is an independent open-source project and is not affiliated with, endorsed by, or sponsored by Anthropic. Ensure your usage complies with applicable terms of service. Use at your own discretion.
