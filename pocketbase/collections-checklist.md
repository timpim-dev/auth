# PocketBase Creation Checklist

Use this as a click-through guide in the PocketBase admin panel.

## Before You Start

- Open the PocketBase admin UI.
- Make sure you can sign in with an admin account.
- Keep [collections-guide.md](./collections-guide.md) open for field details.

## Step 1: Create the `users` Auth Collection

1. Click **New collection**.
2. Set **Name** to `users`.
3. Set **Type** to `Auth`.
4. Keep the default auth system fields:
   - `id`
   - `created`
   - `updated`
   - `username`
   - `email`
   - `emailVisibility`
   - `verified`
5. In the auth settings, enable email verification and make sure only verified users can sign in.
6. Create the collection.

Notes:

- This is the collection the server uses for email/password login.
- If you name it something else, update `PB_USERS_COLLECTION`.
- New users will receive a verification email after signup.

## Step 2: Create `oauth_clients`

1. Click **New collection**.
2. Set **Name** to `oauth_clients`.
3. Set **Type** to `Base`.
4. Add these fields:
   - `client_id`  
     - Type: `Plain text`
     - Required: yes
     - Unique: yes
   - `name`  
     - Type: `Plain text`
     - Required: yes
   - `redirect_uris`  
     - Type: `JSON`
     - Required: yes
   - `description`  
     - Type: `Plain text`
     - Required: no
   - `homepage_url`  
     - Type: `Url`
     - Required: no
   - `logo_url`  
     - Type: `Url`
     - Required: no
   - `is_active`  
     - Type: `Bool`
     - Required: yes
     - Default: `true`
5. Add this unique index:
   - `CREATE UNIQUE INDEX idx_oauth_clients_client_id ON oauth_clients (client_id)`
6. Create the collection.

## Step 3: Create `oauth_auth_codes`

1. Click **New collection**.
2. Set **Name** to `oauth_auth_codes`.
3. Set **Type** to `Base`.
4. Add these fields:
   - `code_hash`  
     - Type: `Plain text`
     - Required: yes
     - Unique: yes
   - `client`  
     - Type: `Relation`
     - Required: yes
     - Relation collection: `oauth_clients`
     - Max select: `1`
   - `user_id`  
     - Type: `Plain text`
     - Required: yes
   - `redirect_uri`  
     - Type: `Url`
     - Required: yes
   - `code_challenge`  
     - Type: `Plain text`
     - Required: yes
   - `code_challenge_method`  
     - Type: `Select`
     - Required: yes
     - Values: `S256`, `plain`
   - `scope`  
     - Type: `Plain text`
     - Required: no
   - `expires_at`  
     - Type: `DateTime`
     - Required: yes
   - `used_at`  
     - Type: `DateTime`
     - Required: no
   - `metadata`  
     - Type: `JSON`
     - Required: no
5. Add this unique index:
   - `CREATE UNIQUE INDEX idx_oauth_auth_codes_code_hash ON oauth_auth_codes (code_hash)`
6. Create the collection.

## Step 4: Create `oauth_refresh_tokens`

1. Click **New collection**.
2. Set **Name** to `oauth_refresh_tokens`.
3. Set **Type** to `Base`.
4. Add these fields:
   - `token_hash`  
     - Type: `Plain text`
     - Required: yes
     - Unique: yes
   - `jti`  
     - Type: `Plain text`
     - Required: yes
     - Unique: yes
   - `client`  
     - Type: `Relation`
     - Required: yes
     - Relation collection: `oauth_clients`
     - Max select: `1`
   - `user_id`  
     - Type: `Plain text`
     - Required: yes
   - `scope`  
     - Type: `Plain text`
     - Required: no
   - `session_id`  
     - Type: `Plain text`
     - Required: yes
   - `user_agent`  
     - Type: `Plain text`
     - Required: no
   - `ip`  
     - Type: `Plain text`
     - Required: no
   - `expires_at`  
     - Type: `DateTime`
     - Required: yes
   - `revoked_at`  
     - Type: `DateTime`
     - Required: no
   - `replaced_by_jti`  
     - Type: `Plain text`
     - Required: no
   - `last_used_at`  
     - Type: `DateTime`
     - Required: no
5. Add these unique indexes:
   - `CREATE UNIQUE INDEX idx_oauth_refresh_tokens_token_hash ON oauth_refresh_tokens (token_hash)`
   - `CREATE UNIQUE INDEX idx_oauth_refresh_tokens_jti ON oauth_refresh_tokens (jti)`
6. Create the collection.

## Step 5: Add the First OAuth Client

1. Open `oauth_clients`.
2. Click **New record**.
3. Set:
   - `client_id` = `felixx-accounts`
   - `name` = `Accounts`
   - `redirect_uris` = `["https://auth.felixx.dev/account/"]`
   - `is_active` = `true`
4. Save the record.

## Step 6: Verify Environment Variables

Make sure the auth server environment matches the collection names:

- `PB_USERS_COLLECTION=users`
- `PB_CLIENTS_COLLECTION=oauth_clients`
- `PB_AUTH_CODES_COLLECTION=oauth_auth_codes`
- `PB_REFRESH_TOKENS_COLLECTION=oauth_refresh_tokens`

## Quick Success Checklist

- `users` auth collection exists
- `oauth_clients` exists
- `oauth_auth_codes` exists
- `oauth_refresh_tokens` exists
- `felixx-accounts` client record exists
- redirect URI matches exactly
- auth server env vars match the collection names
