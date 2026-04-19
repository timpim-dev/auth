# Felixx Identity

Two-part identity system for Felixx:

- `auth.felixx.dev`: OAuth 2.0 Authorization Code + PKCE server backed by PocketBase
- `accounts.felixx.dev`: lightweight account portal SPA
- `pocketbase.felixx.dev`: PocketBase instance that stores users and OAuth records

## Project Layout

- `pocketbase/collections.schema.json`: PocketBase collections to create
- `server/`: Express auth server and account APIs
- `apps/accounts/`: static account portal
- `apps/example-client/`: minimal OAuth client integration example
- `apps/shared/oauth.js`: browser-side OAuth helpers used by multiple clients
- `public/wiki/`: detailed Vercel deployment and integration guide at `/wiki`

## Environment

Copy `.env.example` to `.env` and set:

- `POCKETBASE_URL=https://pocketbase.felixx.dev`
- `POCKETBASE_ADMIN_EMAIL=fake.felix@protonmail.com`
- PocketBase admin password
- JWT secrets
- first-party allowed origins

## Run

```bash
npm install
cp .env.example .env
# then edit .env with your PocketBase admin credentials and JWT secrets
npm run dev
```

If you skip `.env`, the server now boots with default dev values, but any route that needs PocketBase admin access will return a clear configuration error until you set:

- `POCKETBASE_URL`
- `POCKETBASE_ADMIN_EMAIL`
- `POCKETBASE_ADMIN_PASSWORD`
- ideally stable `ACCESS_TOKEN_SECRET`
- ideally stable `REFRESH_TOKEN_SECRET`

## Expected Nginx Routing

- `auth.felixx.dev` -> Node service on this project
- `accounts.felixx.dev` -> static files from `apps/accounts/`
- `/wiki` -> the in-repo deployment guide page

The accounts SPA calls `https://auth.felixx.dev` for OAuth and account APIs.
# auth
