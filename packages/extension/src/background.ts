// Background Service Worker
const DEFAULT_PORT = 43127;

async function getConfig(): Promise<{ port: number; token: string }> {
  const data = await chrome.storage.local.get(["port", "token"]);
  return {
    port: data.port || DEFAULT_PORT,
    token: data.token || "",
  };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.tab && (!sender.url || !sender.url.startsWith("https://claude.ai/"))) {
    sendResponse({ ok: false, error: "Sender is not Claude Web." });
    return;
  }

  (async () => {
    try {
      const { port, token } = await getConfig();
      const baseUrl = `http://127.0.0.1:${port}`;

      if (msg.type === "GET_STATUS") {
        try {
          const res = await fetch(`${baseUrl}/status`);
          const data = await res.json();
          sendResponse({ ok: true, data, hasToken: !!token });
        } catch (e: any) {
          sendResponse({ ok: false, error: `Local service not reachable at ${baseUrl}. Ensure Desktop app or CLI is running.` });
        }
        return;
      }

      if (msg.type === "PAIR") {
        try {
          const res = await fetch(`${baseUrl}/pair`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: msg.code }),
          });
          const data = await res.json();
          if (data.ok && data.token) {
            await chrome.storage.local.set({ token: data.token });
            sendResponse({ ok: true });
          } else {
            sendResponse({ ok: false, error: data.error || "Pairing failed" });
          }
        } catch (e: any) {
          sendResponse({ ok: false, error: `Failed to connect to local service: ${e.message}` });
        }
        return;
      }

      if (msg.type === "REVOKE") {
        await chrome.storage.local.remove(["token"]);
        sendResponse({ ok: true });
        return;
      }

      if (msg.type === "EXECUTE_TOOL") {
        if (!token) {
          sendResponse({ ok: false, error: "Extension not paired. Enter pairing code in panel." });
          return;
        }

        const res = await fetch(`${baseUrl}/rpc`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            id: msg.id,
            tool: msg.tool,
            args: msg.args,
          }),
        });

        const data = await res.json();
        sendResponse(data);
        return;
      }

      if (msg.type === "UNDO") {
        if (!token) {
          sendResponse({ ok: false, error: "Not paired" });
          return;
        }

        const res = await fetch(`${baseUrl}/undo`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ backupId: msg.backupId }),
        });

        const data = await res.json();
        sendResponse(data);
        return;
      }

      sendResponse({ ok: false, error: `Unknown action: ${msg.type}` });
    } catch (err: any) {
      sendResponse({ ok: false, error: err.message || "Internal extension error" });
    }
  })();

  return true; // Keep channel open for async response
});
