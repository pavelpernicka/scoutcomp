# ScoutComp - Open Source Scout Competition Platform

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

## Quick Start for development

1. **Backend Setup:**
   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   uvicorn app.main:app --reload --port 8001
   ```

2. **Frontend Setup:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Access the Application:**
   - Frontend: `http://localhost:5173`
   - API Documentation (Swagger UI): `http://localhost:8001/docs` or `http://localhost:5173/api/docs`
   - Alternative API Docs (ReDoc): `http://localhost:8001/redoc` or `http://localhost:5173/api/redoc`

The frontend automatically proxies API requests to `/api` endpoints.

## Configuration

Core options live in `config.yaml` and can be overridden with environment variables:

- global `SCOUTCOMP_SECRET_KEY` — JWT signing key (required for production)
- global `SCOUTCOMP_DB_URL` — SQLAlchemy connection URL (defaults to local SQLite)
- `app.default_language` / `app.supported_languages` — localization defaults
- `app.features.allow_self_registration` — enable member sign-up via join code
- `app.developer_mode` or `SCOUTCOMP_DEVELOPER_MODE` — allow bootstrap of admin users when developing or on first run

### Runtime Configuration

Administrators can configure the following settings on Global settings page:

- **Application Name** — Customize the app title -- rebranding
- **Leaderboard Default View** — Choose wheather to display total or average points of group at leaderboard

## Development & Testing

### Testing
- **Backend Testing:** `pytest backend/tests`
- **Frontend Linting:** `npm run lint`
- **Frontend Testing:** `npm test`

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
The included `docker-compose.yml` runs both services together, just launch:

```bash
# First time setup
docker-compose up --build

# Regular usage
docker-compose up
```

### Production Deployment
- Create `.env` file in projects top-level directory:
```bash
SCOUTCOMP_SECRET_KEY=aaabbbccc
SCOUTCOMP_DB_URL="sqlite:///./data/database.db"
SCOUTCOMP_DEVELOPER_MODE=false
SCOUTCOMP_BACKEND_PORT=8001
SCOUTCOMP_FRONTEND_PORT=3200
```
- Generate value of `SCOUTCOMP_SECRET_KEY` using f.e. `openssl rand -hex 32`
- Test current setup using `docker compose -f docker-compose.prod.yml up -d --build`
- If it gives errors about ports in use, change them in environment
- If it works, you can set-up autostart by changing `restart` to `allways` in `docker-compose.prod.yml` or f.e. using systemd service
- Set up reverse proxy using nginx:
  - Create config /etc/nginx/sites-available/scoutcomp:
  ```bash
  server {
    server_name some.address.tld;

    # Frontend
    location / {
      proxy_pass http://127.0.0.1:3200;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Backend
    location /api/ {
      proxy_pass http://127.0.0.1:8001/;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
    }

    listen 80;
  }

  ```
  - Activate this config: `ln -s /etc/nginx/sites-available/scoutcomp /etc/nginx/sites-enabled/`
  - Reload nginx: `systemctl reload nginx`
  
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
