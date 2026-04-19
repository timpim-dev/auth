# Felixx Identity Handoff

## What This Repo Is

This is the Felixx identity stack:

- `server/src/` is the Express OAuth and account API server.
- `apps/accounts/` is the first-party account portal SPA.
- `apps/example-client/` is a minimal OAuth client example.
- `pocketbase/collections.schema.json` describes the PocketBase collections this server expects.

## Current Setup

- PocketBase lives at `https://pocketbase.felixx.dev`.
- The PocketBase superuser email is `fake.felix@protonmail.com`.
- The superuser password is expected from the environment as `POCKETBASE_ADMIN_PASSWORD`.
- The auth server still uses the Felixx auth domain for its own issuer and frontend redirects.

## Important Env Vars

- `POCKETBASE_URL` should point to PocketBase, not the auth server.
- `POCKETBASE_ADMIN_EMAIL` and `POCKETBASE_ADMIN_PASSWORD` are required for all admin-backed reads and writes.
- `ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET` should be stable values in real deployments.
- `ALLOWED_ORIGINS` should include the first-party app origins that call the auth server.

## How The Server Works

- Login uses PocketBase users through `/authorize` and `/authorize/login`.
- Authorization codes, refresh tokens, connected apps, and usage records are stored in PocketBase collections.
- The admin client is created lazily in `server/src/lib/pocketbase.js` and re-used for PocketBase collection access.

## What To Check First If Something Breaks

- Verify `POCKETBASE_URL` is correct.
- Verify the PocketBase admin credentials are set.
- Verify the PocketBase collections exist and match `pocketbase/collections.schema.json`.
- Run `npm run check` before changing behavior.

## Notes For The Next Agent

- Do not assume the old `auth.felixx.dev` hostname is the PocketBase server.
- Keep the OAuth frontend URLs separate from the PocketBase URL.
- If you change the PocketBase schema, update the schema file and any collection names in `server/src/config.js`.
