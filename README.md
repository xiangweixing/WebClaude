# WebClaude

<p align="center">
  <strong>基于浏览器扩展与本地服务的 Claude Web 智能代码修改工具</strong><br>
  无需公网暴露 · 无需官方付费 Connector · 纯本地沙箱回环 · 支持 Windows 与 Linux
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20Linux-blue?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/Node.js-20%2B%20LTS-green?style=flat-square" alt="Node.js">
  <img src="https://img.shields.io/badge/Browser-Chrome%20%7C%20Edge%20(MV3)-purple?style=flat-square" alt="Browser">
  <img src="https://img.shields.io/badge/License-MIT-orange?style=flat-square" alt="License">
</p>

---

## 目录

- [一、 背景与解决的痛点](#一-背景与解决的痛点)
- [二、 核心功能介绍](#二-核心功能介绍)
- [三、 技术架构与实现原理](#三-技术架构与实现原理)
  - [3.1 总体架构与数据流向](#31-总体架构与数据流向)
  - [3.2 文本化 RPC 工具协议设计](#32-文本化-rpc-工具协议设计)
  - [3.3 浏览器扩展层 (Extension)](#33-浏览器扩展层-extension)
  - [3.4 本地核心服务与安全沙箱 (Core)](#34-本地核心服务与安全沙箱-core)
  - [3.5 桌面客户端与无头 CLI](#35-桌面客户端与无头-cli)
- [四、 安全模型与合规考量](#四-安全模型与合规考量)
- [五、 安装与使用指南](#五-安装与使用指南)
  - [5.1 环境要求](#51-环境要求)
  - [5.2 编译构建](#52-编译构建)
  - [5.3 启动本地服务](#53-启动本地服务)
  - [5.4 加载浏览器扩展](#54-加载浏览器扩展)
  - [5.5 在 Claude 网页端配对并开始工作](#55-在-claude-网页端配对并开始工作)
- [六、 支持的工具协议规范](#六-支持的工具协议规范)
- [七、 常见问题与排查指南 (FAQ)](#七-常见问题与排查指南-faq)

---

## 一、 背景与解决的痛点

很多开发者倾向在 [Claude 网页版 (`claude.ai`)](https://claude.ai) 中探讨架构与编写代码，但常常面临以下痛点：

1. **手动复制粘贴低效且易错**：分析项目时需要手动把多个源文件贴进输入框；Claude 给出修改后，又要手动找到对应文件、定位行数、复制替换，极为耗时。
2. **官方 Custom Connector 的门槛高**：Claude 官方的自定义 Connector 基于云端远程 MCP 协议，要求本地机器必须通过隧道（如 Cloudflare Tunnel / ngrok）将服务暴露在公网，并配置复杂的 OAuth 2.1 鉴权；且部分高级功能依赖 Pro/Team/Enterprise 付费计划。
3. **全自动脚本有封号风险**：Anthropic 消费者服务条款（ToS）严格禁止使用自动化机器人或脚本轰炸个人账户网页版。

**WebClaude** 专为解决上述痛点而生：**通过轻量级 Chrome/Edge 扩展与本地回环服务，在 Claude 网页聊天框内直接实现对本地代码的“读、搜、改、验、退”。所有通信都在本机 `127.0.0.1` 闭环，无需公网开放，默认采用“半自动人机协同”模式，安全可靠且符合合规要求。**

---

## 二、 核心功能介绍

- 📁 **本地工作区深度感知**
  - **目录树概览 (`directory_tree`)**：自动递归生成直观的 ASCII 项目文件树，自动忽略 `node_modules`、`.git`、`dist` 等无关目录。
  - **目录浏览 (`list_directory`)**：随时下钻查询指定子目录下的文件与文件夹。
  - **项目元数据 (`workspace_info`)**：输出操作系统环境、Git 状态及命令执行白名单。
- 🔍 **高效代码定位与阅读**
  - **按行切片读取 (`read_file`)**：支持限定行号区间（如 1~100 行），自动带行号展示；拒绝二进制与超大文件（限制 1 MiB）。
  - **全文与正则检索 (`search`)**：在工作区代码库中检索关键词或正则表达式，精准返回 `文件:行号:匹配内容`，避免盲目全量读取。
- ✏️ **精准代码修改与无损回滚**
  - **三重智能匹配流水线 (`edit_file`)**：采用标准 diff 标记语法，内置**精确匹配 → 自动剔除行号前缀匹配 → 空白与空行容差匹配**的三重匹配引擎。即使 Claude 将 `read_file` 返回的行号前缀（如 `12 | `）误复制进 `SEARCH` 块、或者路径带有引号/前导斜杠，系统均能智能修正并精准定位修改！
  - **全量创建与覆盖 (`write_file`)**：支持创建全新文件或整文件覆盖。
  - **安全删除与重命名 (`delete_path` / `move_path`)**：支持在工作区内部移动或安全删除。
  - **写前强制自动备份与一键撤销 (Undo)**：任何写操作执行前，均自动在 `.webclaude-backups/` 下保存快照。无论是在桌面客户端还是在浏览器侧边面板，随时可对任意修改一键恢复！
- ⚡ **安全命令执行与 Git 工作流**
  - **受控命令执行 (`run_command`)**：支持在项目目录执行白名单命令（如 `npm test`, `pytest`, `cargo check` 等）。执行时显式设定 `shell: false`，杜绝任何 Shell 注入和命令串联攻击。
  - **Git 状态与差异审查 (`git_status`, `git_diff`, `git_commit`)**：支持审查暂存区/工作区 diff，并支持本地提交（严禁 push，确保控制权在人）。
- 🔔 **任务完成提醒与耗时统计 (Task Completion Notification)**
  - **秒表自动计时与轮数汇总**：在收到首个工具调用时自动启动计时，在 Claude 完成修改输出最终说明后自动结算总耗时。
  - **现代 Toast 浮动卡片**：在网页右上角弹出精致通知，展示：`🎉 WebClaude 任务已完成`、`⏱️ 总耗时：X秒/分`、`共完成 N 轮交互 · 累计执行 M 次工具操作`。
  - **柔和提示音（Web Audio API）**：无需额外音频资源文件，纯原生合成微小柔和的双音阶“叮咚”声（支持随时一键开启/静音），切屏时也能及时知晓任务完成。
- 🤝 **半自动（默认安全）与全自动双模式**
  - **半自动协同（默认推荐）**：扩展在本地执行完工具后，将结果自动格式化回填至 Claude 输入框，**由用户检查无误后按 Enter 键发送**。每一步都在人工掌控下，既省去复制粘贴，又完全规避自动化风控。
  - **全自动多轮执行（可选开启）**：在面板中开启“自动发送”后，扩展将在 1.5 秒取消窗口后自动点击发送，并受 15 轮安全熔断上限保护。

---

## 三、 技术架构与实现原理

### 3.1 总体架构与数据流向

整个系统分为三大模块：**协议层 (`packages/protocol`)**、**本地核心层 (`packages/core`)**、**前端呈现层 (`packages/extension` & `packages/desktop` / `packages/cli`)**。

```
                       ┌────────────────────────────────────────────────────────┐
                       │               浏览器: https://claude.ai                │
                       │                                                        │
                       │   用户输入: "@webclaude 帮我把登录超时改为 5s"           │
                       │             │                                          │
                       │             ▼                                          │
                       │   [MentionHandler] 拦截并注入工具协议与项目树             │
                       │             │                                          │
                       │             ▼ (发往 Claude 云端模型)                     │
                       │   [Claude 回复] 包含 ````webclaude @call 代码块         │
                       │             │                                          │
                       │             ▼ (流式结束, 800ms 防抖稳定)                 │
                       │   [AgentLoop] 提取调用块并去重                           │
                       │             │                                          │
                       │             ▼ (chrome.runtime.sendMessage)             │
                       │   [Background SW] 发起 HTTP POST 请求                   │
                       └─────────────┬──────────────────────────────────────────┘
                                     │
                    127.0.0.1:43127  │ HTTP RPC (Authorization: Bearer <Token>)
                                     ▼
                       ┌────────────────────────────────────────────────────────┐
                       │            本地服务 (WebClaude Desktop / CLI)          │
                       │                                                        │
                       │   [AuthManager] 校验 6 位动态配对码与 Token            │
                       │   [WorkspaceManager] safePath 路径穿透/敏感文件拦截     │
                       │   [BackupManager] 写前创建快照 (.webclaude-backups)     │
                       │   [ToolRegistry] 调度 Fs / Edit / Search / Exec / Git  │
                       │   [EventBus] SSE 实时广播活动日志给桌面端              │
                       └─────────────┬──────────────────────────────────────────┘
                                     │
                                     ▼ 返回 JSON 结果
                       ┌────────────────────────────────────────────────────────┐
                       │   [AgentLoop] 格式化为 ````webclaude-result            │
                       │             │                                          │
                       │             ▼                                          │
                       │   [ClaudeDomAdapter] 填入页面输入框 (Composer)         │
                       │             │                                          │
                       │   ┌─────────┴─────────────────────┐                    │
                       │   ▼ (默认半自动)                  ▼ (可选全自动)        │
                       │ 等待用户人工按 Enter 键           1.5s 倒计时后自动发送 │
                       └────────────────────────────────────────────────────────┘
```

### 3.2 文本化 RPC 工具协议设计

由于 Claude 网页端未对第三方开放底层模型函数调用（Function Calling）接口，WebClaude 设计了一套**鲁棒的 Markdown 围栏代码块文本协议**：

1. **四反引号（````）围栏**：
   常规代码中使用三反引号（```），为避免代码内容截断代码块，WebClaude 强制采用四反引号 ````webclaude 作为外层围栏。
2. **结构化调用声明**：
   首行声明 `@call <序号> <工具名>`，紧接着通过 `key: value` 声明普通参数。
3. **分块内容载荷**：
   - 对于 `edit_file`：采用 `<<<<<<< SEARCH` 与 `=======` 与 `>>>>>>> REPLACE` 明确限定匹配块与替换块。
   - 对于 `write_file`：采用 `<<<<<<< CONTENT` 与 `>>>>>>> END` 包含文本。
4. **结果回填格式**：
   扩展回填时输出 ````webclaude-result 块，首行 `@result <序号> <工具名> ok/error`，并标注备份编号。

### 3.3 浏览器扩展层 (Extension)

- **DOM 适配中心 (`ClaudeDomAdapter`)**：
  将所有与 `claude.ai` 页面相关的选择器（输入框 ProseMirror、发送按钮、停止生成状态、历史消息列表）集中管理，并内置 **Self-Test（自检）** 方法。即使 Claude 网页改版，只需调整此单一模块的选择器即可。
- **Mention 补全与拦截 (`MentionHandler`)**：
  监听用户输入，检测到 `@` 时弹出悬浮菜单推荐 `@webclaude`；在用户按下回车或发送时，若检测到 `@webclaude` 且会话未初始化，自动通过本地服务获取项目树，拼装好系统指令后无缝替换输入框内容再提交。
- **Agent 循环控制器 (`AgentLoop`)**：
  利用 `MutationObserver` 监听页面生成状态。当检测到流式输出结束，经过 800ms 确认 DOM 稳定后，提取最后一条助手消息中的调用块。按会话 ID + 消息序号 + 调用序号建立唯一哈希去重，防止任何重复执行。
- **弹窗审批模块 (`ApprovalModal`)**：
  当工具属于高风险级别（如 `run_command` 运行脚本或 `git_commit` 提交代码）时，在网页中央弹出模态对话框，展示完整的命令及参数，只有用户显式点击“允许一次”后才会向本地服务下发。

### 3.4 本地核心服务与安全沙箱 (Core)

- **严格路径沙箱 (`WorkspaceManager.safePath`)**：
  - 严禁绝对路径（如 `C:\Windows`, `/etc/`）、盘符、UNC 路径；
  - 规范化路径并检查 `path.relative`，一旦发现以 `..` 开头或逃逸出所选根目录，立即抛出异常；
  - 逐级检查路径中的每一层目录，严禁穿越符号链接（Symlink）与 Windows 目录联接（Junction）；
  - 拦截 `.env*`、`id_rsa*`、`*.pem`、`*.key` 等敏感机密凭据。
- **写前快照与原子替换 (`BackupManager`)**：
  修改或删除文件前，自动在 `.webclaude-backups/<id>/` 下保存 `original.data` 与 `meta.json`。修改写入采用“写入临时文件 → `renameSync` 原子重命名”机制，杜绝断电或中断导致文件损坏。
- **无 Shell 命令执行 (`ExecTools`)**：
  执行系统指令时严格限定于用户白名单（默认仅包含 `git`, `node`, `npm`, `npx`, `python`, `cargo`, `go` 等安全开发工具），使用原生 `child_process.spawn` 并且**显式设置 `shell: false`**。由于脱离了 Shell 解释器，任何试图通过 `|`, `&&`, `;`, `>` 注入子进程的攻击均无效。
- **动态配对鉴权体系 (`AuthManager`)**：
  本地服务启动时随机生成 6 位配对码，有效期 5 分钟，且具备防暴力猜解机制（连续输错 5 次自动锁定 10 分钟）。配对成功后签发 64 位加密 Token，后续请求均在 HTTP 请求头中携带 `Authorization: Bearer <Token>` 验证。

### 3.5 桌面客户端与无头 CLI

- **桌面端 (Electron)**：采用现代深色主题与玻璃拟态视觉规范，集成了原生操作系统文件夹选择器、动态配对码倒计时指示牌、实时 SSE 调用日志看板、以及每一条历史操作的 **Undo** 按钮。
- **命令行 (CLI)**：使用单个打包的 ESM 脚本，支持在远程 Linux 机器或无界面服务器上运行 `webclaude serve -w <path>`，可通过 `ssh -L 43127:127.0.0.1:43127` 进行安全的本地端口映射。

---

## 四、 安全模型与合规考量

| 安全维度 | 官方远程 MCP / 隧道方案 | 传统自动化脚本 / Bot | WebClaude 方案 |
|---|---|---|---|
| **网络暴露面** | 需公网 HTTPS 入口（存在端口扫描与泄露风险） | 依赖第三方接口 | **仅监听 `127.0.0.1` 环回接口，零公网暴露** |
| **数据隐私** | 项目代码需经由第三方隧道中转 | 账号 Cookie/Token 暴露 | **代码直接由本地扩展到本地服务，不经任何第三方** |
| **条款合规性 (ToS)** | 合规（官方 Connector） | 违规（全自动无人值守脚本有封号风险） | **默认半自动（人工确认按 Enter 发送），完全符合用户协同条款** |
| **代码破坏防御** | 取决于模型自主操作，通常无本地版本回退 | 覆盖直接丢失 | **写前原子快照备份，随时一键 Undo 恢复** |
| **系统执行权限** | 通常需开启高危 Shell 权限 | 存在危险 Shell 注入 | **严格命令白名单 + `shell:false` + 网页端弹窗确认** |

---

## 五、 安装与使用指南

### 5.1 环境要求

- **操作系统**：Windows 10/11 或 Linux (Ubuntu/Debian/Fedora 等)
- **Node.js**：Node.js 20+ LTS（已在 Node.js v22 上完整测试通过）
- **浏览器**：Google Chrome 或 Microsoft Edge

### 5.2 编译构建

克隆仓库后，在工程根目录执行构建与测试：

```bash
# 安装依赖
npm install

# 运行自动化测试套件 (包含 13 项单元与集成测试)
npm test

# 全量构建扩展、桌面端与 CLI
npm run build
```

构建完成后产物分布如下：
- 浏览器扩展：`packages/extension/dist/`
- 桌面客户端：`packages/desktop/dist/`
- 命令行工具：`packages/cli/dist/index.js`

### 5.3 启动本地服务

你可以根据喜好选择启动桌面客户端或无头命令行：

#### 方式 1：启动桌面端 (推荐)
```bash
npm run desktop
```
1. 界面打开后，点击 **Browse...** 选择你打算进行开发修改的本地工程目录；
2. 确认端口（默认 `43127`），点击 **Start Service**；
3. 状态变为绿色 **Running**，界面中央将出现醒目的 **6 位动态配对码**。

#### 方式 2：启动无头命令行 (CLI)
```bash
# 为当前目录提供服务
npm run cli

# 或指定工作区目录与端口
npm run cli -- -w D:\Workspace\my-web-project -p 43127
```
控制台将输出服务监听地址与当前配对码。

### 5.4 加载浏览器扩展

1. 打开 Chrome 或 Edge 浏览器，访问：
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
2. 打开右上角的 **开发者模式 (Developer mode)** 开关；
3. 点击 **加载已解压的扩展程序 (Load unpacked)**；
4. 选择当前仓库下的 **`packages/extension/dist`** 文件夹并确认。

### 5.5 在 Claude 网页端配对并开始工作

1. 打开 [https://claude.ai](https://claude.ai) 并刷新任意聊天页面；
2. 页面右下角将出现深色 **WebClaude** 悬浮按钮；
3. 点击悬浮按钮展开控制面板，输入桌面端或命令行上显示的 **6 位配对码**，点击 **Pair**，提示 `Paired successfully!` 即配对完成；
4. 在输入框中输入 `@`，将自动弹出 `@webclaude` 菜单，按回车或 Tab 补全；
5. 输入你的任务需求后点击发送，例如：
   ```text
   @webclaude 请先查看项目结构，帮我把 package.json 中的 version 改为 0.3.0，并在 README.md 中新增一条发布说明，最后展示 git diff
   ```
6. **体验流畅的人机协同流程**：
   - Claude 开始分析并输出工具调用块；
   - 扩展在本地无感执行后，将结果整理为格式化代码块填入输入框；
   - 面板显示：`✅ Round #1 complete. Results inserted into input. Press Enter to send.`；
   - 你只需审查输入框内容，**按一次回车 (Enter)** 继续下一轮，Claude 将基于最新结果继续修改，直至任务完成！
7. **一键撤销 (Undo)**：
   若对修改不满意，可在桌面端日志或面板中点击对应记录的 **Undo** 按钮，文件将立即无损恢复为修改前的状态。

---

## 六、 支持的工具协议规范

Claude 会在回复中使用以下格式调用工具：

### 1. `workspace_info` (获取项目环境信息)
````webclaude
@call 1 workspace_info
````

### 2. `list_directory` (列出目录)
````webclaude
@call 2 list_directory
path: src/components
````

### 3. `directory_tree` (项目 ASCII 树状图)
````webclaude
@call 3 directory_tree
path: .
max_depth: 3
````

### 4. `read_file` (切片读取文件)
````webclaude
@call 4 read_file
path: src/index.ts
start_line: 1
end_line: 80
````

### 5. `search` (全文/正则代码搜索)
````webclaude
@call 5 search
query: handleLogin
path: src
regex: false
````

### 6. `edit_file` (精确搜索替换修改 - 核心推荐)
````webclaude
@call 6 edit_file
path: src/config.ts
<<<<<<< SEARCH
export const TIMEOUT = 1000;
=======
export const TIMEOUT = 5000;
>>>>>>> REPLACE
````

### 7. `write_file` (全量写入文件)
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

### 8. `run_command` (安全执行命令 - 会触发网页弹窗审批)
````webclaude
@call 8 run_command
command: npm
args: test
timeout: 60
````

### 9. `git_status` / `git_diff` / `git_commit` (Git 交互)
````webclaude
@call 9 git_diff
path: src/config.ts
staged: false
````

---

## 七、 常见问题与排查指南 (FAQ)

### Q1: 扩展悬浮按钮显示红点，提示 "Disconnected"？
- 确认是否已通过 `npm run desktop` 或 `npm run cli` 启动了本地服务；
- 确认本地端口是否为默认的 `43127`，若自定义了端口，请在桌面端和扩展配置中保持一致；
- 点击面板上的 **Self-Test** 查看连接状态。

### Q2: 提示 "Pairing code expired" 或配对失败？
- 动态配对码默认 **5 分钟有效**。若已过期，请在桌面端点击刷新按钮（↻）生成新码；
- 连续输错 5 次将触发 10 分钟防暴力破解锁定保护，等待倒计时结束即可。

### Q3: Claude 网页版界面改版，扩展找不到输入框怎么办？
- 打开右下角 WebClaude 面板，点击 **Self-Test** 按钮，报告将明确指出 `Composer Input`、`Send Button` 是否被成功定位；
- 本项目的 DOM 选择器全部集中在 `packages/extension/src/content/claude-dom.ts`，只需在此文件中补充最新的 HTML 类名或属性，重新执行 `npm run build:extension` 即可，业务逻辑无需任何改动。

### Q4: 能否把修改推送到远程 Git 仓库？
- 不能。出于最高安全准则，WebClaude 的 Git 工具仅提供 `git_status`、`git_diff` 与本地 `git_commit`，**严格杜绝 `git push`**。远程代码的推送必须由开发者本人在本地终端中审查并最终决定。

### Q5: 为什么文件编辑 (`edit_file`) 偶发报 "SEARCH block not found"？
- 常见原因是 Claude 在阅读文件后，误将 `read_file` 返回的行号前缀（如 `12 | `）连同代码一起复制进了 `SEARCH` 块中；或者行尾包含了多余空格或空行。
- WebClaude 内置了**精确匹配 → 自动剔除行号前缀匹配 → 空白与空行容差匹配**的三重流水线，已能自动纠错绝大多数该类场景；
- 若遇到极端未匹配，系统会输出具体缺失行代码的预览，只需在 Claude 窗口输入：“请提供包含前后 2~3 行纯代码上下文的 SEARCH 块（不含行号）”，Claude 即可重新精准匹配修改。

---

## 📄 开源许可证

本项目基于 [MIT License](LICENSE) 开源发布。欢迎提 Issue 与 PR 共建！

> ⚠️ 免责声明：本项目为第三方开源工具，与 Anthropic 无任何关联。请自行确认使用方式符合 claude.ai 当时的服务条款，因使用本工具产生的风险由使用者自行承担。
