(() => {
  if (window.__quillXLoaded) return;
  window.__quillXLoaded = true;

  let rules = [];
  let scanning = false;
  let scanStop = false;
  let profileCollector = null;
  let collected = new Map();
  const processed = new WeakSet();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "QUILL_CAPTURE_CURRENT") return sendResponse({ item: captureCurrent() });
    if (message.type === "QUILL_CAPTURE_VISIBLE") return sendResponse({ items: visibleItems() });
    if (message.type === "QUILL_CAPTURE_PAGE") return sendResponse({ item: capturePage() });
    if (message.type === "QUILL_START_SCAN") {
      if (scanning) return sendResponse({ status: "already_running" });
      void runFeedScan(); sendResponse({ status: "started" }); return;
    }
    if (message.type === "QUILL_STOP_SCAN") { scanStop = true; sendResponse({ status: "stopping" }); return; }
    if (message.type === "QUILL_SCAN_STATUS") return sendResponse({ scanning });
    if (message.type === "QUILL_START_PROFILE") {
      if (profileCollector) return sendResponse({ status: "already_running", count: collected.size });
      startProfileCollector(); sendResponse({ status: "started" }); return;
    }
    if (message.type === "QUILL_STOP_PROFILE") {
      stopProfileCollector(); sendResponse({ status: "done", items: [...collected.values()] }); return;
    }
    if (message.type === "QUILL_PROFILE_STATUS") return sendResponse({ collecting: Boolean(profileCollector), count: collected.size });
    return false;
  });

  async function loadRules() {
    const response = await chrome.runtime.sendMessage({ type: "QUILL_GET_RULES" });
    rules = response?.ok ? response.data.rules : [];
  }

  function splitRules(kind) { return rules.filter((rule) => rule.kind === kind).map((rule) => rule.value.toLowerCase()); }
  function matchingKeywords(text) {
    const low = text.toLowerCase();
    const excluded = splitRules("EXCLUDE").some((word) => low.includes(word));
    if (excluded) return [];
    return splitRules("MATCH").filter((word) => low.includes(word));
  }

  function visibleItems() { return [...document.querySelectorAll("article")].map(extractArticle).filter(Boolean); }
  function captureCurrent() { return visibleItems().find((item) => item.xPostId === location.pathname.match(/\/status\/(\d+)/)?.[1]) ?? visibleItems()[0] ?? null; }

  function extractArticle(article) {
    const postLink = [...article.querySelectorAll('a[href*="/status/"]')].map((anchor) => anchor.href).find((href) => /\/status\/\d+/.test(href));
    if (!postLink) return null;
    const text = [...article.querySelectorAll('[data-testid="tweetText"]')].map((node) => node.innerText).join("\n").trim();
    const xPostId = postLink.match(/\/status\/(\d+)/)?.[1];
    const sourceHandle = [...article.querySelectorAll('a[href^="/"]')].map((anchor) => anchor.getAttribute("href")?.split("/")[1]).find((value) => value && !["home", "search", "i", "compose"].includes(value));
    const authorName = article.querySelector('[data-testid="User-Name"]')?.innerText?.split("\n")[0]?.trim();
    return { type: "POST", url: postLink.replace(/[?#].*$/, ""), xPostId, sourceHandle, authorName, text, raw: { capturedFrom: "quill-x", capturedAt: new Date().toISOString() } };
  }

  function capturePage() {
    const text = document.querySelector("main")?.innerText?.trim().slice(0, 100_000) || document.body.innerText.slice(0, 100_000);
    return { type: "ARTICLE", url: location.href.replace(/[?#].*$/, ""), title: document.title, text, raw: { capturedFrom: "quill-x-page", capturedAt: new Date().toISOString() } };
  }

  async function save(items) {
    if (!items.length) return;
    await chrome.runtime.sendMessage({ type: "QUILL_CAPTURE_ITEMS", items });
  }

  async function processVisible() {
    const matches = [];
    for (const article of document.querySelectorAll("article")) {
      const item = extractArticle(article);
      if (!item) continue;
      const keywords = matchingKeywords(item.text || "");
      if (keywords.length) {
        item.matchedKeywords = keywords;
        markMatch(article, item);
        if (!processed.has(article)) { processed.add(article); matches.push(item); }
      }
      if (profileCollector) collect(item);
    }
    await save(matches);
  }

  function markMatch(article, item) {
    article.classList.add("quill-match");
    const actionBar = article.querySelector('[role="group"]');
    if (!actionBar || actionBar.querySelector(".quill-action")) return;
    const button = document.createElement("button");
    button.className = "quill-action";
    button.textContent = "Quill";
    button.title = "Save to Quill";
    button.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      await save([item]); button.textContent = "Saved";
    });
    const reply = document.createElement("button");
    reply.className = "quill-action quill-reply-action";
    reply.textContent = "Reply";
    reply.title = "Use prepared Quill reply";
    reply.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      const response = await chrome.runtime.sendMessage({ type: "QUILL_FIND_REPLY", xPostId: item.xPostId });
      const draft = response?.ok ? response.data.reply : null;
      if (!draft?.text) { reply.textContent = "Not ready"; setTimeout(() => { reply.textContent = "Reply"; }, 1500); return; }
      await pasteIntoReplyComposer(article, draft.text);
      await chrome.runtime.sendMessage({ type: "QUILL_MARK_COPIED", replyId: draft.id });
      reply.textContent = "Ready";
    });
    actionBar.append(button, reply);
  }

  async function pasteIntoReplyComposer(article, text) {
    const replyButton = article.querySelector('[data-testid="reply"]');
    replyButton?.click();
    for (let i = 0; i < 20; i += 1) {
      const box = document.querySelector('[data-testid="tweetTextarea_0"]');
      if (box) { box.focus(); document.execCommand("insertText", false, text); return; }
      await wait(150);
    }
    await navigator.clipboard.writeText(text);
  }

  async function runFeedScan() {
    scanning = true; scanStop = false;
    await loadRules();
    for (let index = 0; index < 60 && !scanStop; index += 1) {
      await processVisible();
      window.scrollBy({ top: 350 + Math.floor(Math.random() * 450), behavior: "smooth" });
      await wait(900 + Math.floor(Math.random() * 900));
    }
    await processVisible();
    scanning = false;
  }

  function startProfileCollector() {
    collected = new Map();
    processVisible();
    profileCollector = new MutationObserver(() => { void processVisible(); });
    profileCollector.observe(document.body, { childList: true, subtree: true });
  }
  function stopProfileCollector() { profileCollector?.disconnect(); profileCollector = null; }
  function collect(item) { if (item.url) collected.set(item.url, { ...item, raw: { ...item.raw, capture: "profile" } }); }
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  void loadRules().then(() => { void processVisible(); new MutationObserver(() => { void processVisible(); }).observe(document.body, { childList: true, subtree: true }); });
})();
