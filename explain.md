# Felixx Identity Explained

This folder is a clean, separate implementation of the identity system you asked for:

- `auth.felixx.dev` is the OAuth server
- `accounts.felixx.dev` is the account portal
- PocketBase is the database and user store

The goal of this document is to explain how the parts fit together so you can extend it yourself.

## 1. Big Picture

There are four pieces:

1. PocketBase stores users, OAuth clients, auth codes, refresh tokens, and AI usage records.
2. The Express server in `server/src/` implements the OAuth logic and account APIs.
3. The accounts SPA in `apps/accounts/` is a static frontend that signs in through OAuth.
4. The example app in `apps/example-client/` shows how another Felixx app can integrate with the auth server.

Why this split matters:

- PocketBase is good at persistence and user records.
- Express is where you keep custom OAuth rules.
- The accounts site stays lightweight because it is just static HTML/CSS/JS.

## 2. Folder Structure

```text
felixx-identity/
  pocketbase/
    collections.schema.json
  server/
    src/
      app.js
      config.js
      lib/
      views/
  apps/
    accounts/
    example-client/
  explain.md
```

What each part does:

- `pocketbase/collections.schema.json`
  Defines the collections you need to create in PocketBase.
- `server/src/app.js`
  Main Express app with OAuth endpoints and account endpoints.
- `server/src/lib/oauth.js`
  Token signing, PKCE verification, hashing, helpers.
- `server/src/lib/pocketbase.js`
  All PocketBase reads/writes are centralized here.
- `server/src/views/loginPage.js`
  Minimal login screen for `/authorize`.
- `apps/accounts/`
  The user portal.
- `apps/example-client/`
  A demo app that performs the OAuth flow.

## 3. PocketBase Schema

The key custom collections are:

### `oauth_clients`

This is your client registry.

It stores:

- `client_id`
- `name`
- `redirect_uris`
- optional branding fields
- `is_active`

Why it exists:

- OAuth must verify that a client is known
- OAuth must verify that the `redirect_uri` is registered for that client

### `oauth_auth_codes`

This stores temporary authorization codes.

It stores:

- hashed auth code
- which client requested it
- which user authenticated
- redirect URI
- PKCE challenge
- expiry
- whether it was already used

Why it exists:

- Authorization codes should be one-time use
- They should expire quickly
- The server must compare the later `code_verifier` against the stored PKCE challenge

### `oauth_refresh_tokens`

This stores long-lived refresh token state.

It stores:

- hashed refresh token
- `jti`
- user id
- client id
- session id
- user agent / IP
- expiry
- revocation status

Why it exists:

- JWTs are stateless by themselves
- But revocation needs server-side state
- This collection gives you "log out this app" and "log out this device"

### `ai_usage`

This is for the accounts portal.

It stores:

- `user_id`
- app name
- model
- request count
- tokens used
- usage period

Why it exists:

- The portal can summarize AI usage without mixing that concern into OAuth collections

## 4. OAuth Flow in This Project

This implementation uses Authorization Code + PKCE.

### Step A: Client sends user to `/authorize`

Example request:

```text
GET /authorize
  ?response_type=code
  &client_id=felixx-accounts
  &redirect_uri=https://accounts.felixx.dev/
  &code_challenge=...
  &code_challenge_method=S256
  &scope=openid profile email offline_access
  &state=...
```

What the server does:

1. Checks `response_type=code`
2. Loads the client from PocketBase
3. Verifies the redirect URI is registered
4. Renders the minimal login page

Relevant code:

- `server/src/app.js` in `GET /authorize`
- `server/src/views/loginPage.js`

### Step B: User logs in

The login form posts to:

```text
POST /authorize/login
```

What happens:

1. Email/password are checked against the PocketBase users collection
2. A random auth code is generated
3. Only the hash of that code is stored in PocketBase
4. The browser is redirected back to the client with `?code=...&state=...`

Why store the hash instead of the raw code:

- If the database is leaked, raw codes should not be usable

### Step C: Client exchanges code for tokens

Request:

```text
POST /token
grant_type=authorization_code
```

What the server checks:

1. The auth code exists
2. It is not expired
3. It was not used before
4. It belongs to the right client
5. The redirect URI matches
6. The PKCE verifier matches the stored challenge

If valid, the server issues:

- access token JWT
- refresh token JWT

And it stores the refresh token hash in PocketBase.

### Step D: Access token is used on APIs

The SPA or client app sends:

```http
Authorization: Bearer <access token>
```

Used on:

- `GET /userinfo`
- `/api/account/*`

### Step E: Refresh token rotates

When the access token expires, the client sends:

```text
POST /token
grant_type=refresh_token
```

This implementation rotates refresh tokens:

1. Old refresh token is checked
2. Old token record is marked revoked
3. A new refresh token is minted
4. A new DB record is created

Why rotate:

- It reduces replay risk
- It gives you a better security trail

### Step F: Revoke

`POST /revoke` marks the refresh token as revoked in PocketBase.

That is what powers:

- sign out from the portal
- revoke connected app access
- log out a specific session

## 5. Token Design

There are two JWT types in `server/src/lib/oauth.js`.

### Access token

Short lifetime.

Contains:

- `sub` user id
- `aud` client id
- `scope`
- `sid` session id
- display profile fields for convenience
- `type: "access"`

Used for:

- API authorization

### Refresh token

Long lifetime.

Contains:

- `sub`
- `aud`
- `scope`
- `sid`
- `type: "refresh"`
- `jti`

Used for:

- getting a new access token

Important detail:

- Even though it is a JWT, revocation still depends on the PocketBase record

## 6. Why PKCE Matters

PKCE protects the authorization code flow.

The client creates:

- `code_verifier` = secret random string
- `code_challenge` = hashed form of that string

The server stores the challenge during authorization.
Later, during token exchange, the client proves possession of the original verifier.

That means:

- stealing the authorization code alone is not enough

The logic is in:

- `server/src/lib/oauth.js` -> `verifyPkce()`

## 7. Accounts Portal

The portal is in `apps/accounts/`.

It is just a static SPA. It does not need its own backend if it can call the auth server over CORS.

Main responsibilities:

- start OAuth login
- hold access and refresh tokens in browser storage
- call account APIs
- refresh tokens when access token expires
- render profile/apps/usage/sessions

Main files:

- `apps/accounts/index.html`
- `apps/accounts/styles.css`
- `apps/accounts/app.js`

### How login works in the portal

In `app.js`:

1. `startLogin()` generates PKCE values
2. Browser is sent to `/authorize`
3. After redirect back, `maybeCompleteOAuthCallback()` exchanges the code at `/token`
4. Tokens are stored in `localStorage`

### How profile editing works

The portal calls:

- `GET /api/account/profile`
- `PATCH /api/account/profile`

That route is protected by the access token.

### How password change works

The portal calls:

- `POST /api/account/password`

The server re-checks the current password before updating the user.

### How connected apps work

The portal calls:

- `GET /api/account/apps`
- `POST /api/account/apps/:clientId/revoke`

The data comes from grouping refresh token records by client.

### How sessions work

The portal calls:

- `GET /api/account/sessions`
- `POST /api/account/sessions/:sessionId/logout`

Sessions are represented by refresh-token-backed session ids.

### How AI usage works

The portal calls:

- `GET /api/account/usage`

The server reads the `ai_usage` collection and calculates totals.

## 8. Example Client

The demo app is in `apps/example-client/`.

Use it to understand the flow outside the account portal.

It shows:

- how to generate PKCE in the browser
- how to redirect to `/authorize`
- how to exchange the code at `/token`
- how to call `/userinfo`
- how to refresh and revoke tokens

If you want to integrate another Felixx app later, this example is the fastest reference.

## 9. Important Security Notes

This project is a good first-party OAuth foundation, but you should understand the tradeoffs.

### Good parts already included

- Authorization Code + PKCE
- one-time auth codes
- refresh token persistence
- refresh token revocation
- refresh token rotation
- trusted client registry

### Gaps you may want to add next

- rate limiting on `/authorize/login` and `/token`
- CSRF protection if you later add cookie-based login
- stronger audit logging
- support for uploaded avatars instead of just `avatarUrl`
- a proper `.well-known/openid-configuration`
- optional JWKS endpoint if third-party token verification is needed
- secure cookie session for the auth login screen if you want SSO across first-party apps

## 10. Deployment Model

Your stated deployment is:

- same NAS
- behind Nginx
- PocketBase already running at `auth.felixx.dev`

One practical setup is:

1. PocketBase stays on an internal port
2. This Express app runs on another internal port
3. Nginx routes:
   - `auth.felixx.dev` -> Express for OAuth/account API
   - `accounts.felixx.dev` -> static `apps/accounts/`
4. Express talks to PocketBase using the admin credentials in `.env`

That keeps:

- frontend simple
- secret logic server-side
- PocketBase off the public app surface except where you choose

## 11. What To Read First In Code

If you want to learn this codebase in order:

1. `server/src/app.js`
2. `server/src/lib/oauth.js`
3. `server/src/lib/pocketbase.js`
4. `apps/accounts/app.js`
5. `apps/example-client/app.js`
6. `pocketbase/collections.schema.json`

That order moves from request flow, to token logic, to database logic, to frontend usage.

## 12. Suggested Next Improvements

If you want me to continue after this, the highest-value next steps are:

1. add a real PocketBase schema import script instead of the JSON notes file
2. add rate limiting and login attempt throttling
3. add avatar file upload support
4. add Nginx config and systemd service files
5. add an install script that seeds `oauth_clients`

## 13. One Simple Mental Model

If you want to remember the system in one sentence:

PocketBase stores identity state, Express enforces OAuth rules, and the accounts SPA is just a browser client of that auth server.
