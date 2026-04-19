const DEFAULT_AUTH_BASE_URL = "https://auth.felixx.dev";

export function resolveAuthClientConfig(defaults = {}) {
  const runtimeConfig = globalThis.FELIXX_AUTH_CONFIG ?? {};

  return {
    authBaseUrl: runtimeConfig.authBaseUrl || defaults.authBaseUrl || DEFAULT_AUTH_BASE_URL,
    clientId: runtimeConfig.clientId || defaults.clientId || "",
    redirectUri: runtimeConfig.redirectUri || defaults.redirectUri || "",
    scope: runtimeConfig.scope || defaults.scope || "openid profile email offline_access",
    storageKey: runtimeConfig.storageKey || defaults.storageKey || "felixx.oauth.tokens",
    pkceStateKey: runtimeConfig.pkceStateKey || defaults.pkceStateKey || "felixx.oauth.state",
    pkceVerifierKey:
      runtimeConfig.pkceVerifierKey || defaults.pkceVerifierKey || "felixx.oauth.verifier"
  };
}

export function randomString(length = 32) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (byte) => "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~"[byte % 66]).join("");
}

export async function sha256Base64Url(value) {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  const bytes = new Uint8Array(buffer);
  let output = "";
  for (const byte of bytes) output += String.fromCharCode(byte);
  return btoa(output).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function buildAuthorizeUrl({
  authBaseUrl,
  clientId,
  redirectUri,
  scope,
  state,
  codeChallenge,
  codeChallengeMethod = "S256"
}) {
  const url = new URL(`${authBaseUrl.replace(/\/+$/, "")}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", scope);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", codeChallengeMethod);
  return url.toString();
}

export async function fetchJson(url, init = {}, allowEmpty = false) {
  const response = await fetch(url, init);
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const error = new Error(data.error_description || data.message || response.statusText);
    error.status = response.status;
    error.payload = data;
    throw error;
  }

  if (!text && !allowEmpty) return {};
  return data;
}

export function readJwt(token) {
  if (!token) return null;

  try {
    const [, payload] = token.split(".");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}
