import crypto from "crypto";
import jwt from "jsonwebtoken";
import { config } from "../config.js";
import { HttpError, assert } from "./errors.js";

function base64url(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export function randomOpaqueToken(bytes = 32) {
  return base64url(crypto.randomBytes(bytes));
}

export function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function isoDateFromNow(seconds) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function verifyPkce(codeVerifier, storedChallenge, method = "S256") {
  assert(codeVerifier, 400, "invalid_request", "Missing code_verifier.");
  if (method === "plain") {
    return codeVerifier === storedChallenge;
  }

  const digest = crypto.createHash("sha256").update(codeVerifier).digest();
  return base64url(digest) === storedChallenge;
}

export function signAccessToken({ user, clientId, scope = "", sessionId }) {
  const now = Math.floor(Date.now() / 1000);

  return jwt.sign(
    {
      sub: user.id,
      aud: clientId,
      scope,
      sid: sessionId,
      name: user.name || user.email,
      email: user.email,
      avatar_url: buildAvatarUrl(user),
      type: "access"
    },
    config.accessTokenSecret,
    {
      issuer: config.issuer,
      expiresIn: config.accessTokenTtlSeconds,
      jwtid: randomOpaqueToken(16),
      notBefore: 0
    }
  );
}

export function signRefreshToken({ user, clientId, scope = "", sessionId, jti }) {
  return jwt.sign(
    {
      sub: user.id,
      aud: clientId,
      scope,
      sid: sessionId,
      type: "refresh"
    },
    config.refreshTokenSecret,
    {
      issuer: config.issuer,
      expiresIn: config.refreshTokenTtlSeconds,
      jwtid: jti
    }
  );
}

export function verifyAccessToken(token) {
  try {
    const payload = jwt.verify(token, config.accessTokenSecret, {
      issuer: config.issuer
    });
    assert(payload.type === "access", 401, "invalid_token", "Expected an access token.");
    return payload;
  } catch (error) {
    throw new HttpError(401, "invalid_token", error.message);
  }
}

export function verifyRefreshToken(token) {
  try {
    const payload = jwt.verify(token, config.refreshTokenSecret, {
      issuer: config.issuer
    });
    assert(payload.type === "refresh", 401, "invalid_grant", "Expected a refresh token.");
    return payload;
  } catch (error) {
    throw new HttpError(401, "invalid_grant", error.message);
  }
}

export function parseScope(input = "") {
  return input
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(" ");
}

export function buildAvatarUrl(user) {
  if (user.avatarUrl) {
    return user.avatarUrl;
  }

  if (user.avatar && user.collectionId) {
    return `${config.pocketbaseUrl}/api/files/${user.collectionId}/${user.id}/${user.avatar}`;
  }

  return "";
}
