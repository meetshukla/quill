(() => {
  if (window.__quillXLoaded) return;
  window.__quillXLoaded = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === "QUILL_CAPTURE_CURRENT") {
      sendResponse({ item: captureCurrent() });
      return false;
    }
    if (message.type === "QUILL_CAPTURE_VISIBLE") {
      sendResponse({ items: [...document.querySelectorAll("article")].map(extractArticle).filter(Boolean) });
      return false;
    }
    return false;
  });

  function captureCurrent() {
    const direct = [...document.querySelectorAll("article")].find((article) => article.querySelector('a[href*="/status/"]'));
    return direct ? extractArticle(direct) : null;
  }

  function extractArticle(article) {
    const postLink = [...article.querySelectorAll('a[href*="/status/"]')]
      .map((anchor) => anchor.href)
      .find((href) => /\/(?:i\/web\/)?status\/\d+/.test(href));
    if (!postLink) return null;
    const xPostId = postLink.match(/\/status\/(\d+)/)?.[1];
    const text = [...article.querySelectorAll('[data-testid="tweetText"]')]
      .map((node) => node.innerText)
      .join("\n")
      .trim();
    const handle = [...article.querySelectorAll('a[href^="/"]')]
      .map((anchor) => anchor.getAttribute("href")?.split("/")[1])
      .find((value) => value && !["home", "search", "i", "compose"].includes(value));
    const authorName = article.querySelector('[data-testid="User-Name"]')?.innerText?.split("\n")[0]?.trim();
    return {
      type: "POST",
      url: postLink.replace(/[?#].*$/, ""),
      xPostId,
      sourceHandle: handle,
      authorName,
      text,
      raw: { capturedFrom: "quill-x-companion", capturedAt: new Date().toISOString() }
    };
  }
})();
