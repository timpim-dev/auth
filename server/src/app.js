import express from "express";
import cors from "cors";
import path from "path";
import { pathToFileURL } from "url";
import {
  authenticateUser,
  changeUserPassword,
  consumeAuthorizationCode,
  createAuthorizationCode,
  createRefreshTokenRecord,
  ensureRefreshTokenIsActive,
  findRefreshTokenRecord,
  getUserById,
  listConnectedApps,
  listUserClientSessions,
  registerUser,
  revokeAppSessions,
  revokeRefreshToken,
  revokeSession,
  rotateRefreshTokenRecord,
  updateUserProfile,
  validateClientRedirectUri
} from "./lib/pocketbase.js";
import { config } from "./config.js";
import { assert } from "./lib/errors.js";
import { asyncHandler, errorMiddleware, oauthErrorResponse } from "./lib/http.js";
import {
  parseScope,
  randomOpaqueToken,
  signAccessToken,
  signRefreshToken,
  verifyAccessToken,
  verifyPkce,
  verifyRefreshToken
} from "./lib/oauth.js";
import { renderAuthorizePage } from "./views/loginPage.js";

const app = express();
const publicWikiDir = path.resolve(process.cwd(), "public/wiki");
const accountsAppDir = path.resolve(process.cwd(), "apps/accounts");
const sharedAppDir = path.resolve(process.cwd(), "apps/shared");

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || config.allowedOrigins.length === 0 || config.allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error("Blocked by CORS"));
    },
    credentials: false
  })
);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.get("/account", (req, res) => {
  res.sendFile(path.resolve(accountsAppDir, "index.html"));
});
app.get("/account/", (req, res) => {
  res.sendFile(path.resolve(accountsAppDir, "index.html"));
});
app.use("/account", express.static(accountsAppDir, { redirect: false }));
app.use("/shared", express.static(sharedAppDir));
app.get("/wiki", (req, res) => {
  res.redirect(302, "/wiki/");
});
app.use("/wiki", express.static(publicWikiDir));

function requireBearerToken(req) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  assert(type === "Bearer" && token, 401, "invalid_token", "Missing bearer access token.");
  return token;
}

function mapUserProfile(user) {
  return {
    id: user.id,
    name: user.name || "",
    email: user.email,
    avatarUrl: user.avatarUrl || "",
    verified: Boolean(user.verified),
    created: user.created,
    updated: user.updated
  };
}

async function requireAccessUser(req, res, next) {
  try {
    const payload = verifyAccessToken(requireBearerToken(req));
    req.accessToken = payload;
    req.currentUser = await getUserById(payload.sub);
    next();
  } catch (error) {
    next(error);
  }
}

app.get(
  "/health",
  asyncHandler(async (req, res) => {
    res.json({ ok: true });
  })
);

app.get(
  "/authorize",
  asyncHandler(async (req, res) => {
    const {
      response_type: responseType,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod = "S256",
      scope = "",
      state = ""
    } = req.query;

    assert(responseType === "code", 400, "unsupported_response_type", "Only response_type=code is supported.");
    assert(clientId, 400, "invalid_request", "Missing client_id.");
    assert(redirectUri, 400, "invalid_request", "Missing redirect_uri.");
    assert(codeChallenge, 400, "invalid_request", "Missing code_challenge.");
    assert(
      ["S256", "plain"].includes(codeChallengeMethod),
      400,
      "invalid_request",
      "Unsupported code_challenge_method."
    );

    const client = await validateClientRedirectUri(clientId, redirectUri);
    res
      .status(200)
      .type("html")
      .send(
        renderAuthorizePage({
          clientName: client.name,
          query: {
            response_type: responseType,
            client_id: clientId,
            redirect_uri: redirectUri,
            code_challenge: codeChallenge,
            code_challenge_method: codeChallengeMethod,
            scope,
            state
          }
        })
      );
  })
);

app.post(
  "/authorize/login",
  asyncHandler(async (req, res) => {
    const {
      response_type: responseType,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod = "S256",
      scope = "",
      state = "",
      email,
      password
    } = req.body;

    try {
      assert(responseType === "code", 400, "unsupported_response_type", "Only response_type=code is supported.");
      assert(email && password, 400, "invalid_request", "Email and password are required.");
      const client = await validateClientRedirectUri(clientId, redirectUri);
      const user = await authenticateUser(email, password);
      const code = await createAuthorizationCode({
        client,
        userId: user.id,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope: parseScope(scope),
        metadata: {
          userAgent: req.headers["user-agent"] || "",
          ip: req.ip
        }
      });

      const redirectTarget = new URL(redirectUri);
      redirectTarget.searchParams.set("code", code);
      if (state) {
        redirectTarget.searchParams.set("state", state);
      }

      res.redirect(302, redirectTarget.toString());
    } catch (error) {
      const client = clientId && redirectUri ? await validateClientRedirectUri(clientId, redirectUri) : { name: "Felixx" };
      res
        .status(error.status || 400)
        .type("html")
        .send(
          renderAuthorizePage({
            clientName: client.name,
            query: req.body,
            error: error.description || "Sign in failed."
          })
        );
    }
  })
);

app.post(
  "/authorize/register",
  asyncHandler(async (req, res) => {
    const {
      response_type: responseType,
      client_id: clientId,
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod = "S256",
      scope = "",
      state = "",
      name = "",
      email,
      password,
      confirmPassword
    } = req.body;

    try {
      assert(responseType === "code", 400, "unsupported_response_type", "Only response_type=code is supported.");
      assert(email && password, 400, "invalid_request", "Email and password are required.");
      assert(password === confirmPassword, 400, "invalid_request", "Passwords do not match.");
      const client = await validateClientRedirectUri(clientId, redirectUri);
      await registerUser({ email, password, name });
      const user = await authenticateUser(email, password);
      const code = await createAuthorizationCode({
        client,
        userId: user.id,
        redirectUri,
        codeChallenge,
        codeChallengeMethod,
        scope: parseScope(scope),
        metadata: {
          userAgent: req.headers["user-agent"] || "",
          ip: req.ip
        }
      });

      const redirectTarget = new URL(redirectUri);
      redirectTarget.searchParams.set("code", code);
      if (state) {
        redirectTarget.searchParams.set("state", state);
      }

      res.redirect(302, redirectTarget.toString());
    } catch (error) {
      const client = clientId && redirectUri ? await validateClientRedirectUri(clientId, redirectUri) : { name: "Felixx" };
      res
        .status(error.status || 400)
        .type("html")
        .send(
          renderAuthorizePage({
            clientName: client.name,
            query: req.body,
            error: error.description || "Account creation failed."
          })
        );
    }
  })
);

app.post(
  "/token",
  asyncHandler(async (req, res) => {
    const { grant_type: grantType } = req.body;

    if (grantType === "authorization_code") {
      const {
        code,
        client_id: clientId,
        redirect_uri: redirectUri,
        code_verifier: codeVerifier
      } = req.body;

      assert(code && clientId && redirectUri, 400, "invalid_request", "Missing required token parameters.");
      const client = await validateClientRedirectUri(clientId, redirectUri);
      const authCode = await consumeAuthorizationCode(code);

      assert(authCode.client === client.id, 400, "invalid_grant", "Authorization code client mismatch.");
      assert(authCode.redirect_uri === redirectUri, 400, "invalid_grant", "Authorization code redirect_uri mismatch.");
      assert(
        verifyPkce(codeVerifier, authCode.code_challenge, authCode.code_challenge_method),
        400,
        "invalid_grant",
        "PKCE verification failed."
      );

      const user = await getUserById(authCode.user_id);
      const sessionId = randomOpaqueToken(16);
      const refreshJti = randomOpaqueToken(16);
      const accessToken = signAccessToken({
        user,
        clientId,
        scope: authCode.scope || "",
        sessionId
      });
      const refreshToken = signRefreshToken({
        user,
        clientId,
        scope: authCode.scope || "",
        sessionId,
        jti: refreshJti
      });

      await createRefreshTokenRecord({
        rawToken: refreshToken,
        jti: refreshJti,
        client,
        userId: user.id,
        scope: authCode.scope || "",
        sessionId,
        userAgent: req.headers["user-agent"] || "",
        ip: req.ip
      });

      res.json({
        token_type: "Bearer",
        access_token: accessToken,
        refresh_token: refreshToken,
        expires_in: config.accessTokenTtlSeconds,
        scope: authCode.scope || ""
      });
      return;
    }

    if (grantType === "refresh_token") {
      const { refresh_token: rawRefreshToken, client_id: clientId } = req.body;
      assert(rawRefreshToken, 400, "invalid_request", "Missing refresh_token.");
      const payload = verifyRefreshToken(rawRefreshToken);
      const record = await findRefreshTokenRecord(rawRefreshToken);
      const client = await ensureRefreshTokenIsActive(record, clientId || payload.aud);
      const user = await getUserById(payload.sub);
      const nextJti = randomOpaqueToken(16);
      const nextRefreshToken = signRefreshToken({
        user,
        clientId: client.clientId,
        scope: record.scope || "",
        sessionId: record.session_id,
        jti: nextJti
      });
      const accessToken = signAccessToken({
        user,
        clientId: client.clientId,
        scope: record.scope || "",
        sessionId: record.session_id
      });

      await rotateRefreshTokenRecord(record, nextRefreshToken, nextJti);

      res.json({
        token_type: "Bearer",
        access_token: accessToken,
        refresh_token: nextRefreshToken,
        expires_in: config.accessTokenTtlSeconds,
        scope: record.scope || ""
      });
      return;
    }

    oauthErrorResponse(res, 400, "unsupported_grant_type", "Supported grant types are authorization_code and refresh_token.");
  })
);

app.post(
  "/revoke",
  asyncHandler(async (req, res) => {
    const { token } = req.body;
    if (token) {
      try {
        await revokeRefreshToken(token);
      } catch (error) {
        // RFC 7009-compatible silent success for unknown tokens.
      }
    }

    res.status(200).send();
  })
);

app.get(
  "/userinfo",
  asyncHandler(async (req, res) => {
    const payload = verifyAccessToken(requireBearerToken(req));
    const user = await getUserById(payload.sub);
    res.json({
      sub: user.id,
      name: user.name || "",
      email: user.email,
      email_verified: Boolean(user.verified),
      picture: user.avatarUrl || ""
    });
  })
);

app.get(
  "/api/account/profile",
  requireAccessUser,
  asyncHandler(async (req, res) => {
    res.json({ profile: mapUserProfile(req.currentUser) });
  })
);

app.patch(
  "/api/account/profile",
  requireAccessUser,
  asyncHandler(async (req, res) => {
    const { name, email, avatarUrl } = req.body;
    const updates = {};
    if (typeof name === "string") {
      updates.name = name.trim();
    }
    if (typeof email === "string") {
      updates.email = email.trim().toLowerCase();
    }
    if (typeof avatarUrl === "string") {
      updates.avatarUrl = avatarUrl.trim();
    }

    const user = await updateUserProfile(req.currentUser.id, updates);
    res.json({ profile: mapUserProfile(user) });
  })
);

app.post(
  "/api/account/password",
  requireAccessUser,
  asyncHandler(async (req, res) => {
    const { currentPassword, nextPassword } = req.body;
    assert(currentPassword && nextPassword, 400, "invalid_request", "Both currentPassword and nextPassword are required.");
    await changeUserPassword(
      req.currentUser.id,
      req.currentUser.email,
      currentPassword,
      nextPassword
    );
    res.status(204).send();
  })
);

app.get(
  "/api/account/apps",
  requireAccessUser,
  asyncHandler(async (req, res) => {
    const apps = await listConnectedApps(req.currentUser.id);
    res.json({ apps });
  })
);

app.post(
  "/api/account/apps/:clientId/revoke",
  requireAccessUser,
  asyncHandler(async (req, res) => {
    const revoked = await revokeAppSessions(req.currentUser.id, req.params.clientId);
    res.json({ revoked });
  })
);

app.get(
  "/api/account/sessions",
  requireAccessUser,
  asyncHandler(async (req, res) => {
    const sessions = await listUserClientSessions(req.currentUser.id);
    res.json({ sessions });
  })
);

app.post(
  "/api/account/sessions/:sessionId/logout",
  requireAccessUser,
  asyncHandler(async (req, res) => {
    const revoked = await revokeSession(req.currentUser.id, req.params.sessionId);
    res.json({ revoked });
  })
);

app.use(errorMiddleware);

app.use((req, res) => {
  const accept = req.headers.accept || "";
  const wantsHtml = accept.includes("text/html") && !req.path.startsWith("/api/");

  if (wantsHtml) {
    res.status(404).sendFile(path.resolve(process.cwd(), "public/404/index.html"));
    return;
  }

  res.status(404).json({
    error: "not_found",
    error_description: "The requested resource was not found."
  });
});

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  app.listen(config.port, () => {
    console.log(`Felixx auth server listening on :${config.port}`);
  });
}

export default app;
