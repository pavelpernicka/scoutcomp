# ScoutComp Project Documentation

## Overview

ScoutComp is a comprehensive web application for scout organizations to manage competitions, events, attendance, inventory, and team collaboration. Built with a modern tech stack, it provides a modular architecture that allows extending functionality through plugins/modules.

## Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.11+)
- **Database**: PostgreSQL with SQLAlchemy ORM
- **Authentication**: JWT-based with role-based access control (RBAC)
- **Migrations**: Custom migration system
- **Permissions**: Fine-grained permission system with scopes (team, any, own)

### Frontend
- **Framework**: React 18 with Vite
- **State Management**: React Query (TanStack Query) for server state
- **Routing**: React Router v6
- **Internationalization**: i18next with Czech and English support
- **UI Components**: Custom components with Bootstrap 5
- **Charts**: Recharts for statistics

### Infrastructure
- **Containerization**: Docker & Docker Compose
- **Database**: PostgreSQL 15+
- **Reverse Proxy**: Nginx (production)

## Project Structure

```
scoutcomp/
├── backend/
│   ├── app/
│   │   ├── main.py              # Application entry point, module registration
│   │   ├── config.py            # Configuration management
│   │   ├── database.py          # Database connection & session management
│   │   ├── models.py            # SQLAlchemy models
│   │   ├── schemas.py           # Pydantic schemas
│   │   ├── dependencies.py      # FastAPI dependencies
│   │   ├── permissions.py       # Permission system
│   │   ├── module_gate.py       # Module access middleware
│   │   ├── migrations.py        # Database migration system
│   │   ├── modules/             # Module system
│   │   └── routers/             # API endpoints
│   │       ├── activity.py      # Calendar & attendance
│   │       ├── announcements.py # Competition announcements
│   │       ├── auth.py          # Authentication
│   │       ├── completions.py   # Task completions
│   │       ├── config.py        # Configuration API
│   │       ├── inventory.py     # Inventory management
│   │       ├── leaderboard.py   # Competition leaderboard
│   │       ├── messages.py      # Direct messages
│   │       ├── modules.py       # Module management
│   │       ├── notifications.py # Notifications
│   │       ├── static_pages.py  # Static content
│   │       ├── stat_categories.py
│   │       ├── tasks.py         # Competition tasks
│   │       ├── teams.py         # Team management
│   │       ├── users.py         # User management
│   │       └── widgets.py       # Dashboard widgets
│   ├── tests/                   # Backend tests
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/          # Reusable UI components
│   │   ├── pages/               # Page components
│   │   ├── providers/           # React context providers
│   │   ├── services/            # API service layer
│   │   ├── translations/        # i18n translations (.jsonc)
│   │   ├── utils/               # Utility functions
│   │   ├── modules/             # Feature modules (inventory, etc.)
│   │   ├── App.jsx              # Main app with routing
│   │   └── main.jsx             # Entry point
│   ├── scripts/
│   │   └── build-translations.js # Translation builder
│   └── Dockerfile
├── docs/                        # This documentation
└── docker-compose.yml
```

## Coding Practices

### Backend

#### 1. Module System
- Every feature is a **module** registered in `main.py`
- Modules declare permissions, menu items, widgets, and admin menus
- Core module is mandatory; others can be enabled/disabled

#### 2. Permission System
```python
# Permission format: "module_code.permission_code"
# Scopes: "any" (global), "team" (team-scoped), "own" (user's own resources)

# Checking permissions in endpoints:
from ..permissions import allows

if not allows(db, current_user, "core.events.read"):
    raise HTTPException(403, "Missing permission")

# Team-scoped permissions:
if not allows(db, current_user, "core.events.create", team_id=payload.team_id):
    raise HTTPException(403, "Missing permission")
```

#### 3. Database Models
- Use SQLAlchemy declarative base
- Always include `created_at` and `updated_at` timestamps
- Use `func.now()` for server-side timestamps
- Define relationships with `back_populates`
- Use `UniqueConstraint` for composite unique keys

#### 4. API Endpoints
- Use Pydantic models for request/response validation
- Follow REST conventions
- Return serialized data with consistent structure
- Use proper HTTP status codes (201 for create, 204 for delete)

#### 5. Error Handling
```python
from fastapi import HTTPException

# 404 for not found
raise HTTPException(404, "Event not found")

# 403 for permission denied
raise HTTPException(403, "Missing permission")

# 422 for validation errors
raise HTTPException(422, "status must be 'present' or 'absent'")
```

#### 6. Query Patterns
- Use `joinedload` for eager loading relationships
- Filter by user's team or managed teams for scoped access
- Use `managed_team_ids(current_user)` for group admin scope

### Frontend

#### 1. Component Structure
- Functional components with hooks
- Props destructuring with default values
- PropTypes for type checking
- Custom components in `src/components/`

#### 2. State Management
- **Server state**: React Query (useQuery, useMutation)
- **Local state**: useState, useReducer
- **Global state**: React Context (AuthProvider, ConfigProvider)

#### 3. API Layer
```javascript
// Centralized API client in src/services/api.js
import api from "../services/api";

const { data } = await api.get("/activity/events");
await api.post("/activity/events", payload);
```

#### 4. Internationalization
- All user-facing strings use `useTranslation()` hook
- Translation keys are namespaced (e.g., `calendar.title`, `admin.attendance.export`)
- Translations in `src/translations/{cs,en}.jsonc`
- Build with `node scripts/build-translations.js`

#### 5. Routing & Protection
```javascript
// Protected routes with permissions
<Route element={<ProtectedRoute allowedPermissions={["core.attendance.manage"]} />}>
  <Route path="/admin/attendance" element={<AdminAttendance />} />
</Route>

// Role-based protection
<Route element={<ProtectedRoute allowedRoles={["admin", "group_admin"]} />}>
```

#### 6. UI Components
- Use Bootstrap 5 classes for styling
- Custom components: `HeroHeader`, `DecoratedCard`, `Button`, `Alert`, `Modal`, `Select`, `Input`, `LoadingSpinner`
- Consistent spacing with Bootstrap utilities

## Module Development Guide

### Creating a New Module

#### 1. Create Module Manifest
In `backend/app/modules/your_module.py`:
```python
from ..modules import ModuleManifest

manifest = ModuleManifest(
    code="your_module",
    name="Your Module",
    description="Module description",
    icon="fa-icon-name",
    route="/your-route",
    permissions=(
        ("read", "Read access", "Can view module content", True, ("any",)),
        ("manage", "Manage", "Can create/edit/delete", False, ("team", "any")),
    ),
    menu=[
        {"label": "Dashboard", "route": "/your-route", "icon": "fa-tachometer", "permission": "your_module.read"},
    ],
    admin_menu=[
        {"section": "Your Module", "label": "Settings", "route": "/admin/your-module/settings", "permission": "your_module.manage"},
    ],
    widgets=[
        {"id": "your_module.widget", "component": "widget_component", "title": "Widget Title", "permission": "your_module.read", "width": "col-md-6"},
    ],
    routers=(your_router,),
    dependencies=("core",),  # List required modules
)
```

#### 2. Create Router
In `backend/app/routers/your_module.py`:
```python
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..dependencies import get_db, get_current_active_user
from ..models import YourModel
from ..permissions import allows
from ..schemas import YourSchema

router = APIRouter(prefix="/your-module", tags=["your module"])

@router.get("/items")
def list_items(db: Session = Depends(get_db), current_user: User = Depends(get_current_active_user)):
    if not allows(db, current_user, "your_module.read"):
        raise HTTPException(403, "Missing permission")
    return db.query(YourModel).all()
```

#### 3. Register Module
In `backend/app/main.py`:
```python
from .routers import your_module
from .modules import your_module as your_module_manifest

registry.register(your_module_manifest.manifest)
app.include_router(your_module.router)
```

#### 4. Frontend Integration
- Add routes in `frontend/src/App.jsx`
- Create pages in `frontend/src/pages/`
- Add translations in `frontend/src/translations/`
- Add to module's menu/widgets in manifest

### Permission Scopes Explained

| Scope | Description | Use Case |
|-------|-------------|----------|
| `any` | Global access across all teams | Superadmin, global reports |
| `team` | Scoped to user's team(s) | Team leaders, regular users |
| `own` | Only user's own resources | Personal settings, own attendance |

### Database Migrations
- Run `python -m app.migrations` to apply migrations
- Migrations are idempotent and versioned
- Add new migrations in `backend/app/migrations.py`

### Testing
```bash
# Backend tests
cd backend && python -m pytest

# Frontend linting
cd frontend && npm run lint
```

## Deployment

### Development
```bash
docker-compose up -d
# Frontend: http://localhost:5173
# Backend API: http://localhost:8000
```

### Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Key Files Reference

| File | Purpose |
|------|---------|
| `backend/app/main.py` | App initialization, module registration |
| `backend/app/permissions.py` | Permission checking logic |
| `backend/app/modules/__init__.py` | Module manifest class |
| `frontend/src/providers/AuthProvider.jsx` | Authentication context |
| `frontend/src/services/api.js` | Axios instance with interceptors |
| `frontend/src/translations/*.jsonc` | Translation source files |
| `docker-compose.yml` | Service orchestration |

## Recent Features (Attendance & Admin UI)

### Attendance System Enhancements

#### Planned Attendance Status Options
- **attending** - User plans to attend (replaces "present" for planned mode)
- **not_attending** - User will not attend (replaces "excused" for planned mode)
- **unknown** - User hasn't decided yet ("still don't know")

#### Self-Planned Attendance API
- `POST /activity/events/{event_id}/planned` - Register planned attendance
- `DELETE /activity/events/{event_id}/planned` - Unregister from planned attendance
- Response includes `created_at` (registration date) and `updated_at` (last modified)

#### Admin Attendance Management
- **Page**: `/admin/attendance` (permission: `core.attendance.manage`)
- **Features**:
  - Filterable event list with pagination
  - Date range, team, and event kind filters
  - Expandable detail view grouped by permission groups
  - User avatars with initials fallback
  - Real-time attendance counts (present, absent, excused, attending, not_attending, unknown)
  - CSV export functionality
  - Registration date display

#### Calendar Improvements
- Historical events view with pagination
- Group filtering for past events
- Attendance summary in event detail modal (grouped by permission groups)
- Updated planned attendance status UI (attending/not_attending/unknown)

#### Dashboard Widget
- **PlannedEventsWidget** - Shows upcoming events with planned attendance
- Group filtering for events
- Registration date display
- Unregistration button
- Status badges with new status options

### Admin UI Consistency
- All admin pages now use `HeroHeader` component with consistent gradients
- Consistent card-based layout with shadows
- Unified button styling with gradients
- Standardized alert/feedback components

### New Backend Endpoints
- `GET /admin/attendance/events` - Paginated, filterable events with attendance counts
- `GET /admin/attendance/events/{event_id}` - Detailed attendance grouped by permission groups
- `GET /teams/{user_id}/groups` - User's permission groups for filtering
- `DELETE /activity/events/{event_id}/planned` - Self-unregistration from planned attendance

### New Frontend Components
- `PlannedEventsWidget` - Dashboard widget for planned events
- `AdminAttendance` - Admin attendance management page
- Updated `Activity` page with historical events pagination
- Updated `Messages` page with improved thread layout

### Database Changes
- Added `created_at` column to `scout_attendances` table (migration `20260810_add_attendance_created_at`)
- New planned attendance status values: `attending`, `not_attending`, `unknown`

## Common Patterns

### Adding a New Admin Page
1. Create backend router with `admin_` prefix
2. Add admin menu item in module manifest
3. Create frontend page component
4. Add route in `App.jsx` with `ProtectedRoute`
5. Add translations

### Adding a Dashboard Widget
1. Define widget in module manifest
2. Create widget component in `frontend/src/components/widgets/`
3. Register in `HomeDashboard.jsx` WIDGET_COMPONENTS
3. Widget receives no props, uses `useAuth` and `useQuery`

### Extending Permissions
1. Add permission to module manifest
2. Seed permission in database (migrations or startup)
3. Use `allows(db, user, "module.permission")` in endpoints
4. Use `can("module.permission")` in frontend

## Troubleshooting

### Module Not Loading
- Check module is registered in `main.py`
- Verify dependencies are installed and enabled
- Check browser console for missing translations

### Permission Denied
- Verify user has required permission group
- Check permission scope matches (team vs any)
- Ensure module is enabled

### Translation Missing
- Run `node scripts/build-translations.js`
- Check key exists in both `cs.jsonc` and `en.jsonc`
- Verify namespace matches (e.g., `calendar.title` not `calendat.title`)