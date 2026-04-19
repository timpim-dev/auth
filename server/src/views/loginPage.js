function hiddenFields(params) {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${key}" value="${String(value || "").replace(/"/g, "&quot;")}">`
    )
    .join("");
}

function queryString(params) {
  return new URLSearchParams(
    Object.entries(params).reduce((acc, [key, value]) => {
      if (value !== undefined && value !== null && String(value) !== "") {
        acc[key] = String(value);
      }
      return acc;
    }, {})
  ).toString();
}

function renderPage({
  clientName,
  title,
  heading,
  description,
  error = "",
  body,
  footer = ""
}) {
  const errorHtml = error ? `<p class="error">${error}</p>` : "";
  const footerHtml = footer ? `<p class="footer">${footer}</p>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${title}</title>
    <style>
      @import url(https://fonts.googleapis.com/css2?family=Jaro:opsz@6..72&family=Passero+One&display=swap);
      :root {
        color-scheme: dark;
        --bg: #111;
        --panel: #1a1a1a;
        --panel2: #222;
        --text: #f5e6d0;
        --muted: #8a7a6a;
        --accent: #ff6a00;
        --accent2: #ff9900;
        --border: #2e2e2e;
        --glow: rgba(255, 106, 0, 0.15);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Passero One", sans-serif;
        background: var(--bg);
        color: var(--text);
        overflow: hidden;
      }
      body::before {
        content: "";
        position: fixed;
        inset: 0;
        background-image:
          linear-gradient(rgba(255, 106, 0, 0.04) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255, 106, 0, 0.04) 1px, transparent 1px);
        background-size: 32px 32px;
        pointer-events: none;
        z-index: -1;
      }
      .card {
        width: min(100%, 31rem);
        padding: 2rem;
        border-radius: 8px;
        background: var(--panel);
        border: 1px solid var(--border);
        box-shadow: 0 0 40px rgba(255, 106, 0, 0.05);
      }
      h1 {
        margin: 0 0 0.5rem;
        font-size: 2rem;
        color: var(--accent);
        text-shadow: 0 0 20px var(--glow);
      }
      p { margin: 0 0 1rem; color: var(--muted); }
      label { display: block; margin: 1rem 0 0.4rem; font-size: 0.95rem; }
      input {
        width: 100%;
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.85rem 1rem;
        font: inherit;
        color: var(--text);
        background: var(--panel2);
        outline: none;
      }
      button,
      a.button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid transparent;
        border-radius: 999px;
        padding: 0.95rem 1.2rem;
        font: inherit;
        font-weight: 700;
        color: #180d04;
        background: linear-gradient(135deg, var(--accent), var(--accent2));
        cursor: pointer;
        text-decoration: none;
      }
      .secondary {
        background: transparent;
        color: var(--text);
        border-color: var(--border);
      }
      .button-row {
        display: flex;
        gap: 0.75rem;
        flex-wrap: wrap;
        margin-top: 1.25rem;
      }
      .client {
        display: inline-block;
        margin-bottom: 1rem;
        border-radius: 999px;
        padding: 0.35rem 0.7rem;
        font-size: 0.8rem;
        color: var(--accent2);
        background: rgba(255, 106, 0, 0.08);
        border: 1px solid var(--border);
      }
      .error {
        color: #ffb4aa;
        background: rgba(231, 76, 60, 0.14);
        padding: 0.8rem 1rem;
        border-radius: 8px;
        border: 1px solid rgba(231, 76, 60, 0.3);
      }
      .footer {
        margin-top: 1rem;
        color: var(--muted);
        font-size: 0.95rem;
      }
      .stack {
        display: grid;
        gap: 0.8rem;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="client">${clientName}</div>
      <h1>${heading}</h1>
      <p>${description}</p>
      ${errorHtml}
      ${body}
      ${footerHtml}
    </main>
  </body>
</html>`;
}

function renderHiddenOauthFields(query) {
  return hiddenFields(query);
}

export function renderAuthorizePage({ query, clientName, error = "" }) {
  const registerHref = `/authorize/register?${queryString(query)}`;
  return renderPage({
    clientName,
    title: "Felixx Sign In",
    heading: "Sign in to Felixx",
    description: `${clientName} is requesting a trusted first-party sign-in. No consent screen is required.`,
    error,
    body: `
      <form method="post" action="/authorize/login">
        ${renderHiddenOauthFields(query)}
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password" required>
        <div class="button-row">
          <button type="submit">Continue</button>
        </div>
      </form>
      <div class="footer">
        New here? <a class="button secondary" href="${registerHref}">Create account</a>
      </div>
    `
  });
}

export function renderRegisterPage({ query, clientName, error = "" }) {
  return renderPage({
    clientName,
    title: "Felixx Create Account",
    heading: "Create a Felixx account",
    description: `${clientName} is requesting a trusted first-party account creation flow. A verification email will be sent after signup.`,
    error,
    body: `
      <form method="post" action="/authorize/register" class="stack">
        ${renderHiddenOauthFields(query)}
        <label for="name">Name</label>
        <input id="name" name="name" type="text" autocomplete="name" placeholder="Felixx">
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email" required>
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="new-password" required>
        <label for="confirmPassword">Confirm password</label>
        <input id="confirmPassword" name="confirmPassword" type="password" autocomplete="new-password" required>
        <div class="button-row">
          <button type="submit">Create account</button>
        </div>
      </form>
      <div class="footer">
        Already have an account?
        <a class="button secondary" href="/authorize?${queryString(query)}">Back to sign in</a>
      </div>
    `
  });
}

export function renderVerificationSentPage({ query, clientName, email = "" }) {
  const backButton = hiddenFields(query);
  return renderPage({
    clientName,
    title: "Verify your email",
    heading: "Check your email",
    description: `We created the account for ${email || "your address"} and sent a verification email.`,
    body: `
      <p>Open the verification link in your inbox, then return here to sign in.</p>
      <form method="get" action="/authorize">
        ${backButton}
        <div class="button-row">
          <button type="submit">Back to sign in</button>
        </div>
      </form>
    `,
    footer: "If you do not see the email, check spam or contact the site owner to confirm email delivery is configured."
  });
}
