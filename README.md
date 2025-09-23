# ScoutComp - Open Source Scout Competition Platform

A modern FastAPI + React web application for running scout competitions. Features include a progress dashboard, seasonal task completion, visual leaderboards, and comprehensive admin management tools.

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

- `SCOUTCOMP_SECRET_KEY` — JWT signing key (required for production)
- `SCOUTCOMP_DB_URL` — SQLAlchemy connection URL (defaults to local SQLite)
- `app.default_language` / `app.supported_languages` — localization defaults
- `app.features.allow_self_registration` — enable member sign-up via join code
- `app.developer_mode` or `SCOUTCOMP_DEVELOPER_MODE` — allow bootstrap of admin users when developing or on first run

### Runtime Configuration

Administrators can configure the following settings on Global settings page:

- **Application Name** — Customize the app title -- rebranding
- **Leaderboard Default View** — Choose wheather to display total or average points of group at leaderboard

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

### Docker Compose
The included `docker-compose.yml` runs both services together:

```bash
# First time setup
docker-compose up --build

# Regular usage
docker-compose up
```

### Production Considerations
- Set `SCOUTCOMP_SECRET_KEY` to a secure random value
- Configure `SCOUTCOMP_DB_URL` for production database
- Disable `developer_mode` in production

