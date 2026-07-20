# Quill for X

The Quill browser companion replaces the old marketing extension. It scans and
highlights feed opportunities, captures profile/article context, prepares
campaign-profile replies through Quill, and opens a quick queue. It never
publishes to X.

## Private install

1. In Quill **Settings**, create a browser-companion token.
2. Open `chrome://extensions`, enable Developer Mode, and **Load unpacked**
   using this `extension/` directory.
3. On an X page, open **Quill for X** and paste the production API URL and the
   one-time token.

The token is stored in the browser extension's local storage. Revoke it from
Quill Settings whenever that browser should lose access. The Gemini key is
configured only in Quill's backend (`AI_PROVIDER=gemini`, `AI_API_KEY=…`), not
in this extension.

## What it can do

- Highlight match keywords while browsing without saving anything. Use **Scan feed** or an explicit post action to save a post.
- Capture the current post, a manually-scrolled profile, or the current page.
- Prepare a small batch of campaign-profile replies in Quill.
- **Prepare + open next 5** opens only posts whose reply is ready; use the
  injected **Quill Reply** button to place it in X's composer.
- Show and edit match/exclude/priority keywords in the side panel.

It cannot access Quill drafts outside research, schedule posts, or publish.
