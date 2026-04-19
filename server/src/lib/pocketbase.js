import PocketBase from "pocketbase";
import { config } from "../config.js";
import { HttpError, assert } from "./errors.js";
import { buildAvatarUrl, isoDateFromNow, randomOpaqueToken, sha256 } from "./oauth.js";

const adminClient = new PocketBase(config.pocketbaseUrl);

async function getAdminClient() {
  assert(
    config.pocketbaseAdminEmail && config.pocketbaseAdminPassword,
    500,
    "server_configuration_error",
    "Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env."
  );

  if (!adminClient.authStore.isValid) {
    await adminClient.admins.authWithPassword(
      config.pocketbaseAdminEmail,
      config.pocketbaseAdminPassword
    );
  }

  return adminClient;
}

function normalizeClient(record) {
  const redirectUris = Array.isArray(record.redirect_uris)
    ? record.redirect_uris
    : typeof record.redirect_uris === "string"
      ? JSON.parse(record.redirect_uris)
      : [];

  return {
    id: record.id,
    clientId: record.client_id,
    name: record.name,
    redirectUris,
    description: record.description || "",
    logoUrl: record.logo_url || "",
    homepageUrl: record.homepage_url || ""
  };
}

export async function findClientByClientId(clientId) {
  const pb = await getAdminClient();
  try {
    const record = await pb
      .collection(config.clientsCollection)
      .getFirstListItem(`client_id = "${clientId}" && is_active = true`);
    return normalizeClient(record);
  } catch (error) {
    throw new HttpError(400, "invalid_client", "Unknown or inactive client.");
  }
}

export async function validateClientRedirectUri(clientId, redirectUri) {
  const client = await findClientByClientId(clientId);
  assert(
    client.redirectUris.includes(redirectUri),
    400,
    "invalid_request",
    "Unregistered redirect_uri."
  );
  return client;
}

export async function authenticateUser(email, password) {
  const pb = new PocketBase(config.pocketbaseUrl);

  try {
    const auth = await pb.collection(config.usersCollection).authWithPassword(email, password);
    const user = auth.record;
    return {
      ...user,
      avatarUrl: buildAvatarUrl(user)
    };
  } catch (error) {
    throw new HttpError(401, "access_denied", "Invalid email or password.");
  }
}

export async function getUserById(userId) {
  const pb = await getAdminClient();
  const record = await pb.collection(config.usersCollection).getOne(userId);
  return {
    ...record,
    avatarUrl: buildAvatarUrl(record)
  };
}

export async function createAuthorizationCode({
  client,
  userId,
  redirectUri,
  codeChallenge,
  codeChallengeMethod,
  scope,
  metadata
}) {
  const pb = await getAdminClient();
  const code = randomOpaqueToken(32);

  await pb.collection(config.authCodesCollection).create({
    code_hash: sha256(code),
    client: client.id,
    user_id: userId,
    redirect_uri: redirectUri,
    code_challenge: codeChallenge,
    code_challenge_method: codeChallengeMethod,
    scope,
    expires_at: isoDateFromNow(config.authCodeTtlSeconds),
    metadata
  });

  return code;
}

export async function consumeAuthorizationCode(code) {
  const pb = await getAdminClient();

  try {
    const record = await pb
      .collection(config.authCodesCollection)
      .getFirstListItem(`code_hash = "${sha256(code)}"`);

    assert(!record.used_at, 400, "invalid_grant", "Authorization code already used.");
    assert(
      new Date(record.expires_at).getTime() > Date.now(),
      400,
      "invalid_grant",
      "Authorization code expired."
    );

    await pb.collection(config.authCodesCollection).update(record.id, {
      used_at: new Date().toISOString()
    });

    return record;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw new HttpError(400, "invalid_grant", "Unknown authorization code.");
  }
}

export async function createRefreshTokenRecord({
  rawToken,
  jti,
  client,
  userId,
  scope,
  sessionId,
  userAgent,
  ip
}) {
  const pb = await getAdminClient();

  return pb.collection(config.refreshTokensCollection).create({
    token_hash: sha256(rawToken),
    jti,
    client: client.id,
    user_id: userId,
    scope,
    session_id: sessionId,
    user_agent: userAgent || "",
    ip: ip || "",
    expires_at: isoDateFromNow(config.refreshTokenTtlSeconds),
    last_used_at: new Date().toISOString()
  });
}

export async function findRefreshTokenRecord(rawToken) {
  const pb = await getAdminClient();

  try {
    return await pb
      .collection(config.refreshTokensCollection)
      .getFirstListItem(`token_hash = "${sha256(rawToken)}"`, {
        expand: "client"
      });
  } catch (error) {
    throw new HttpError(401, "invalid_grant", "Unknown refresh token.");
  }
}

export async function rotateRefreshTokenRecord(currentRecord, nextToken, nextJti) {
  const pb = await getAdminClient();
  await pb.collection(config.refreshTokensCollection).update(currentRecord.id, {
    revoked_at: new Date().toISOString(),
    replaced_by_jti: nextJti,
    last_used_at: new Date().toISOString()
  });

  const client = await pb.collection(config.clientsCollection).getOne(currentRecord.client);

  const nextRecord = await pb.collection(config.refreshTokensCollection).create({
    token_hash: sha256(nextToken),
    jti: nextJti,
    client: currentRecord.client,
    user_id: currentRecord.user_id,
    scope: currentRecord.scope,
    session_id: currentRecord.session_id,
    user_agent: currentRecord.user_agent,
    ip: currentRecord.ip,
    expires_at: isoDateFromNow(config.refreshTokenTtlSeconds),
    last_used_at: new Date().toISOString()
  });

  return {
    record: nextRecord,
    client: normalizeClient(client)
  };
}

export async function revokeRefreshToken(rawToken) {
  const pb = await getAdminClient();
  const record = await findRefreshTokenRecord(rawToken);
  if (!record.revoked_at) {
    await pb.collection(config.refreshTokensCollection).update(record.id, {
      revoked_at: new Date().toISOString()
    });
  }
  return record;
}

export async function listUserClientSessions(userId) {
  const pb = await getAdminClient();
  const result = await pb.collection(config.refreshTokensCollection).getFullList({
    sort: "-created",
    filter: `user_id = "${userId}"`,
    expand: "client"
  });

  return result.map((record) => ({
    id: record.id,
    sessionId: record.session_id,
    clientId: record.expand?.client?.client_id || "",
    clientName: record.expand?.client?.name || "Unknown app",
    scope: record.scope || "",
    userAgent: record.user_agent || "",
    ip: record.ip || "",
    expiresAt: record.expires_at,
    revokedAt: record.revoked_at || null,
    lastUsedAt: record.last_used_at || record.updated,
    created: record.created
  }));
}

export async function listConnectedApps(userId) {
  const sessions = await listUserClientSessions(userId);
  const apps = new Map();

  for (const session of sessions) {
    const existing = apps.get(session.clientId) || {
      clientId: session.clientId,
      name: session.clientName,
      activeSessions: 0,
      revokedSessions: 0,
      lastUsedAt: session.lastUsedAt
    };

    if (session.revokedAt) {
      existing.revokedSessions += 1;
    } else {
      existing.activeSessions += 1;
    }

    if (!existing.lastUsedAt || new Date(session.lastUsedAt) > new Date(existing.lastUsedAt)) {
      existing.lastUsedAt = session.lastUsedAt;
    }

    apps.set(session.clientId, existing);
  }

  return Array.from(apps.values()).sort(
    (left, right) => new Date(right.lastUsedAt) - new Date(left.lastUsedAt)
  );
}

export async function revokeAppSessions(userId, clientId) {
  const pb = await getAdminClient();
  const client = await findClientByClientId(clientId);
  const records = await pb.collection(config.refreshTokensCollection).getFullList({
    filter: `user_id = "${userId}" && client = "${client.id}" && revoked_at = ""`
  });

  await Promise.all(
    records.map((record) =>
      pb.collection(config.refreshTokensCollection).update(record.id, {
        revoked_at: new Date().toISOString()
      })
    )
  );

  return records.length;
}

export async function revokeSession(userId, sessionId) {
  const pb = await getAdminClient();
  const records = await pb.collection(config.refreshTokensCollection).getFullList({
    filter: `user_id = "${userId}" && session_id = "${sessionId}" && revoked_at = ""`
  });

  await Promise.all(
    records.map((record) =>
      pb.collection(config.refreshTokensCollection).update(record.id, {
        revoked_at: new Date().toISOString()
      })
    )
  );

  return records.length;
}

export async function updateUserProfile(userId, payload) {
  const pb = await getAdminClient();
  const record = await pb.collection(config.usersCollection).update(userId, payload);
  return {
    ...record,
    avatarUrl: buildAvatarUrl(record)
  };
}

export async function changeUserPassword(userId, email, currentPassword, nextPassword) {
  await authenticateUser(email, currentPassword);
  await updateUserProfile(userId, {
    password: nextPassword,
    passwordConfirm: nextPassword
  });
}

export async function listUsageForUser(userId) {
  const pb = await getAdminClient();
  const records = await pb.collection(config.usageCollection).getFullList({
    filter: `user_id = "${userId}"`,
    sort: "-period_end"
  });

  const totals = records.reduce(
    (accumulator, record) => {
      accumulator.requests += Number(record.request_count || 0);
      accumulator.tokens += Number(record.tokens_used || 0);
      return accumulator;
    },
    { requests: 0, tokens: 0 }
  );

  return {
    totals,
    records: records.map((record) => ({
      id: record.id,
      appName: record.app_name,
      model: record.model || "",
      requestCount: Number(record.request_count || 0),
      tokensUsed: Number(record.tokens_used || 0),
      periodStart: record.period_start,
      periodEnd: record.period_end,
      metadata: record.metadata || null
    }))
  };
}

export async function ensureRefreshTokenIsActive(record, expectedClientId) {
  assert(!record.revoked_at, 401, "invalid_grant", "Refresh token revoked.");
  assert(
    new Date(record.expires_at).getTime() > Date.now(),
    401,
    "invalid_grant",
    "Refresh token expired."
  );

  if (expectedClientId) {
    const client = await findClientByClientId(expectedClientId);
    assert(record.client === client.id, 401, "invalid_grant", "Refresh token client mismatch.");
    return client;
  }

  const pb = await getAdminClient();
  const client = await pb.collection(config.clientsCollection).getOne(record.client);
  return normalizeClient(client);
}
