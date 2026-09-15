# Alerts

GitHub security dashboard on **Cloudflare Workers** — Dependabot, code scanning, and secret scanning alerts across all your repositories.

Live site (once configured): `https://alerts.gillfamily.co.nz`

## Cloudflare configuration

### Client ID (in git)

Set in **`wrangler.toml`** under `[vars]` → `GITHUB_CLIENT_ID`. It is redeployed on every build. The client ID is public (the browser receives it via `/api/config`).

### Client secret (dashboard only)

**Worker → Settings → Variables and Secrets** → **Production** → add **`GITHUB_CLIENT_SECRET`** as a **Secret**.

Never commit the client secret.

**Build command** (Git): `npx wrangler deploy`  
**Build variable:** `CLOUDFLARE_API_TOKEN`

## Custom domain only

`wrangler.toml` sets **`workers_dev = false`** and **`preview_urls = false`**.

Set **`CANONICAL_HOST`** to `alerts.gillfamily.co.nz`. Attach the domain under **Workers → Settings → Domains & Routes**.

OAuth callback: `https://alerts.gillfamily.co.nz/auth/callback` only.

## GitHub OAuth App

Create a **new** OAuth App at [Developer settings](https://github.com/settings/developers):

- **Application name:** Alerts (or similar)
- **Homepage URL:** `https://alerts.gillfamily.co.nz`
- **Authorization callback URL:** `https://alerts.gillfamily.co.nz/auth/callback`
- Copy the **Client ID** into `wrangler.toml` → `GITHUB_CLIENT_ID`
- Create a **Client secret** and store it as Cloudflare secret `GITHUB_CLIENT_SECRET`

The app requests scopes: `repo` and `security_events`.

## Verify

- `https://alerts.gillfamily.co.nz/api/config` → `{"clientId":"…","configured":true,"canonicalHost":"alerts.gillfamily.co.nz"}`
- Hard-refresh the app → **Connect GitHub**
- Dashboard loads open alerts; click a row for detail, or a repo name for that repo’s alerts
- **Refresh** re-fetches from GitHub

## Local develop

```bash
npm install
npx wrangler dev
```

Localhost is allowed by the Worker host check even when `CANONICAL_HOST` is set.

## Layout

```
index.html, auth/callback/, css/, js/
worker/index.js     /api/config, /api/oauth-token
wrangler.toml, package.json
js/bootstrap.js     loads config from Worker, then app scripts
js/alerts.js        aggregation, routing helpers
js/render.js        dashboard / repo / detail views
js/app.js           app state + navigation
```
