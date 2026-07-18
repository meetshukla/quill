# Quill for X

The Quill browser companion captures user-selected X context and shows reply
proposals that Quill's agent has already created. It never publishes to X.

## Private install

1. In Quill **Settings**, create a browser-companion token.
2. Open `chrome://extensions`, enable Developer Mode, and **Load unpacked**
   using this `extension/` directory.
3. On an X page, open **Quill for X** and paste the production API URL and the
   one-time token.

The token is stored in the browser extension's local storage. Revoke it from
Quill Settings whenever that browser should lose access.

## What it can do

- Capture the current post or visible keyword matches.
- Send captures only to that Quill user's private research inbox.
- Show agent-created reply proposals and copy them to the clipboard.

It cannot access Quill drafts outside research, schedule posts, or publish.
