import dotenv from "dotenv";
import crypto from "crypto";

dotenv.config();

function requireEnv(name, fallback = "") {
  const value = process.env[name] || fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function envOrGeneratedSecret(name, label) {
  const value = process.env[name];
  if (value) {
    return value;
  }

  const generated = crypto.randomBytes(32).toString("hex");
  console.warn(`[felixx-identity] ${label} not set. Using an ephemeral dev secret.`);
  return generated;
}

function parseCsv(value) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT || 3000),
  pocketbaseUrl: process.env.POCKETBASE_URL || "https://pocketbase.felixx.dev",
  pocketbaseAdminEmail: process.env.POCKETBASE_ADMIN_EMAIL || "",
  pocketbaseAdminPassword: process.env.POCKETBASE_ADMIN_PASSWORD || "",
  usersCollection: process.env.PB_USERS_COLLECTION || "users",
  clientsCollection: process.env.PB_CLIENTS_COLLECTION || "oauth_clients",
  authCodesCollection: process.env.PB_AUTH_CODES_COLLECTION || "oauth_auth_codes",
  refreshTokensCollection:
    process.env.PB_REFRESH_TOKENS_COLLECTION || "oauth_refresh_tokens",
  accessTokenSecret: envOrGeneratedSecret("ACCESS_TOKEN_SECRET", "ACCESS_TOKEN_SECRET"),
  refreshTokenSecret: envOrGeneratedSecret("REFRESH_TOKEN_SECRET", "REFRESH_TOKEN_SECRET"),
  accessTokenTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
  refreshTokenTtlSeconds: Number(process.env.REFRESH_TOKEN_TTL_SECONDS || 2592000),
  authCodeTtlSeconds: Number(process.env.AUTH_CODE_TTL_SECONDS || 300),
  allowedOrigins: parseCsv(process.env.ALLOWED_ORIGINS || ""),
  issuer: process.env.AUTH_ISSUER || "https://auth.felixx.dev",
  accountsAppUrl: process.env.ACCOUNTS_APP_URL || "https://auth.felixx.dev/account"
};
