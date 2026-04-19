# Felixx Accounts SPA

Static account portal for `accounts.felixx.dev`.

## Files

- `index.html`: single-page shell and sections for profile, password, apps, usage, and sessions
- `styles.css`: responsive visual system
- `app.js`: OAuth PKCE login flow, token storage, API client, and view logic

## Expected OAuth configuration

- OAuth client id: `felixx-accounts`
- Redirect URI: the deployed portal URL, typically `https://accounts.felixx.dev/`
- Auth server base URL: `https://auth.felixx.dev`
- The page injects the client settings through `window.FELIXX_AUTH_CONFIG`
- Shared OAuth helpers live in `apps/shared/oauth.js`

## Expected API surface

- `GET /authorize`
- `POST /token`
- `POST /revoke`
- `GET /userinfo`
- `PATCH /api/account/profile`
- `POST /api/account/password`
- `GET /api/account/apps`
- `POST /api/account/apps/:id/revoke`
- `GET /api/account/usage`
- `GET /api/account/sessions`
- `POST /api/account/sessions/:id/logout`

## Notes

- Access and refresh tokens are stored in `localStorage`.
- PKCE verifier and OAuth state are stored in `sessionStorage`.
- The SPA assumes CORS is enabled from `accounts.felixx.dev` to `auth.felixx.dev`.
