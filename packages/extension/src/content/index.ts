import { ClaudeDomAdapter } from "./claude-dom.js";
import { MentionHandler } from "./mention.js";
import { AgentLoop } from "./agent-loop.js";
import { WebClaudePanel } from "./panel.js";
import { WebClaudeToast } from "./toast.js";

function bootstrap() {
  if ((window as any).__webclaudeLoaded) return;
  (window as any).__webclaudeLoaded = true;

  const dom = new ClaudeDomAdapter();
  const mention = new MentionHandler(dom);
  const loop = new AgentLoop();
  const toast = new WebClaudeToast();
  const panel = new WebClaudePanel(loop, dom, toast);

  loop.onTaskComplete((details) => {
    toast.showCompletion(details);
  });

  mention.init();
  panel.init();
  loop.start();

  console.log("[WebClaude] Injected successfully into Claude Web.");
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrap);
} else {
  bootstrap();
}
