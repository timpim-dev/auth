function hiddenFields(params) {
  return Object.entries(params)
    .map(
      ([key, value]) =>
        `<input type="hidden" name="${key}" value="${String(value || "").replace(/"/g, "&quot;")}">`
    )
    .join("");
}

export function renderAuthorizePage({ query, clientName, error = "" }) {
  const fields = hiddenFields(query);
  const errorHtml = error ? `<p class="error">${error}</p>` : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Felixx Sign In</title>
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
      p { margin: 0 0 1.25rem; color: var(--muted); }
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
      button {
        border: 1px solid transparent;
        border-radius: 999px;
        padding: 0.95rem 1.2rem;
        font: inherit;
        font-weight: 700;
        color: #180d04;
        background: linear-gradient(135deg, var(--accent), var(--accent2));
        cursor: pointer;
      }
      .button-row {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 1rem;
        padding: 0.25rem;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid var(--border);
      }
      .tab-button {
        flex: 1;
        margin: 0;
        background: transparent;
        color: var(--text);
        border: 0;
        padding: 0.8rem 1rem;
      }
      .tab-button.active {
        background: linear-gradient(135deg, var(--accent), var(--accent2));
        color: #180d04;
      }
      .panel {
        display: none;
      }
      .panel.active {
        display: block;
      }
      .submit-button {
        width: 100%;
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
    </style>
  </head>
  <body>
    <main class="card">
      <div class="client">${clientName}</div>
      <h1>Sign in to Felixx</h1>
      <p>${clientName} is requesting a trusted first-party sign-in. No consent screen is required.</p>
      ${errorHtml}
      <div class="button-row" role="tablist" aria-label="Authentication mode">
        <button class="tab-button active" type="button" data-tab="signin">Sign in</button>
        <button class="tab-button" type="button" data-tab="register">Create account</button>
      </div>

      <form class="panel active" data-panel="signin" method="post" action="/authorize/login">
        ${fields}
        <label for="email">Email</label>
        <input id="signin-email" name="email" type="email" autocomplete="email" required>
        <label for="password">Password</label>
        <input id="signin-password" name="password" type="password" autocomplete="current-password" required>
        <button class="submit-button" type="submit">Continue</button>
      </form>

      <form class="panel" data-panel="register" method="post" action="/authorize/register">
        ${fields}
        <label for="name">Name</label>
        <input id="name" name="name" type="text" autocomplete="name" placeholder="Felixx">
        <label for="register-email">Email</label>
        <input id="register-email" name="email" type="email" autocomplete="email" required>
        <label for="register-password">Password</label>
        <input id="register-password" name="password" type="password" autocomplete="new-password" required>
        <label for="confirm-password">Confirm password</label>
        <input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" required>
        <button class="submit-button" type="submit">Create account</button>
      </form>
    </main>
    <script>
      const tabs = [...document.querySelectorAll(".tab-button")];
      const panels = [...document.querySelectorAll(".panel")];

      for (const tab of tabs) {
        tab.addEventListener("click", () => {
          const target = tab.dataset.tab;
          for (const item of tabs) item.classList.toggle("active", item === tab);
          for (const panel of panels) panel.classList.toggle("active", panel.dataset.panel === target);
        });
      }
    </script>
  </body>
</html>`;
}
