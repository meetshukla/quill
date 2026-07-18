const DEFAULT_API_URL = "https://backend-production-53dd.up.railway.app";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "QUILL_API") return false;
  void requestQuill(message.path, message.init).then(
    (data) => sendResponse({ ok: true, data }),
    (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
  );
  return true;
});

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
