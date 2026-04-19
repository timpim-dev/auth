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
- `PB_USAGE_COLLECTION` = `ai_usage`

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
- Verification: optional for your deployment, but the app supports the `verified` flag

Notes:

- The server uses `collection("users").authWithPassword(email, password)`.
- If you want a different auth collection name, update `PB_USERS_COLLECTION`.

## 2. `oauth_clients`

Type:

- `Base` collection

Purpose:

- Registry of OAuth clients that are allowed to use Felixx Identity.

Fields:

1. `client_id`
   - Type: `Text`
   - Required: yes
   - Unique: yes

2. `name`
   - Type: `Text`
   - Required: yes

3. `redirect_uris`
   - Type: `JSON`
   - Required: yes

4. `description`
   - Type: `Text`
   - Required: no

5. `homepage_url`
   - Type: `URL`
   - Required: no

6. `logo_url`
   - Type: `URL`
   - Required: no

7. `is_active`
   - Type: `Bool`
   - Required: yes
   - Default: `true`

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

1. `code_hash`
   - Type: `Text`
   - Required: yes
   - Unique: yes

2. `client`
   - Type: `Relation`
   - Required: yes
   - Collection: `oauth_clients`
   - Max select: `1`

3. `user_id`
   - Type: `Text`
   - Required: yes

4. `redirect_uri`
   - Type: `URL`
   - Required: yes

5. `code_challenge`
   - Type: `Text`
   - Required: yes

6. `code_challenge_method`
   - Type: `Select`
   - Required: yes
   - Values: `S256`, `plain`

7. `scope`
   - Type: `Text`
   - Required: no

8. `expires_at`
   - Type: `Date`
   - Required: yes

9. `used_at`
   - Type: `Date`
   - Required: no

10. `metadata`
    - Type: `JSON`
    - Required: no

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

1. `token_hash`
   - Type: `Text`
   - Required: yes
   - Unique: yes

2. `jti`
   - Type: `Text`
   - Required: yes
   - Unique: yes

3. `client`
   - Type: `Relation`
   - Required: yes
   - Collection: `oauth_clients`
   - Max select: `1`

4. `user_id`
   - Type: `Text`
   - Required: yes

5. `scope`
   - Type: `Text`
   - Required: no

6. `session_id`
   - Type: `Text`
   - Required: yes

7. `user_agent`
   - Type: `Text`
   - Required: no

8. `ip`
   - Type: `Text`
   - Required: no

9. `expires_at`
   - Type: `Date`
   - Required: yes

10. `revoked_at`
    - Type: `Date`
    - Required: no

11. `replaced_by_jti`
    - Type: `Text`
    - Required: no

12. `last_used_at`
    - Type: `Date`
    - Required: no

Indexes:

```sql
CREATE UNIQUE INDEX idx_oauth_refresh_tokens_token_hash ON oauth_refresh_tokens (token_hash)
CREATE UNIQUE INDEX idx_oauth_refresh_tokens_jti ON oauth_refresh_tokens (jti)
```

Notes:

- The server stores `sha256(raw_refresh_token)` in `token_hash`.
- Token rotation marks the old record as revoked and stores the next `jti`.
- `session_id` is what the account portal uses to show active sessions.

## 5. `ai_usage`

Type:

- `Base` collection

Purpose:

- Stores usage records shown in the accounts portal.

Fields:

1. `user_id`
   - Type: `Text`
   - Required: yes

2. `app_name`
   - Type: `Text`
   - Required: yes

3. `model`
   - Type: `Text`
   - Required: no

4. `request_count`
   - Type: `Number`
   - Required: yes
   - Min: `0`
   - Default: `0`

5. `tokens_used`
   - Type: `Number`
   - Required: yes
   - Min: `0`
   - Default: `0`

6. `period_start`
   - Type: `Date`
   - Required: yes

7. `period_end`
   - Type: `Date`
   - Required: yes

8. `metadata`
   - Type: `JSON`
   - Required: no

Indexes:

```sql
CREATE INDEX idx_ai_usage_user_period ON ai_usage (user_id, period_start, period_end)
```

Notes:

- This collection is read by the `/api/account/usage` endpoint.
- Records are grouped and summed in the accounts portal.

## Setup Checklist

1. Create the auth collection `users`.
2. Create the base collections:
   - `oauth_clients`
   - `oauth_auth_codes`
   - `oauth_refresh_tokens`
   - `ai_usage`
3. Add the required indexes.
4. Create at least one OAuth client record.
5. Set the server env vars to match your PocketBase collection names.
6. Verify the PocketBase admin account can log in from the auth server.

## Minimal OAuth Client Record

For the first-party Felixx accounts portal, create this client:

- `client_id`: `felixx-accounts`
- `name`: `Accounts`
- `redirect_uris`: `["https://auth.felixx.dev/account/"]`
- `is_active`: `true`

## Code References

- `server/src/config.js`
- `server/src/lib/pocketbase.js`
- `pocketbase/collections.schema.json`

