const DEFAULT_API_URL = "https://backend-production-53dd.up.railway.app";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "QUILL_API") return respond(() => requestQuill(message.path, message.init), sendResponse);
  if (message.type === "QUILL_GET_RULES") return respond(() => requestQuill("/research/rules"), sendResponse);
  if (message.type === "QUILL_CAPTURE_ITEMS") return respond(() => requestQuill("/research/items/bulk", { method: "POST", body: message.items }), sendResponse);
  if (message.type === "QUILL_PREPARE_REPLIES") return respond(() => requestQuill("/research/prepare", { method: "POST", body: { limit: message.limit ?? 5 } }), sendResponse);
  if (message.type === "QUILL_QUICK_NEXT") return respond(() => requestQuill("/research/quick-next", { method: "POST", body: { limit: message.limit ?? 5 } }), sendResponse);
  if (message.type === "QUILL_FIND_REPLY") return respond(async () => {
    const result = await requestQuill(`/research/items?xPostId=${encodeURIComponent(message.xPostId)}&limit=1`);
    return { reply: result.items?.[0]?.generatedReply ?? null };
  }, sendResponse);
  if (message.type === "QUILL_MARK_COPIED") return respond(() => requestQuill(`/research/replies/${message.replyId}/copied`, { method: "POST" }), sendResponse);
  return false;
});

function respond(operation, sendResponse) {
  void operation().then(
    (data) => sendResponse({ ok: true, data }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
  );
  return true;
}

async function requestQuill(path, init = {}) {
  const settings = await chrome.storage.local.get({ apiUrl: DEFAULT_API_URL, apiToken: "" });
  if (!settings.apiToken) throw new Error("Connect this extension in Quill Settings first.");
  const response = await fetch(`${settings.apiUrl.replace(/\/$/, "")}/api${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${settings.apiToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {})
    },
    body: init.body ? JSON.stringify(init.body) : undefined
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(payload?.error ?? `Quill returned ${response.status}`);
  return payload;
}
