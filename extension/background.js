const DEFAULT_API_URL = "https://backend-production-53dd.up.railway.app";

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "QUILL_API") return respond(() => requestQuill(message.path, message.init), sendResponse);
  if (message.type === "QUILL_GET_RULES") return respond(() => requestQuill("/research/rules"), sendResponse);
  if (message.type === "QUILL_CAPTURE_ITEMS") return respond(() => requestQuill("/research/items/bulk", { method: "POST", body: message.items }), sendResponse);
  if (message.type === "QUILL_CLEANUP_ARTICLES") return respond(() => requestQuill("/research/articles/cleanup", { method: "POST" }), sendResponse);
  if (message.type === "QUILL_PREPARE_ITEM") return respond(() => requestQuill(`/research/items/${message.itemId}/prepare`, { method: "POST" }), sendResponse);
  if (message.type === "QUILL_PREPARE_REPLIES") return respond(() => requestQuill("/research/prepare", { method: "POST", body: { limit: message.limit ?? 5 } }), sendResponse);
  if (message.type === "QUILL_QUICK_NEXT") return respond(() => requestQuill("/research/quick-next", { method: "POST", body: { limit: message.limit ?? 5 } }), sendResponse);
  if (message.type === "QUILL_FIND_REPLY") return respond(async () => {
    const result = await requestQuill(`/research/items?xPostId=${encodeURIComponent(message.xPostId)}&limit=1`);
    return { reply: result.items?.[0]?.generatedReply ?? null };
  }, sendResponse);
  if (message.type === "QUILL_MARK_COPIED") return respond(() => requestQuill(`/research/replies/${message.replyId}/copied`, { method: "POST" }), sendResponse);
  if (message.type === "QUILL_FETCH_ARTICLE") return respond(() => fetchArticle(message.url), sendResponse);
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

async function fetchArticle(url) {
  let tabId;
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    tabId = tab.id;
    if (!tabId) throw new Error("Could not open article");
    await waitForTabComplete(tabId);
    await wait(1800);
    let extracted = await extractArticleFromTab(tabId);
    const followUrl = (extracted?.articleUrls || []).find((candidate) => candidate !== url && isXArticleUrl(candidate));
    if (followUrl && !isXArticleUrl(url)) {
      await chrome.tabs.update(tabId, { url: followUrl });
      await waitForTabComplete(tabId);
      await wait(1800);
      extracted = await extractArticleFromTab(tabId);
      if (extracted?.item?.raw) extracted.item.raw.statusUrl = url;
    }
    if (!extracted?.item) throw new Error("Could not read article content");
    return extracted;
  } finally {
    if (tabId) await chrome.tabs.remove(tabId).catch(() => {});
  }
}

async function extractArticleFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { type: "QUILL_EXTRACT_ARTICLE" });
  } catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type: "QUILL_EXTRACT_ARTICLE" });
  }
}

function isXArticleUrl(value) {
  try {
    const url = new URL(value);
    return /(^|\.)?(x|twitter)\.com$/.test(url.hostname)
      && (/^\/i\/article\/\d+/.test(url.pathname) || /^\/[^/]+\/articles\/\d+/.test(url.pathname) || /^\/[^/]+\/article\/\d+/.test(url.pathname));
  } catch { return false; }
}

function waitForTabComplete(tabId, timeoutMs = 20_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(onUpdated);
      callback(value);
    };
    const timeout = setTimeout(() => finish(reject, new Error("Article page took too long to load")), timeoutMs);
    const onUpdated = (updatedTabId, info) => {
      if (updatedTabId === tabId && info.status === "complete") finish(resolve);
    };
    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") finish(resolve);
    }).catch(() => finish(reject, new Error("Article tab closed")));
  });
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
