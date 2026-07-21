(() => {
  if (window.__quillXLoaded) return;
  window.__quillXLoaded = true;

  const ARTICLE_DISCOVERY_SCROLLS = 80;
  const ARTICLE_IMPORT_LIMIT = 35;
  let rules = [];
  let profileCollector = null;
  let collected = new Map();
  const capturedUrls = new Set();
  let inspectTimer = null;
  let inspecting = false;
  let inspectQueued = false;
  let collectorPanel = null;
  let articleImport = { running: false, found: 0, total: 0, saved: 0, failed: 0 };

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "QUILL_CAPTURE_CURRENT") return sendResponse({ item: captureCurrent() });
    if (message.type === "QUILL_CAPTURE_VISIBLE") return sendResponse({ items: visibleItems() });
    if (message.type === "QUILL_CAPTURE_PAGE") return sendResponse({ item: capturePage() });
    if (message.type === "QUILL_EXTRACT_ARTICLE") return sendResponse({ item: captureXArticle(), articleUrls: collectArticleCandidateUrlsOnPage() });
    if (message.type === "QUILL_MANUAL_SCAN") {
      void captureVisibleMatches().then(
        (result) => sendResponse({ ok: true, ...result }),
        (error) => sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) })
      );
      return true;
    }
    if (message.type === "QUILL_RELOAD_RULES") {
      void loadRules().then(scheduleVisibleInspection); sendResponse({ ok: true }); return;
    }
    if (message.type === "QUILL_START_PROFILE") {
      if (profileCollector) return sendResponse({ status: "already_running", count: collected.size });
      startProfileCollector(); sendResponse({ status: "started", count: collected.size }); return;
    }
    if (message.type === "QUILL_STOP_PROFILE") {
      stopProfileCollector(); sendResponse({ status: "done", items: [...collected.values()] }); return;
    }
    if (message.type === "QUILL_PROFILE_STATUS") return sendResponse({ collecting: Boolean(profileCollector), count: collected.size });
    if (message.type === "QUILL_PROFILE_SAVE_PROGRESS") {
      updateCollector({ title: "Saving profile capture", count: message.total ?? collected.size, detail: `${message.saved ?? 0} saved` });
      sendResponse({ ok: true }); return;
    }
    if (message.type === "QUILL_PROFILE_SAVE_COMPLETE") {
      updateCollector({ title: "Profile capture saved", count: message.total ?? collected.size, detail: `${message.saved ?? 0} saved` });
      window.setTimeout(removeCollector, 5000); sendResponse({ ok: true }); return;
    }
    if (message.type === "QUILL_PROFILE_SAVE_ERROR") {
      updateCollector({ title: "Profile save needs attention", count: collected.size, detail: message.error || "Could not save every post" });
      sendResponse({ ok: true }); return;
    }
    if (message.type === "QUILL_IMPORT_ARTICLES") {
      if (articleImport.running) return sendResponse({ status: "already_running", ...articleImport });
      if (!isArticlesTab()) {
        const articlesUrl = profileArticlesUrl();
        return sendResponse(articlesUrl
          ? { status: "needs_articles_tab", articlesUrl }
          : { status: "invalid_page", error: "Open an X profile or its Articles tab first." });
      }
      void importArticlesFromCurrentTab(); sendResponse({ status: "started" }); return;
    }
    if (message.type === "QUILL_ARTICLES_STATUS") return sendResponse(articleImport);
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
    const media = extractMedia(article, text);
    const articleLinks = articleLinksFrom(article);
    if (!text && !media.length && !articleLinks.length) return null;
    const xPostId = postLink.match(/\/status\/(\d+)/)?.[1];
    const sourceHandle = [...article.querySelectorAll('a[href^="/"]')].map((anchor) => anchor.getAttribute("href")?.split("/")[1]).find((value) => value && !["home", "search", "i", "compose"].includes(value));
    const authorName = article.querySelector('[data-testid="User-Name"]')?.innerText?.split("\n")[0]?.trim();
    return {
      type: "POST",
      url: postLink.replace(/[?#].*$/, ""),
      xPostId,
      sourceHandle,
      authorName,
      text,
      raw: { capturedFrom: "quill-x", capturedAt: new Date().toISOString(), media, articleLinks }
    };
  }

  function capturePage() {
    const main = document.querySelector("main") || document.body;
    const url = location.href.replace(/[?#].*$/, "");
    const text = cleanText(main.innerText || main.textContent || "").slice(0, 100_000);
    const title = cleanText(main.querySelector("h1")?.innerText || document.title).slice(0, 500) || "Untitled page";
    return {
      type: "ARTICLE",
      url,
      title,
      text,
      raw: {
        capturedFrom: "quill-x-page",
        capturedAt: new Date().toISOString(),
        media: extractMedia(main, text),
        articleLinks: articleLinksFrom(main),
        sourceUrl: url
      }
    };
  }

  // /status pages are conversation wrappers. X's canonical /article page has a
  // dedicated read-view container with just the article and its own media.
  // Never turn a wrapper page into a research article.
  function captureXArticle() {
    if (!isXArticlePage()) return null;
    const articleRoot = document.querySelector('[data-testid="twitterArticleReadView"]');
    if (!articleRoot) return null;

    const fullText = cleanText(articleRoot.innerText || articleRoot.textContent || "");
    const lines = fullText.split("\n").filter(Boolean);
    const title = cleanText(lines[0] || "").slice(0, 500);
    const sourceHandle = (lines.find((line) => /^@[A-Za-z0-9_]{1,15}$/.test(line)) || "").slice(1);
    const headings = [...articleRoot.querySelectorAll("h2")]
      .map((heading) => cleanText(heading.innerText || heading.textContent || ""))
      .filter((heading) => heading.length >= 24 && heading !== title);
    const firstBodyHeading = headings[0] || "";
    if (!title || isGenericArticleTitle(title) || !firstBodyHeading) return null;

    let text = fullText.slice(fullText.indexOf(firstBodyHeading));
    // X renders the author's profile card after a separator within the reader.
    // Remove it without touching article content, which begins at the first body heading.
    if (sourceHandle) {
      const authorFooter = new RegExp(`\\n[^\\n]+\\n@${escapeRegExp(sourceHandle)}\\nFollow\\n(?:Content\\n)?`);
      const footer = text.match(authorFooter);
      if (footer?.index && footer.index > 0) text = text.slice(0, footer.index);
    }
    text = cleanText(text);
    if (!isMeaningfulArticleBody(text)) return null;

    const url = location.href.replace(/[?#].*$/, "");
    return {
      type: "ARTICLE",
      url,
      sourceHandle: sourceHandle || undefined,
      title,
      text,
      raw: {
        capturedFrom: "quill-x-article",
        capturedAt: new Date().toISOString(),
        media: extractMedia(articleRoot, text),
        sourceUrl: url
      }
    };
  }

  function cleanText(value) { return String(value || "").replace(/\r/g, "").split("\n").map((line) => line.trim()).filter(Boolean).join("\n"); }
  function normaliseUrl(value) {
    try { const url = new URL(value, location.href); url.hash = ""; return url.toString(); } catch { return ""; }
  }
  function isXArticleUrl(value) {
    const url = normaliseUrl(value);
    try {
      const parsed = new URL(url);
      return /(^|\.)?(x|twitter)\.com$/.test(parsed.hostname)
        && (/^\/i\/article\/\d+/.test(parsed.pathname) || /^\/[^/]+\/articles\/\d+/.test(parsed.pathname) || /^\/[^/]+\/article\/\d+/.test(parsed.pathname));
    } catch { return false; }
  }
  function isXArticlePage() { return /^\/[^/]+\/article\/\d+/.test(location.pathname) || /^\/i\/article\/\d+/.test(location.pathname); }
  function isGenericArticleTitle(value) { return /^(conversation|article|untitled(?: page)?)$/i.test(value.trim()); }
  function isMeaningfulArticleBody(value) {
    return value.length >= 280
      && /[A-Za-z]{4}/.test(value)
      && !/^see new posts(?:\n|$)/i.test(value)
      && !/^trending now(?:\n|$)/i.test(value);
  }
  function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function isXStatusUrl(value) {
    const url = normaliseUrl(value);
    try {
      const parsed = new URL(url);
      return /(^|\.)?(x|twitter)\.com$/.test(parsed.hostname) && /^\/[^/]+\/status\/\d+/.test(parsed.pathname);
    } catch { return false; }
  }
  function isArticlesTab() { return /^\/[^/]+\/articles\/?$/.test(location.pathname); }
  function profileArticlesUrl() {
    const handle = location.pathname.split("/").filter(Boolean)[0];
    if (!handle || ["home", "search", "explore", "notifications", "messages", "i", "settings", "compose"].includes(handle)) return "";
    return `https://x.com/${handle}/articles`;
  }
  function articleLinksFrom(scope) {
    const links = new Set();
    scope.querySelectorAll('a[href]').forEach((link) => {
      const url = normaliseUrl(link.getAttribute("href"));
      if (url && isXArticleUrl(url)) links.add(url);
    });
    return [...links];
  }
  // X's Articles tab often links each card to the article's status post rather
  // than to /i/article/... directly. Keep that status URL as a candidate so
  // the background worker can open it and follow the real article link.
  function collectArticleCandidateUrlsOnPage() {
    const links = new Set(articleLinksFrom(document));
    if (!isArticlesTab()) return [...links];
    document.querySelectorAll('article[data-testid="tweet"], [data-testid="cellInnerDiv"]').forEach((card) => {
      const cardLinks = [...card.querySelectorAll('a[href]')];
      const directArticle = cardLinks.find((link) => isXArticleUrl(link.getAttribute("href")));
      if (directArticle) {
        links.add(normaliseUrl(directArticle.getAttribute("href")));
        return;
      }
      const statusPost = cardLinks.find((link) => isXStatusUrl(link.getAttribute("href")));
      if (statusPost) links.add(normaliseUrl(statusPost.getAttribute("href")));
    });
    return [...links];
  }
  function collectArticleLinksOnPage() { return collectArticleCandidateUrlsOnPage(); }
  function normaliseMediaUrl(value) {
    try { const url = new URL(value, location.href); url.hash = ""; return url.toString(); } catch { return ""; }
  }
  function extractMedia(scope, context) {
    const media = [];
    const seen = new Set();
    const add = (type, url, alt = "", extra = {}) => {
      const cleanUrl = normaliseMediaUrl(url);
      if (!cleanUrl || cleanUrl.startsWith("blob:") || seen.has(cleanUrl)) return;
      seen.add(cleanUrl);
      media.push({ type, url: cleanUrl, alt: cleanText(alt), description: cleanText(alt || context).slice(0, 1200), sourceUrl: location.href.replace(/[?#].*$/, ""), ...extra });
    };
    scope.querySelectorAll("img[src]").forEach((img) => {
      const src = img.currentSrc || img.src || img.getAttribute("src") || "";
      if (!src || /profile_images|emoji\/v2|abs-0\.twimg\.com/i.test(src)) return;
      add("image", src, img.getAttribute("alt") || "");
    });
    scope.querySelectorAll("video").forEach((video) => {
      const poster = video.getAttribute("poster") || "";
      const source = video.currentSrc || video.src || "";
      if (source && !source.startsWith("blob:")) add("video", source, "Video", poster ? { posterUrl: normaliseMediaUrl(poster) } : {});
      else if (poster) add("video", poster, "Video preview", { posterUrl: normaliseMediaUrl(poster), playableOnSource: true });
      video.querySelectorAll("source[src]").forEach((node) => add("video", node.getAttribute("src") || "", "Video", poster ? { posterUrl: normaliseMediaUrl(poster) } : {}));
    });
    return media;
  }

  async function save(items) {
    if (!items.length) return;
    const response = await chrome.runtime.sendMessage({ type: "QUILL_CAPTURE_ITEMS", items });
    if (!response?.ok) throw new Error(response?.error || "Could not save to Quill.");
    return response.data;
  }

  // Browsing the feed is deliberately read-only. This only keeps highlights and
  // manual controls current; it never sends posts to Quill.
  function scheduleVisibleInspection() {
    if (inspectTimer) return;
    inspectTimer = setTimeout(() => { inspectTimer = null; void inspectVisible(); }, 180);
  }
  async function inspectVisible() {
    if (inspecting) { inspectQueued = true; return; }
    inspecting = true;
    try {
      for (const article of document.querySelectorAll("article")) {
        const item = extractArticle(article);
        if (!item) continue;
        const keywords = matchingKeywords(item.text || "");
        if (keywords.length) { item.matchedKeywords = keywords; markMatch(article); }
        addPostActions(article, item);
        if (profileCollector) collect(item);
      }
    } finally {
      inspecting = false;
      if (inspectQueued) { inspectQueued = false; scheduleVisibleInspection(); }
    }
  }
  async function captureVisibleMatches() {
    await loadRules();
    const matches = [];
    let inspected = 0;
    for (const article of document.querySelectorAll("article")) {
      const item = extractArticle(article);
      if (!item) continue;
      inspected += 1;
      const keywords = matchingKeywords(item.text || "");
      if (!keywords.length) continue;
      item.matchedKeywords = keywords;
      markMatch(article);
      addPostActions(article, item);
      if (!capturedUrls.has(item.url)) matches.push(item);
    }
    if (matches.length) {
      await save(matches);
      matches.forEach((item) => capturedUrls.add(item.url));
    }
    return { saved: matches.length, inspected };
  }
  function markMatch(article) { article.classList.add("quill-match"); }

  function addPostActions(article, item) {
    const nativeReply = article.querySelector('[data-testid="reply"]');
    const actionBar = nativeReply?.closest('[role="group"]') ?? article.querySelector('[role="group"]');
    if (!actionBar || actionBar.querySelector(".quill-list-action")) return;
    const actions = document.createElement("div");
    actions.className = "quill-actions";
    const add = document.createElement("button");
    add.className = "quill-action quill-list-action";
    add.textContent = "+ List";
    add.title = "Save this post, its media links, and article links to Quill";
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

  function createCollector(title, note) {
    removeCollector();
    collectorPanel = document.createElement("aside");
    collectorPanel.id = "quill-collector-panel";
    collectorPanel.innerHTML = '<div class="quill-collector-head"><span class="quill-collector-dot"></span><strong id="quill-collector-title"></strong></div><div class="quill-collector-row"><span>Collected</span><strong id="quill-collector-count">0</strong></div><p id="quill-collector-detail"></p><p class="quill-collector-note"></p>';
    document.body.appendChild(collectorPanel);
    updateCollector({ title, count: 0, detail: "Starting…", note });
  }
  function updateCollector({ title, count, detail, note }) {
    if (!collectorPanel) return;
    collectorPanel.querySelector("#quill-collector-title").textContent = title || "Quill collector";
    collectorPanel.querySelector("#quill-collector-count").textContent = String(count ?? 0);
    collectorPanel.querySelector("#quill-collector-detail").textContent = detail || "";
    if (note !== undefined) collectorPanel.querySelector(".quill-collector-note").textContent = note || "";
  }
  function removeCollector() { collectorPanel?.remove(); collectorPanel = null; }

  function startProfileCollector() {
    collected = new Map();
    createCollector("Profile capture", "Scroll normally. Quill keeps post text, media links, and article links.");
    void inspectVisible();
    profileCollector = new MutationObserver(() => { void inspectVisible(); });
    profileCollector.observe(document.body, { childList: true, subtree: true });
  }
  function stopProfileCollector() {
    profileCollector?.disconnect();
    profileCollector = null;
    updateCollector({ title: "Profile capture ready", count: collected.size, detail: "Saving in the Quill side panel…" });
  }
  function collect(item) {
    if (!item.url) return;
    const before = collected.size;
    collected.set(item.url, { ...item, raw: { ...item.raw, capture: "profile" } });
    if (collected.size !== before) updateCollector({ title: "Profile capture", count: collected.size, detail: "Collecting as you scroll" });
  }

  async function importArticlesFromCurrentTab() {
    articleImport = { running: true, found: 0, total: 0, saved: 0, failed: 0 };
    createCollector("Article import", "Quill discovers the Articles tab, opens each article in the background, and saves its body and media links.");
    const cleanup = await chrome.runtime.sendMessage({ type: "QUILL_CLEANUP_ARTICLES" });
    const archived = cleanup?.ok ? cleanup.data?.archived ?? 0 : 0;
    const urls = new Set(collectArticleLinksOnPage());
    let previousCount = urls.size;
    let stablePasses = 0;
    for (let pass = 0; pass < ARTICLE_DISCOVERY_SCROLLS && stablePasses < 6; pass += 1) {
      collectArticleLinksOnPage().forEach((url) => urls.add(url));
      articleImport.found = urls.size;
      updateCollector({ title: "Finding profile articles", count: urls.size, detail: `Reading the Articles tab · ${pass + 1}/${ARTICLE_DISCOVERY_SCROLLS}` });
      if (urls.size === previousCount) stablePasses += 1;
      else { stablePasses = 0; previousCount = urls.size; }
      window.scrollBy({ top: 700, behavior: "smooth" });
      await wait(850);
    }
    const selected = [...urls].slice(0, ARTICLE_IMPORT_LIMIT);
    articleImport.total = selected.length;
    for (let index = 0; index < selected.length; index += 1) {
      const url = selected[index];
      updateCollector({ title: "Saving profile articles", count: articleImport.saved, detail: `Opening article ${index + 1} of ${selected.length}` });
      try {
        const response = await chrome.runtime.sendMessage({ type: "QUILL_FETCH_ARTICLE", url });
        if (!response?.ok || !response.data?.item) throw new Error(response?.error || "Could not read article");
        await save([response.data.item]);
        articleImport.saved += 1;
      } catch {
        articleImport.failed += 1;
      }
      await wait(900);
    }
    articleImport.running = false;
    updateCollector({ title: "Article import complete", count: articleImport.saved, detail: `${articleImport.saved} saved${articleImport.failed ? ` · ${articleImport.failed} could not be read` : ""}${archived ? ` · ${archived} legacy wrapper${archived === 1 ? "" : "s"} archived` : ""}` });
    window.setTimeout(removeCollector, 6000);
  }
  function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

  void loadRules().then(() => {
    scheduleVisibleInspection();
    window.addEventListener("scroll", scheduleVisibleInspection, { passive: true });
    new MutationObserver(scheduleVisibleInspection).observe(document.body, { childList: true, subtree: true });
  });
})();
