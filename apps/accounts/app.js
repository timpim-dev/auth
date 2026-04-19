import {
  buildAuthorizeUrl,
  fetchJson,
  randomString,
  readJwt,
  resolveAuthClientConfig,
  sha256Base64Url
} from "../shared/oauth.js";

const config = resolveAuthClientConfig({
  clientId: "felixx-accounts",
  redirectUri: `${window.location.origin}${window.location.pathname}`,
  scope: "openid profile email offline_access",
  storageKey: "felixx.accounts.oauth",
  pkceStateKey: "felixx.accounts.oauth_state",
  pkceVerifierKey: "felixx.accounts.code_verifier"
});

const elements = {
  authStatus: document.querySelector("#auth-status"),
  sessionBadge: document.querySelector("#session-badge"),
  loginButton: document.querySelector("#login-button"),
  logoutButton: document.querySelector("#logout-button"),
  profileForm: document.querySelector("#profile-form"),
  passwordForm: document.querySelector("#password-form"),
  profileStatus: document.querySelector("#profile-status"),
  passwordStatus: document.querySelector("#password-status"),
  appsStatus: document.querySelector("#apps-status"),
  usageStatus: document.querySelector("#usage-status"),
  sessionsStatus: document.querySelector("#sessions-status"),
  profileName: document.querySelector("#profile-name"),
  profileEmail: document.querySelector("#profile-email"),
  profileAvatar: document.querySelector("#profile-avatar"),
  avatarPreview: document.querySelector("#avatar-preview"),
  appsList: document.querySelector("#apps-list"),
  usageList: document.querySelector("#usage-list"),
  sessionsList: document.querySelector("#sessions-list"),
  requestsTotal: document.querySelector("#requests-total"),
  tokensTotal: document.querySelector("#tokens-total"),
  requestsMonth: document.querySelector("#requests-month"),
  tabs: [...document.querySelectorAll(".tab")],
  panels: [...document.querySelectorAll(".panel")],
};

const state = {
  tokens: loadTokens(),
  profile: null,
};

boot().catch((error) => {
  setStatus(elements.authStatus, `Startup failed: ${formatError(error)}`, "error");
});

async function boot() {
  wireTabs();
  wireAuth();
  wireForms();
  await maybeCompleteOAuthCallback();
  await refreshAppState();
}

function wireTabs() {
  for (const tab of elements.tabs) {
    tab.addEventListener("click", () => {
      const target = tab.dataset.tab;
      for (const item of elements.tabs) item.classList.toggle("active", item === tab);
      for (const panel of elements.panels) panel.classList.toggle("active", panel.dataset.panel === target);
    });
  }
}

function wireAuth() {
  elements.loginButton.addEventListener("click", startLogin);
  elements.logoutButton.addEventListener("click", logout);
}

function wireForms() {
  elements.profileForm.addEventListener("submit", saveProfile);
  elements.passwordForm.addEventListener("submit", changePassword);
}

async function maybeCompleteOAuthCallback() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const stateParam = params.get("state");
  const error = params.get("error");

  if (error) {
    clearPkceState();
    window.history.replaceState({}, document.title, config.redirectUri);
    throw new Error(error);
  }

  if (!code) return;

  const savedState = sessionStorage.getItem(config.pkceStateKey);
  const verifier = sessionStorage.getItem(config.pkceVerifierKey);
  if (!savedState || savedState !== stateParam || !verifier) {
    throw new Error("OAuth state validation failed.");
  }

  setStatus(elements.authStatus, "Completing sign-in...", "info");

  const response = await fetchJson(`${config.authBaseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: config.clientId,
      code,
      code_verifier: verifier,
      redirect_uri: config.redirectUri,
    }),
  }, false);

  state.tokens = response;
  persistTokens(response);
  clearPkceState();
  window.history.replaceState({}, document.title, config.redirectUri);
  setStatus(elements.authStatus, "Signed in.", "success");
}

async function startLogin() {
  const verifier = randomString(64);
  const stateValue = randomString(32);
  const challenge = await sha256Base64Url(verifier);

  sessionStorage.setItem(config.pkceVerifierKey, verifier);
  sessionStorage.setItem(config.pkceStateKey, stateValue);
  window.location.href = buildAuthorizeUrl({
    authBaseUrl: config.authBaseUrl,
    clientId: config.clientId,
    redirectUri: config.redirectUri,
    scope: config.scope,
    state: stateValue,
    codeChallenge: challenge
  });
}

async function logout() {
  if (state.tokens?.refresh_token) {
    try {
      await fetchJson(`${config.authBaseUrl}/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: state.tokens.refresh_token,
          token_type_hint: "refresh_token",
          client_id: config.clientId,
        }),
      }, false);
    } catch (error) {
      console.warn("Refresh token revoke failed", error);
    }
  }

  state.tokens = null;
  state.profile = null;
  persistTokens(null);
  renderSignedOutState();
  setStatus(elements.authStatus, "Signed out.", "info");
}

async function refreshAppState() {
  if (!state.tokens?.access_token) {
    renderSignedOutState();
    return;
  }

  try {
    const response = await api("/api/account/profile");
    const profile = response.profile;
    state.profile = profile;
    renderAuthState(profile);
    fillProfile(profile);
    await Promise.all([
      loadConnectedApps(),
      loadUsage(),
      loadSessions(),
    ]);
  } catch (error) {
    if (await tryRefreshTokens(error)) {
      return refreshAppState();
    }
    renderSignedOutState();
    setStatus(elements.authStatus, `Session expired: ${formatError(error)}`, "error");
  }
}

function renderSignedOutState() {
  elements.sessionBadge.textContent = "Signed out";
  elements.loginButton.classList.remove("hidden");
  elements.logoutButton.classList.add("hidden");
  elements.profileForm.reset();
  elements.appsList.innerHTML = "";
  elements.usageList.innerHTML = "";
  elements.sessionsList.innerHTML = "";
  elements.requestsTotal.textContent = "0";
  elements.tokensTotal.textContent = "0";
  elements.requestsMonth.textContent = "0";
  resetAvatar();
  setStatus(elements.profileStatus, "Sign in to load profile.", "info");
  setStatus(elements.appsStatus, "Sign in to load apps.", "info");
  setStatus(elements.usageStatus, "Sign in to load usage.", "info");
  setStatus(elements.sessionsStatus, "Sign in to load sessions.", "info");
}

function renderAuthState(profile) {
  elements.sessionBadge.textContent = `${profile.email || "Authenticated"} active`;
  elements.loginButton.classList.add("hidden");
  elements.logoutButton.classList.remove("hidden");
  setStatus(elements.authStatus, "Authenticated with Felixx identity.", "success");
}

function fillProfile(profile) {
  elements.profileName.value = profile.name || "";
  elements.profileEmail.value = profile.email || "";
  elements.profileAvatar.value = profile.avatarUrl || "";
  paintAvatar(profile.name || profile.email || "Felixx", profile.avatarUrl || "");
  setStatus(elements.profileStatus, "Profile loaded.", "success");
}

async function saveProfile(event) {
  event.preventDefault();
  if (!requireAuth()) return;

  const payload = {
    name: elements.profileName.value.trim(),
    email: elements.profileEmail.value.trim(),
    avatarUrl: elements.profileAvatar.value.trim(),
  };

  setStatus(elements.profileStatus, "Saving profile...", "info");
  const response = await api("/api/account/profile", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  const profile = response.profile;
  state.profile = profile;
  fillProfile(profile);
  setStatus(elements.profileStatus, "Profile saved.", "success");
}

async function changePassword(event) {
  event.preventDefault();
  if (!requireAuth()) return;

  const currentPassword = document.querySelector("#current-password").value;
  const newPassword = document.querySelector("#new-password").value;
  const confirmPassword = document.querySelector("#confirm-password").value;

  if (!newPassword || newPassword !== confirmPassword) {
    setStatus(elements.passwordStatus, "New password confirmation does not match.", "error");
    return;
  }

  setStatus(elements.passwordStatus, "Updating password...", "info");
  await api("/api/account/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
  });
  elements.passwordForm.reset();
  setStatus(elements.passwordStatus, "Password changed.", "success");
}

async function loadConnectedApps() {
  setStatus(elements.appsStatus, "Loading connected apps...", "info");
  const response = await api("/api/account/apps");
  const items = response.apps || [];
  elements.appsList.innerHTML = items.length ? "" : renderEmpty("No connected apps.");

  for (const item of items) {
    elements.appsList.appendChild(renderListItem({
      title: item.name || item.clientId,
      meta: item.lastUsedAt ? `Last used ${formatDate(item.lastUsedAt)}` : "No recent activity",
      body: `${item.activeSessions || 0} active session${item.activeSessions === 1 ? "" : "s"}${item.revokedSessions ? ` • ${item.revokedSessions} revoked` : ""}`,
      actionLabel: "Revoke access",
      actionClass: "danger-button",
      onAction: async () => {
        await api(`/api/account/apps/${encodeURIComponent(item.clientId)}/revoke`, { method: "POST" });
        await loadConnectedApps();
      },
    }));
  }

  setStatus(elements.appsStatus, `${items.length} app${items.length === 1 ? "" : "s"} connected.`, "success");
}

async function loadUsage() {
  setStatus(elements.usageStatus, "Loading usage...", "info");
  const response = await api("/api/account/usage");
  const totals = response.totals || {};
  const items = response.records || [];

  elements.requestsTotal.textContent = formatNumber(totals.requests || 0);
  elements.tokensTotal.textContent = formatNumber(totals.tokens || 0);
  elements.requestsMonth.textContent = formatNumber(
    items
      .filter((item) => Date.now() - new Date(item.periodEnd).getTime() <= 30 * 24 * 60 * 60 * 1000)
      .reduce((sum, item) => sum + Number(item.requestCount || 0), 0)
  );
  elements.usageList.innerHTML = items.length ? "" : renderEmpty("No AI usage yet.");

  for (const item of items) {
    elements.usageList.appendChild(renderListItem({
      title: item.appName || item.model || "AI usage",
      meta: `${formatDate(item.periodStart)} to ${formatDate(item.periodEnd)}`,
      body: `${formatNumber(item.requestCount || 0)} request${item.requestCount === 1 ? "" : "s"} • ${formatNumber(item.tokensUsed || 0)} tokens${item.model ? ` • ${item.model}` : ""}`,
    }));
  }

  setStatus(elements.usageStatus, "Usage loaded.", "success");
}

async function loadSessions() {
  setStatus(elements.sessionsStatus, "Loading sessions...", "info");
  const response = await api("/api/account/sessions");
  const items = response.sessions || [];
  elements.sessionsList.innerHTML = items.length ? "" : renderEmpty("No active sessions.");
  const currentSessionId = readJwt(state.tokens.access_token)?.sid || null;

  for (const item of items) {
    const current = item.sessionId === currentSessionId && !item.revokedAt;
    elements.sessionsList.appendChild(renderListItem({
      title: item.clientName || item.userAgent || "Session",
      meta: current ? "Current session" : `Seen ${formatDate(item.lastUsedAt || item.created)}`,
      body: [item.userAgent, item.ip, item.scope].filter(Boolean).join(" • ") || "No session metadata",
      actionLabel: current ? "Current device" : "Log out",
      actionClass: current ? "ghost-button" : "danger-button",
      actionDisabled: Boolean(current),
      onAction: async () => {
        await api(`/api/account/sessions/${encodeURIComponent(item.sessionId)}/logout`, { method: "POST" });
        await loadSessions();
      },
    }));
  }

  setStatus(elements.sessionsStatus, "Sessions loaded.", "success");
}

async function api(path, init = {}) {
  const headers = {
    Authorization: `Bearer ${state.tokens.access_token}`,
    "Content-Type": "application/json",
    ...init.headers,
  };

  try {
    return await fetchJson(`${config.authBaseUrl}${path}`, { ...init, headers }, true);
  } catch (error) {
    if (await tryRefreshTokens(error)) {
      headers.Authorization = `Bearer ${state.tokens.access_token}`;
      return fetchJson(`${config.authBaseUrl}${path}`, { ...init, headers }, true);
    }
    throw error;
  }
}

async function tryRefreshTokens(error) {
  if (!shouldRefresh(error) || !state.tokens?.refresh_token) return false;

  const refreshed = await fetchJson(`${config.authBaseUrl}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: config.clientId,
      refresh_token: state.tokens.refresh_token,
    }),
  }, false);

  state.tokens = refreshed;
  persistTokens(refreshed);
  return true;
}

function shouldRefresh(error) {
  return error?.status === 401 || error?.payload?.error === "invalid_token";
}

function requireAuth() {
  if (state.tokens?.access_token) return true;
  setStatus(elements.authStatus, "Sign in first.", "error");
  return false;
}

function renderListItem({
  title,
  meta,
  body,
  actionLabel,
  actionClass = "ghost-button",
  actionDisabled = false,
  onAction,
}) {
  const node = document.createElement("article");
  node.className = "list-item";

  const titleNode = document.createElement("h4");
  titleNode.textContent = title;

  const metaNode = document.createElement("span");
  metaNode.className = "meta";
  metaNode.textContent = meta;

  const bodyNode = document.createElement("p");
  bodyNode.textContent = body;

  node.append(titleNode, metaNode, bodyNode);

  if (actionLabel) {
    const actions = document.createElement("div");
    actions.className = "item-actions";
    const button = document.createElement("button");
    button.type = "button";
    button.className = actionClass;
    button.textContent = actionLabel;
    button.disabled = actionDisabled;
    if (!actionDisabled && onAction) button.addEventListener("click", onAction);
    actions.append(button);
    node.append(actions);
  }

  return node;
}

function renderEmpty(message) {
  return `<article class="list-item"><p>${message}</p></article>`;
}

function paintAvatar(label, imageUrl) {
  if (imageUrl) {
    elements.avatarPreview.style.backgroundImage = `url("${imageUrl}")`;
    elements.avatarPreview.textContent = "";
    return;
  }

  elements.avatarPreview.style.backgroundImage = "";
  elements.avatarPreview.textContent = initials(label);
}

function resetAvatar() {
  paintAvatar("Felixx", "");
}

function setStatus(node, message, tone) {
  node.textContent = message;
  node.style.color = ({
    success: "var(--success)",
    error: "var(--danger)",
    info: "var(--muted)",
  })[tone] || "var(--muted)";
}

function loadTokens() {
  try {
    const raw = localStorage.getItem(config.storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistTokens(tokens) {
  if (!tokens) {
    localStorage.removeItem(config.storageKey);
    return;
  }
  localStorage.setItem(config.storageKey, JSON.stringify(tokens));
}

function clearPkceState() {
  sessionStorage.removeItem(config.pkceVerifierKey);
  sessionStorage.removeItem(config.pkceStateKey);
}

function initials(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || "")
    .join("") || "FX";
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatNumber(value) {
  return new Intl.NumberFormat().format(value);
}

function formatError(error) {
  return error?.message || "Unknown error";
}
