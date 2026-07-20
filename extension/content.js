(() => {
  if (window.__quillXLoaded) return;
  window.__quillXLoaded = true;

  let rules = [];
  let scanning = false;
  let scanStop = false;
  let profileCollector = null;
  let collected = new Map();
  const capturedUrls = new Set();
  let captureTimer = null;
  let capturing = false;
  let captureQueued = false;

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
    if (message.type === "QUILL_RELOAD_RULES") {
      void loadRules().then(scheduleVisibleCapture); sendResponse({ ok: true }); return;
    }
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
    const response = await chrome.runtime.sendMessage({ type: "QUILL_CAPTURE_ITEMS", items });
    if (!response?.ok) throw new Error(response?.error || "Could not save to Quill.");
    return response.data;
  }

  function scheduleVisibleCapture() {
    if (captureTimer) return;
    captureTimer = setTimeout(() => { captureTimer = null; void processVisible(); }, 180);
  }

  async function processVisible() {
    if (capturing) { captureQueued = true; return; }
    capturing = true;
    const matches = [];
    try {
      for (const article of document.querySelectorAll("article")) {
        const item = extractArticle(article);
        if (!item) continue;
        const keywords = matchingKeywords(item.text || "");
        if (keywords.length) {
          item.matchedKeywords = keywords;
          markMatch(article);
          if (!capturedUrls.has(item.url)) { capturedUrls.add(item.url); matches.push(item); }
        }
        addPostActions(article, item);
        if (profileCollector) collect(item);
      }
      await save(matches);
    } finally {
      capturing = false;
      if (captureQueued) { captureQueued = false; scheduleVisibleCapture(); }
    }
  }

  function markMatch(article) {
    article.classList.add("quill-match");
  }

  function addPostActions(article, item) {
    const nativeReply = article.querySelector('[data-testid="reply"]');
    const actionBar = nativeReply?.closest('[role="group"]') ?? article.querySelector('[role="group"]');
    if (!actionBar || actionBar.querySelector(".quill-list-action")) return;
    const actions = document.createElement("div");
    actions.className = "quill-actions";
    const add = document.createElement("button");
    add.className = "quill-action quill-list-action";
    add.textContent = "+ List";
    add.title = "Save this post to your Quill research list";
    add.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      try { await save([item]); add.textContent = "Added"; } catch { add.textContent = "Try again"; }
    });
    const reply = document.createElement("button");
    reply.className = "quill-action quill-reply-action";
    reply.textContent = "Reply";
    reply.title = "Generate a Quill reply draft and copy it to your clipboard";
    reply.addEventListener("click", async (event) => {
      event.preventDefault(); event.stopPropagation();
      try {
        reply.textContent = "Preparing…";
        const captured = await save([item]);
        const saved = captured?.items?.[0];
        if (!saved?.id) throw new Error("Could not add this post to Quill.");
        const response = await chrome.runtime.sendMessage({ type: "QUILL_PREPARE_ITEM", itemId: saved.id });
        const draft = response?.ok ? response.data.reply : null;
        if (!draft?.text) { reply.textContent = "No angle"; setTimeout(() => { reply.textContent = "Reply"; }, 1800); return; }
        await navigator.clipboard.writeText(draft.text);
        reply.textContent = "Copied";
      } catch {
        reply.textContent = "Unavailable";
        setTimeout(() => { reply.textContent = "Reply"; }, 1800);
      }
    });
    actions.append(add, reply);
    actionBar.append(actions);
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

  void loadRules().then(() => {
    scheduleVisibleCapture();
    window.addEventListener("scroll", scheduleVisibleCapture, { passive: true });
    new MutationObserver(scheduleVisibleCapture).observe(document.body, { childList: true, subtree: true });
  });
})();
