# PocketBase Collections Guide

This file documents the PocketBase collections required by Felixx Identity, including the field definitions, collection type, indexes, and the app configuration that must match them.

## Global Rules

- The built-in auth collection must be named `users` unless you change `PB_USERS_COLLECTION`.
- The auth server reads collection names from environment variables in `server/src/config.js`.
- The defaults in this repo assume the collection names below exactly.
- The auth server expects `redirect_uris` to contain exact, fully-qualified URLs.
- The auth server stores only hashed authorization codes and refresh tokens.

## Environment Variables That Must Match

These are the collection-name env vars used by the server:

- `PB_USERS_COLLECTION` = `users`
- `PB_CLIENTS_COLLECTION` = `oauth_clients`
- `PB_AUTH_CODES_COLLECTION` = `oauth_auth_codes`
- `PB_REFRESH_TOKENS_COLLECTION` = `oauth_refresh_tokens`

If you rename any collection in PocketBase, update the matching env var in the deployment.

## 1. `users`

Type:

- `Auth` collection

Purpose:

- Stores all user accounts for Felixx Identity.
- Used for email/password login in `/authorize/login`.
- Used for password changes and profile updates in the account APIs.

System fields:

- `id`
- `created`
- `updated`
- `username`
- `email`
- `emailVisibility`
- `verified`

Required auth settings:

- Collection name: `users`
- Authentication method: email/password
- Password login enabled: yes
- Signup: as you prefer for your deployment
- Verification: enabled
- Only verified users can sign in: yes
- If you keep this off, the auth server still blocks unverified logins in code

Notes:

- The server uses `collection("users").authWithPassword(email, password)`.
- If you want a different auth collection name, update `PB_USERS_COLLECTION`.
- After registration, the server sends a verification email and waits for the user to confirm before sign-in.

## 2. `oauth_clients`

Type:

- `Base` collection

Purpose:

- Registry of OAuth clients that are allowed to use Felixx Identity.

Fields:

| Field | PocketBase UI type | Required | Notes |
| --- | --- | --- | --- |
| `client_id` | Plain text | Yes | Must be unique |
| `name` | Plain text | Yes | Human-readable client name |
| `redirect_uris` | JSON | Yes | Store a JSON array of full URLs |
| `description` | Plain text | No | Optional description |
| `homepage_url` | Url | No | Optional website URL |
| `logo_url` | Url | No | Optional logo URL |
| `is_active` | Bool | Yes | Default `true` |

Indexes:

```sql
CREATE UNIQUE INDEX idx_oauth_clients_client_id ON oauth_clients (client_id)
```

Required record example:

```json
{
  "client_id": "felixx-accounts",
  "name": "Accounts",
  "redirect_uris": ["https://auth.felixx.dev/account/"],
  "description": "",
  "homepage_url": "",
  "logo_url": "",
  "is_active": true
}
```

Notes:

- `redirect_uris` must be valid JSON.
- The redirect URI must match exactly, including trailing slash and scheme.
- `findClientByClientId()` only accepts clients where `is_active = true`.

## 3. `oauth_auth_codes`

Type:

- `Base` collection

Purpose:

- Temporary storage for authorization codes.
- Codes are one-time use and expire quickly.

Fields:

| Field | PocketBase UI type | Required | Notes |
| --- | --- | --- | --- |
| `code_hash` | Plain text | Yes | Must be unique |
| `client` | Relation | Yes | Relation to `oauth_clients`, max select `1` |
| `user_id` | Plain text | Yes | PocketBase user record id |
| `redirect_uri` | Url | Yes | Exact redirect URL |
| `code_challenge` | Plain text | Yes | PKCE challenge |
| `code_challenge_method` | Select | Yes | Allowed values: `S256`, `plain` |
| `scope` | Plain text | No | Space-separated scopes |
| `expires_at` | DateTime | Yes | Expiration timestamp |
| `used_at` | DateTime | No | Set when consumed |
| `metadata` | JSON | No | User agent and IP data |

Indexes:

```sql
CREATE UNIQUE INDEX idx_oauth_auth_codes_code_hash ON oauth_auth_codes (code_hash)
```

Notes:

- The server stores `sha256(code)` in `code_hash`.
- The raw code is never stored.
- The code is rejected if `used_at` is set or `expires_at` is in the past.

## 4. `oauth_refresh_tokens`

Type:

- `Base` collection

Purpose:

- Server-side state for refresh token rotation, revocation, and session tracking.

Fields:

| Field | PocketBase UI type | Required | Notes |
| --- | --- | --- | --- |
| `token_hash` | Plain text | Yes | Must be unique |
| `jti` | Plain text | Yes | Must be unique |
| `client` | Relation | Yes | Relation to `oauth_clients`, max select `1` |
| `user_id` | Plain text | Yes | PocketBase user record id |
| `scope` | Plain text | No | Space-separated scopes |
| `session_id` | Plain text | Yes | Session id used by the account portal |
| `user_agent` | Plain text | No | Browser user agent |
| `ip` | Plain text | No | IP address |
| `expires_at` | DateTime | Yes | Expiration timestamp |
| `revoked_at` | DateTime | No | Set when revoked |
| `replaced_by_jti` | Plain text | No | Next token id after rotation |
| `last_used_at` | DateTime | No | Updated on use |

Indexes:

```sql
CREATE UNIQUE INDEX idx_oauth_refresh_tokens_token_hash ON oauth_refresh_tokens (token_hash)
CREATE UNIQUE INDEX idx_oauth_refresh_tokens_jti ON oauth_refresh_tokens (jti)
```

Notes:

- The server stores `sha256(raw_refresh_token)` in `token_hash`.
- Token rotation marks the old record as revoked and stores the next `jti`.
- `session_id` is what the account portal uses to show active sessions.

## Setup Checklist

1. Create the auth collection `users`.
2. In the auth settings, enable email/password sign-in and turn on email verification.
3. Create the base collections:
   - `oauth_clients`
   - `oauth_auth_codes`
   - `oauth_refresh_tokens`
4. Add the required indexes.
5. Create at least one OAuth client record.
6. Set the server env vars to match your PocketBase collection names.
7. Verify the PocketBase admin account can log in from the auth server.

## Minimal OAuth Client Record

For the first-party Felixx accounts portal, create this client:

- `client_id`: `felixx-accounts`
- `name`: `Accounts`
- `redirect_uris`: `["https://auth.felixx.dev/account/"]`
- `is_active`: `true`

## PocketBase UI Cheat Sheet

Use these field types when clicking through the PocketBase admin:

- `Plain text` = simple string field
- `Url` = PocketBase URL field
- `DateTime` = date/time picker field
- `Select` = dropdown field with fixed values
- `Relation` = link to another collection
- `JSON` = JSON editor field
- `Bool` = true/false toggle
- `Number` = numeric field

## Code References

- `server/src/config.js`
- `server/src/lib/pocketbase.js`
- `pocketbase/collections.schema.json`
