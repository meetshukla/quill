const DEFAULT_API_URL = "https://backend-production-53dd.up.railway.app";
const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await chrome.storage.local.get({ apiUrl: DEFAULT_API_URL, apiToken: "" });
  $("apiUrl").value = settings.apiUrl;
  $("apiToken").value = settings.apiToken;
  $("saveSettings").addEventListener("click", saveSettings);
  $("testConnection").addEventListener("click", testConnection);
  $("captureCurrent").addEventListener("click", captureCurrent);
  $("captureVisible").addEventListener("click", captureVisibleMatches);
  $("refresh").addEventListener("click", loadItems);
  if (settings.apiToken) await showConnected();
});

async function api(path, init) {
  const response = await chrome.runtime.sendMessage({ type: "QUILL_API", path, init });
  if (!response?.ok) throw new Error(response?.error || "Could not reach Quill.");
  return response.data;
}

async function saveSettings() {
  await chrome.storage.local.set({ apiUrl: $("apiUrl").value.trim(), apiToken: $("apiToken").value.trim() });
  $("connectionStatus").textContent = "Saved locally in this browser.";
}

async function testConnection() {
  try {
    await saveSettings();
    await api("/research/items?limit=1");
    $("connectionStatus").textContent = "Connected to your Quill research inbox.";
    await showConnected();
  } catch (error) { $("connectionStatus").textContent = error.message; }
}

async function showConnected() {
  $("capture").classList.remove("hidden");
  $("opportunities").classList.remove("hidden");
  await loadItems();
}

async function activeXTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !/^https:\/\/(x|twitter)\.com\//.test(tab.url || "")) throw new Error("Open an X page first.");
  return tab.id;
}

async function sendToTab(type) {
  const tabId = await activeXTab();
  try { return await chrome.tabs.sendMessage(tabId, { type }); }
  catch {
    await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
    return chrome.tabs.sendMessage(tabId, { type });
  }
}

async function captureCurrent() {
  try {
    const { item } = await sendToTab("QUILL_CAPTURE_CURRENT");
    if (!item) throw new Error("No X post found on this page.");
    await api("/research/items", { method: "POST", body: item });
    $("captureStatus").textContent = "Captured to Quill.";
    await loadItems();
  } catch (error) { $("captureStatus").textContent = error.message; }
}

async function captureVisibleMatches() {
  try {
    const [{ items }, { rules }] = await Promise.all([sendToTab("QUILL_CAPTURE_VISIBLE"), api("/research/rules")]);
    const matches = rules.filter((rule) => rule.kind === "MATCH").map((rule) => rule.value.toLowerCase());
    const excludes = rules.filter((rule) => rule.kind === "EXCLUDE").map((rule) => rule.value.toLowerCase());
    const selected = items.filter((item) => {
      const text = item.text.toLowerCase();
      const found = matches.filter((word) => text.includes(word));
      if (!found.length || excludes.some((word) => text.includes(word))) return false;
      item.matchedKeywords = found;
      return true;
    });
    await Promise.all(selected.map((item) => api("/research/items", { method: "POST", body: item })));
    $("captureStatus").textContent = selected.length ? `Captured ${selected.length} matching posts.` : "No visible keyword matches.";
    await loadItems();
  } catch (error) { $("captureStatus").textContent = error.message; }
}

async function loadItems() {
  try {
    const { items } = await api("/research/items?limit=50");
    const target = $("items");
    target.replaceChildren();
    if (!items.length) { target.textContent = "No captures yet. Save a useful post from X."; return; }
    for (const item of items) target.append(renderItem(item));
  } catch (error) { $("items").textContent = error.message; }
}

function renderItem(item) {
  const node = document.createElement("article");
  node.className = "item";
  const draft = item.researchDraft?.scheduledPost?.text;
  node.innerHTML = `<div class="item-head">${escape(item.sourceHandle ? `@${item.sourceHandle}` : item.type)} · ${escape(item.status)}</div><div class="item-text">${escape(item.text || item.title || "Untitled capture")}</div><div class="item-footer">${draft ? "Reply ready" : "Awaiting review"}</div>`;
  if (draft) {
    const button = document.createElement("button"); button.className = "copy"; button.textContent = "Copy reply";
    button.addEventListener("click", async () => { await navigator.clipboard.writeText(draft); button.textContent = "Copied"; });
    node.querySelector(".item-footer").append(button);
  }
  return node;
}

function escape(value) { const node = document.createElement("span"); node.textContent = value || ""; return node.innerHTML; }
