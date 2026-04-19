import {
  buildAuthorizeUrl,
  fetchJson,
  randomString,
  resolveAuthClientConfig,
  sha256Base64Url
} from "../shared/oauth.js";

const config = resolveAuthClientConfig({
  clientId: "felixx-example-client",
  redirectUri: `${window.location.origin}${window.location.pathname}`,
  scope: "openid profile email offline_access",
  storageKey: "felixx-example-session",
  pkceStateKey: "felixx-example-pending",
  pkceVerifierKey: "felixx-example-code-verifier"
});

const loginButton = document.querySelector("#login-button");
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");
const sessionOutput = document.querySelector("#session-output");
const userinfoOutput = document.querySelector("#userinfo-output");

function saveSession(session) {
  localStorage.setItem(config.storageKey, JSON.stringify(session));
}

function loadSession() {
  const raw = localStorage.getItem(config.storageKey);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(config.storageKey);
    return null;
  }
}

function clearSession() {
  localStorage.removeItem(config.storageKey);
}

async function startLogin() {
  const state = randomString(24);
  const codeVerifier = randomString(48);
  const codeChallenge = await sha256Base64Url(codeVerifier);

  sessionStorage.setItem(
    config.pkceStateKey,
    JSON.stringify({ state, codeVerifier })
  );

  window.location.href = buildAuthorizeUrl({
    authBaseUrl: config.authBaseUrl,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scope: config.scope,
    state,
    codeChallenge
  });
}

async function exchangeAuthorizationCode(code, state) {
  const pending = JSON.parse(sessionStorage.getItem(config.pkceStateKey) || "null");
  if (!pending || pending.state !== state) {
    throw new Error("OAuth state mismatch.");
  }

  const session = await fetchJson(`${config.authBaseUrl}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      code,
      code_verifier: pending.codeVerifier
    })
  });

  saveSession(session);
  sessionStorage.removeItem(config.pkceStateKey);
  history.replaceState({}, "", config.redirectUri);
  renderSession();
  await loadUserinfo();
}

async function refreshTokens() {
  const session = loadSession();
  if (!session?.refresh_token) {
    throw new Error("No refresh token stored.");
  }

  const nextSession = await fetchJson(`${config.authBaseUrl}/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: session.refresh_token
    })
  });

  saveSession(nextSession);
  renderSession();
  await loadUserinfo();
}

async function revokeTokens() {
  const session = loadSession();
  if (!session?.refresh_token) {
    clearSession();
    renderSession();
    return;
  }

  await fetchJson(
    `${config.authBaseUrl}/revoke`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        token: session.refresh_token,
        token_type_hint: "refresh_token",
        client_id: config.clientId
      })
    },
    false
  );

  clearSession();
  renderSession();
  userinfoOutput.textContent = "Signed out.";
}

async function loadUserinfo() {
  const session = loadSession();
  if (!session?.access_token) {
    userinfoOutput.textContent = "Sign in to load profile.";
    return;
  }

  const profile = await fetchJson(
    `${config.authBaseUrl}/userinfo`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`
      }
    },
    false
  );

  userinfoOutput.textContent = JSON.stringify(profile, null, 2);
}

function renderSession() {
  const session = loadSession();
  sessionOutput.textContent = session
    ? JSON.stringify(session, null, 2)
    : "No tokens yet.";
}

async function maybeHandleOAuthCallback() {
  const url = new URL(window.location.href);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    sessionStorage.removeItem(config.pkceStateKey);
    history.replaceState({}, "", config.redirectUri);
    throw new Error(error);
  }

  if (!code) {
    renderSession();
    await loadUserinfo();
    return;
  }

  await exchangeAuthorizationCode(code, state);
}

loginButton.addEventListener("click", () => {
  startLogin().catch((error) => {
    userinfoOutput.textContent = error.message;
  });
});

refreshButton.addEventListener("click", () => {
  refreshTokens().catch((error) => {
    userinfoOutput.textContent = error.message;
  });
});

logoutButton.addEventListener("click", () => {
  revokeTokens().catch((error) => {
    userinfoOutput.textContent = error.message;
  });
});

maybeHandleOAuthCallback().catch((error) => {
  userinfoOutput.textContent = error.message;
});
