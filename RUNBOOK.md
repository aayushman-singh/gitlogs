# RUNBOOK — gitlogs

Operational guide for the **keyed production path** (the full product: GitHub
OAuth, X OAuth, Gemini, live posting) and the **keyless demo deploy** (the
public `/demo` showcase). Every secret below is templated — fill in your own.

---

## 0. Secret rotation (do this FIRST)

The repository's history is clean of real secrets (`.env` was never committed;
`.env.example` was scrubbed of the partial OAuth credentials it once held). But
the live credentials that previously sat in a local `.env` should be treated as
compromised and **rotated before any production deploy**:

| Credential | Where to rotate |
| --- | --- |
| GitHub OAuth client secret | github.com/settings/developers → your OAuth app → "Generate a new client secret" |
| X / Twitter OAuth2 client secret | developer.twitter.com → your app → Keys and tokens → regenerate |
| X / Twitter API key/secret + access token/secret + bearer | same X app → regenerate all |
| Gemini API key | aistudio.google.com/app/apikey → revoke + create new |
| Cloudflare API token | dash.cloudflare.com → My Profile → API Tokens → roll |
| `WEBHOOK_SECRET` | regenerate: `openssl rand -hex 20` (then update each repo's webhook) |
| `ADMIN_API_KEY` | regenerate: `openssl rand -hex 32` |

After rotating, put the new values **only** in the server's `.env` (git-ignored)
and in your deploy provider's secret store. Never commit them.

---

## 1. Provision the integrations (one-time)

1. **GitHub OAuth app** — github.com/settings/developers → New OAuth App.
   - Homepage: `https://<your-frontend-domain>`
   - Callback: `https://<your-api-domain>/auth/github/callback`
   - Copy `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.
2. **X (Twitter) app** — developer.twitter.com → Project → App with **OAuth 2.0**.
   - Type: Web App / Confidential client.
   - Callback: `https://<your-api-domain>/auth/x/callback`
   - Scopes: `tweet.read tweet.write users.read offline.access`.
   - Copy `OAUTH_CLIENT_ID` / `OAUTH_CLIENT_SECRET` (+ the API keys/tokens).
3. **Gemini** — aistudio.google.com/app/apikey → `GEMINI_API_KEY`.

---

## 2. Configure `.env`

```bash
cp .env.example .env
```

Fill in (see `.env.example` for the full annotated list):

```ini
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://<your-frontend-domain>
API_BASE_URL=https://<your-api-domain>

GITHUB_CLIENT_ID=<rotated>
GITHUB_CLIENT_SECRET=<rotated>

OAUTH_CLIENT_ID=<rotated>          # X OAuth2 client id
OAUTH_CLIENT_SECRET=<rotated>
OAUTH_CALLBACK_URL=https://<your-api-domain>/auth/x/callback

GEMINI_API_KEY=<rotated>
GEMINI_MODEL=gemini-2.5-flash

WEBHOOK_SECRET=<openssl rand -hex 20>   # REQUIRED — HMAC fails CLOSED without it
ADMIN_API_KEY=<openssl rand -hex 32>
DATABASE_PATH=./tweets.db
ALLOWED_REPOS=                          # empty = accept all enabled repos
```

> **Fail-closed note:** with no `WEBHOOK_SECRET`, every incoming webhook is
> rejected (401). This is intentional — a missing secret is a misconfiguration,
> not a reason to trust unsigned payloads.

---

## 3. One-command server bring-up (EC2 / any Node host)

```bash
git clone https://github.com/aayushman-singh/git-twitter-bot.git ~/gitlogs
cd ~/gitlogs
corepack enable && corepack prepare pnpm@latest --activate   # if pnpm absent
pnpm install --frozen-lockfile
pnpm --dir frontend install --frozen-lockfile
VITE_API_BASE=https://<your-api-domain> pnpm --dir frontend run build
# (.env already in place from step 2)
node src/server.js     # or via systemd, below
```

The backend serves the built SPA from `frontend/dist` and exposes the API +
`/webhook/github` on `PORT`.

### systemd unit (template)

`/etc/systemd/system/gitlogs.service`:

```ini
[Unit]
Description=gitlogs
After=network.target

[Service]
Type=simple
User=<deploy-user>
WorkingDirectory=/home/<deploy-user>/gitlogs
EnvironmentFile=/home/<deploy-user>/gitlogs/.env
ExecStart=/usr/bin/node src/server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now gitlogs
sudo systemctl status gitlogs
```

---

## 4. Continuous deploy (GitHub Actions → EC2)

`.github/workflows/deploy-ec2.yml` SSHes in on push to `main`, pulls, installs
from the frozen lockfiles, **builds the frontend**, and restarts the service.

Required repo **Actions secrets** (Settings → Secrets and variables → Actions):

| Secret | Value |
| --- | --- |
| `EC2_HOST` | server hostname / IP |
| `EC2_USER` | ssh user (the systemd `User=`) |
| `EC2_SSH_KEY` | private key authorized on the host |
| `EC2_PORT` | ssh port (optional, defaults to 22) |

Also set `VITE_API_BASE` in the deploy environment (or edit the workflow's
default) so the SPA is built against the right API origin.

> **Known tradeoff (codex review):** the workflow currently builds on the prod
> host. For a hardened setup, build the SPA artifact in CI and ship only
> `frontend/dist` to the host, so prod carries no dev/build toolchain. Tracked
> as a follow-up; the current approach is fine for a single small instance.

---

## 5. DNS

The historical hosts `gitlogs.aayushman.dev` / `api-gitlogs.aayushman.dev` are
NXDOMAIN. Point:

- `<your-frontend-domain>` → the host (or the static SPA deploy).
- `<your-api-domain>` → the EC2 instance running the backend.

Update the GitHub + X OAuth callback URLs and `.env` to match.

---

## 6. Keyless demo deploy (Vercel / Cloudflare Pages)

The `/demo` route is fully client-side (no backend, no keys) — ideal for a
static host. Because `frontend/src/utils/api.js` fails loudly in production
builds when `VITE_API_BASE` is unset, pass a value at build time even though the
demo never calls it.

**Vercel** (root directory = `frontend/`):
- Build command: `pnpm build`
- Output dir: `dist`
- Env: `VITE_API_BASE = https://<your-api-domain>` (or any placeholder)
- `frontend/vercel.json` already provides the SPA rewrite so `/demo` deep-links.

```bash
# from the frontend/ directory, with the Vercel CLI authenticated:
VITE_API_BASE=https://gitlogs.example pnpm build
npx vercel deploy --prebuilt --prod   # or `npx vercel` and follow prompts
```

**Cloudflare Pages**:
- Build command: `pnpm build`  · Output: `frontend/dist`  · Root: `frontend`
- Or direct upload: `npx wrangler pages deploy frontend/dist`

After deploying, update the **Demo** badge/link in `README.md` with the live URL.

---

## 7. Verify a deploy

```bash
curl -s https://<your-api-domain>/api/health        # → 200 JSON
# Push a commit to an enabled repo, then check the X account + logs:
sudo journalctl -u gitlogs -f
```

A correctly working pipeline logs: signature verified → repo/user resolved →
diff fetched → Stage 1/2 Gemini → queued → posted tweet id → persisted.
