# ScoutComp

Modulární aplikace pro skautské oddíly. Jádro poskytuje účty, skupiny
oprávnění, zprávy a nástěnku; soutěže, sklad a skautská činnost jsou samostatné
moduly spravované v registru.

A modern FastAPI + React web application for running scout competitions. Features include a progress dashboard, seasonal task completion, visual leaderboards, and comprehensive admin management tools.

## Features

### User Management
- **Self-Registration:** Members can register using team join codes
- **Admin Bootstrap:** First-time admin account creation when no admin exists (nice for testing, can be disabled, of course)
- **User Settings:** Profile management and password changes
- **Multi-language Support:** currently supports Czech and English

### Task Management
- **Task Creation:** Admins can create tasks with Markdown descriptions (but no visual editor yet)
- **Approval Workflow:** Optional task completion approval process
- **Progress Tracking:** Real-time progress monitoring for users
- **Scheduling:** Tasks can have start/end times and completion limits with optional periodical resets

### Competition Features
- **Leaderboards:** Member and team rankings
- **Progress Dashboard:** Personal task completion status
- **Notifications:** In-app feedback system
- **Team Management:** Group organization with join codes

## Admin Console

Administrators have access to comprehensive management tools:

- **Global Configuration** — Customize app name, leaderboard defaults, and system settings
- **Task Administration** — Create, edit, and archive tasks with period limits and approval workflows
- **Team Management** — Organize groups, rotate join codes, and manage member assignments
- **User Management** — Create accounts, manage permissions, and oversee user activities
- **Approval Workflow** — Review task completions with feedback and instant notifications
- **Statistics & Analytics** — Monitor platform usage and competition progress
- **Announcements** — Send important messages to users

Key admin features:
- **Markdown Support:** Rich text formatting for task descriptions with live preview
- **Real-time Updates:** Instant feedback system for user interactions
- **Role-based Access:** Admin, group admin, and member permission levels

## Prerequisites
- Python 3.11+
- Node.js 20+
- DB: SQLite (bundled) or PostgreSQL/MariaDB if configured

## Rychlý start

Stačí Python 3.11+, Node.js 20+ a GNU Make (na Linuxu je obvykle předinstalovaný):

```bash
make dev
```

Spustí lokálně backend i frontend s automatickým načítáním změn, bez Dockeru.
Při prvním běhu vytvoří `backend/.venv` a nainstaluje závislosti; při dalších
spuštěních je znovu instaluje jen po změně `requirements.txt` nebo `package-lock.json`.
Pokud v projektu zůstaly soubory vytvořené starší Docker instalací, spouštěč je
automaticky odloží stranou a vytvoří čisté lokální `node_modules`.
Testy obou částí spustíte jediným příkazem:

```bash
make test
```

Další běžné příkazy: `make start` (alias pro `make dev`), `make test`, `make docker-dev` (volitelná Docker varianta) a `make` pro nápovědu.

Po spuštění je k dispozici:

   - Frontend: `http://localhost:5173`
   - Veřejný web: `http://localhost:8090`
   - API Documentation (Swagger UI): `http://localhost:8001/docs` or `http://localhost:5173/api/docs`
   - Alternative API Docs (ReDoc): `http://localhost:8001/redoc` or `http://localhost:5173/api/redoc`

The frontend automatically proxies API requests to `/api` endpoints.

## Configuration

Core options live in `config.yaml` and can be overridden with environment variables:

- global `SCOUTCOMP_SECRET_KEY` — JWT signing key (required for production)
- global `SCOUTCOMP_DB_URL` — SQLAlchemy connection URL (defaults to local SQLite)
- `app.default_language` / `app.supported_languages` — localization defaults
- `app.timezone` or `SCOUTCOMP_TIMEZONE` — IANA timezone used for calendar display (defaults to `Europe/Prague`)
- `app.push.*` or `SCOUTCOMP_PUSH_*` — optional stable VAPID configuration for browser notifications
- `app.features.allow_self_registration` — enable member sign-up via join code
- `app.developer_mode` or `SCOUTCOMP_DEVELOPER_MODE` — allow bootstrap of admin users when developing or on first run

### Runtime Configuration

Administrators can configure the following settings on Global settings page:

- **Application Name** — Customize the app title -- rebranding
- **Leaderboard Default View** — Choose wheather to display total or average points of group at leaderboard

## Development & Testing

### Testing

Použijte `make test`; spustí backendové i frontendové testy ve správně
připravených kontejnerech, bez lokální instalace Pythonu nebo Node.js.

Continuous integration is defined in `.github/workflows/ci.yml` to run these checks on pushes and pull requests.

## Database Management

### Automatic Migrations (TODO)
- Migrations run automatically on application startup
- Defined in `app/migrations.py` and tracked in the `schema_migrations` table, but in futureit needs to be done different way

#### Schema Evolution
When making schema changes:
1. Add a new migration function in `app/migrations.py`
2. Use a unique identifier to prevent conflicts
3. Test locally before deployment to ensure data integrity

## Deployment

### Non-production use
The included `docker-compose.yml` runs the API, public site, and editor frontend together, just launch:

```bash
# First time setup
docker-compose up --build

# Regular usage
docker-compose up
```

### Production Deployment

Produkční Compose spouští tři oddělené služby nad jednou databází a adresářem
`./data`:

| Služba | Proces v kontejneru | Port v kontejneru | Výchozí port na hostu | Veřejné použití |
| --- | --- | ---: | ---: | --- |
| `backend` | FastAPI `app.main:app` | 8000 | `${SCOUTCOMP_BACKEND_PORT}` (např. 8001) | API pod `https://app…/api/` |
| `frontend` | nginx se SPA/PWA | 80 | `${SCOUTCOMP_FRONTEND_PORT}` (např. 3200) | celé `https://app…/` kromě `/api/` |
| `site` | FastAPI `app.site_app:app` | 8090 | `${SCOUTCOMP_SITE_PORT}` (např. 8090) | celé `https://www…/` |

Všechny publikované porty jsou v `docker-compose.prod.yml` vázané pouze na
`127.0.0.1`; do internetu se vystavuje jen edge nginx na 80/443. Hodnoty portů
se nastavují v kořenovém `.env`. Stejné hodnoty musí být v `server` řádcích
upstreamů v `deploy/nginx/scoutcomp.conf.example`. Porty uvnitř kontejnerů
`8000`, `80` a `8090` neměňte, pokud zároveň neupravíte Compose, healthchecky a
proxy konfiguraci.

- Create `.env` file in projects top-level directory:
```bash
SCOUTCOMP_SECRET_KEY=aaabbbccc
SCOUTCOMP_DB_URL="sqlite:///./data/database.db"
SCOUTCOMP_DEVELOPER_MODE=false
SCOUTCOMP_BACKEND_PORT=8001
SCOUTCOMP_FRONTEND_PORT=3200
SCOUTCOMP_SITE_PORT=8090
SCOUTCOMP_SITE_PUBLIC_URL="https://www.example.cz"
SCOUTCOMP_TIMEZONE="Europe/Prague"
# Optional browser notifications (Web Push):
SCOUTCOMP_PUSH_ENABLED=true
SCOUTCOMP_PUSH_VAPID_PUBLIC_KEY="..."
SCOUTCOMP_PUSH_VAPID_PRIVATE_KEY="..."
SCOUTCOMP_PUSH_VAPID_SUBJECT="mailto:admin@some.address.tld"
# Optional comma-separated override; defaults cover Chrome, Firefox, Safari and Edge:
SCOUTCOMP_PUSH_ALLOWED_HOSTS="fcm.googleapis.com,updates.push.services.mozilla.com,web.push.apple.com,.notify.windows.com"
```
- Generate value of `SCOUTCOMP_SECRET_KEY` using f.e. `openssl rand -hex 32`
- `SCOUTCOMP_SITE_PUBLIC_URL` is the canonical **origin of the public website**.
  Use only `https://host` without a path, query or fragment. It is used for
  absolute canonical links, `sitemap.xml` and `robots.txt`; after changing it,
  run **Web → Regenerate public pages** because page HTML is an immutable
  publication artifact.
- The PWA does not have a configured target hostname. Its manifest, service
  worker and API URLs are same-origin and therefore the same image can be
  deployed at any HTTPS hostname, provided the app is mounted at `/`. PWA
  installation and Web Push require HTTPS (localhost is the development
  exception). Generate the VAPID key pair once and keep it stable.

### Enabling browser notifications

Web Push requires a stable VAPID key pair and HTTPS on the authenticated app
hostname. Generate the pair once in the persistent `data` volume:

```bash
docker compose -f docker-compose.prod.yml run --rm --workdir /app/data backend vapid --gen
docker compose -f docker-compose.prod.yml run --rm --workdir /app/data backend \
  vapid --private-key private_key.pem --applicationServerKey
chmod 600 data/private_key.pem
```

The second command prints `Application Server Key = ...`. Copy that value and
configure the root `.env` file as follows (the private-key path is the path
inside the backend container):

```bash
SCOUTCOMP_PUSH_ENABLED=true
SCOUTCOMP_PUSH_VAPID_PUBLIC_KEY="<Application Server Key>"
SCOUTCOMP_PUSH_VAPID_PRIVATE_KEY="/app/data/private_key.pem"
SCOUTCOMP_PUSH_VAPID_SUBJECT="mailto:admin@example.cz"
```

Apply the configuration and verify that the app is served through HTTPS:

```bash
docker compose -f docker-compose.prod.yml up -d --build backend
```

Users can then enable notifications themselves in their account settings;
the browser permission prompt is only shown after they click the enable
button. Keep `private_key.pem` backed up and never commit it. Changing or losing
the key requires users to create new push subscriptions.

- Test current setup using `docker compose -f docker-compose.prod.yml up -d --build`
- If a loopback port is already occupied, change the matching
  `SCOUTCOMP_*_PORT` value in `.env` **and** its nginx upstream.
- Containers already use `restart: unless-stopped`; Docker itself must be
  enabled at boot (or the Compose project can be managed by systemd).
- Put the authenticated app and public website on separate origins. The app
  service worker owns scope `/` and must never control public website pages:
  - `app.example.cz` → frontend/PWA; `/api/` → authenticated API
  - `www.example.cz` → public SSR website only
- A complete TLS, proxy-cache, rate-limit and upstream keepalive example is in
  [`deploy/nginx/scoutcomp.conf.example`](deploy/nginx/scoutcomp.conf.example).
  Replace hostnames/certificate paths, enable it, run `nginx -t`, and only then
  reload nginx.

The authenticated app has no target-domain setting: navigation, API calls,
manifest and service worker are same-origin. `SCOUTCOMP_SITE_PUBLIC_URL` is a
different value—the canonical origin of the public SSR website used by search
engines. A non-standard public HTTPS port is allowed as part of that origin,
for example `https://www.example.cz:8443`, although port 443 is recommended.

### Moving to another domain

1. Point the new DNS name at the edge proxy and issue its TLS certificate.
2. Change `SCOUTCOMP_SITE_PUBLIC_URL` for the public site, redeploy and run a
   full public-page regeneration.
3. Keep the old **public website** domain online and permanently redirect every
   path/query to the new hostname. Submit the new sitemap in Search Console.
4. A PWA installation, Cache Storage and Push subscription belong to a browser
   origin. When the **app** hostname changes, browsers treat it as a new PWA;
   users must open/install the new origin and enable notifications again. VAPID
   keys may remain the same, but they cannot migrate an origin-bound subscription.

### Capacity and scaling

- The included SQLite setup is intended for a small, single-node installation.
  Connections use WAL, foreign-key enforcement and a 30-second busy timeout so
  short publication/write bursts do not unnecessarily block public reads.
  The sample nginx caches public GET/HEAD responses briefly, locks cache fills
  and can serve stale pages during upstream failures, which absorbs normal
  crawler traffic and short spikes.
- For sustained traffic or multiple application replicas, use PostgreSQL,
  shared media/object storage and a separate one-shot migration job before
  starting multiple API/site workers. Do not scale SQLite writers horizontally.
- Public page bodies are pre-rendered immutable artifacts, but post/event
  details and media-publication checks still reach the database. Monitor request
  latency, database locks, 5xx responses and nginx cache hit ratio before adding
  replicas. A dependency-indexed artifact/media reference table is the next
  architectural step for substantially larger sites.
  
# Frontend Translation System

## Overview
The application uses a JSONC-based translation system that automatically extracts translation keys from source code and provides helpful comments for translators.

## Translation Workflow

1. **Extract translation keys** from source code:
   ```bash
   npm run translations:extract
   ```
   This creates/updates `.jsonc` files in `src/translations/` with:
   - English reference comments for context
   - Variable information from source code usage
   - Placeholder values for untranslated keys

2. **Start development server** (with auto-rebuilding):
   ```bash
   npm run dev
   ```
   This automatically watches `.jsonc` files and rebuilds `.json` files when you make changes.

3. **View translation statistics**:
   ```bash
   npm run translations:stats
   ```

4. **Translate the strings** by editing the `.jsonc` files:
   - Remove placeholder prefixes like `[CS]` and `[EN]`
   - Use English reference comments for context
   - Use variable comments to know what interpolations are available
   - Changes are automatically built into `.json` files while `npm run dev` is running

## File Structure
- `src/translations/*.jsonc` - Source files for translators (with comments)
- `src/translations/*.json` - Generated build files (auto-created, gitignored)

## Usage in Code
Translation strings use `t("key")` and `t("key", { params })`:
```jsx
t("dashboard.welcome", { username: "John" })
t("tasks.completed")
```

## Example JSONC Format
```jsonc
{
  "dashboard": {
    // EN: Welcome {{username}}! Join a team to get started.
    "welcomeNoGroup": "[CS] dashboard.welcomeNoGroup",
    "totalPoints": "Celkem bodů: {{points}}", // Variables: points
    // EN: Announcements
    "announcements": "Oznámení"
  }
}
```
