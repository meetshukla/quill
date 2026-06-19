# Security Notes

This backend stores X access tokens, refresh tokens, scheduled writes, and AI prompts. Treat it as sensitive infrastructure even for a small self-hosted deployment.

## Token Storage

- Store X access and refresh tokens encrypted at rest.
- Keep `ENCRYPTION_KEY_BASE64` out of source control.
- Rotate the encryption key only with a migration plan for existing token rows.
- Never return encrypted or raw tokens from API routes.

## OAuth

- Use a confidential X app type: Web App, Automated App or Bot.
- Store PKCE code verifiers on the backend.
- Expire OAuth states after 10 minutes.
- Mark OAuth states consumed after callback success.
- Do not use a public/native X app for production backend posting.

## Automated Writes

- Assistant responses may suggest structured actions, but publishing must require explicit user action.
- Scheduled jobs and automation jobs should use idempotency keys.
- Auto-CTA and auto-repost jobs should write clear audit rows before and after posting.
- Failed writes should not retry forever.

## Analytics

- Analytics should be disabled by default.
- Analytics workers must respect the owned-read budget before making X API calls.
- Local analytics rows should expire after the configured retention period.

## Deployment

- Use HTTPS in production for all callbacks and frontend/backend traffic.
- Restrict CORS to the frontend origin.
- Add request logging, rate limiting, and structured error reporting before public deployment.
- Keep AI provider keys server-side only.
