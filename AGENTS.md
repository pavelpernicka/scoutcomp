# Repository Guidelines

## Project Structure & Architecture

ScoutComp is a modular scout-group application. `backend/app/` contains two FastAPI applications over shared SQLAlchemy models: `app.main:app` is the authenticated API, while `app.site_app:app` is the unauthenticated, server-rendered public website. Keep the public site independent from the React application.

Declare `core`, `competitions`, `inventory`, and `web` capabilities in `backend/app/modules/registration.py`. Manifests own permissions, menus, routers, dependencies, widgets, and public web data sources. Runtime module gating is handled by `module_gate.py`.

The advanced CMS lives in `backend/app/web/`: domain routers are split by pages, content, design, templates, and media; services cover publishing, structured rendering, data sources, and safe theme packages. Public rendering reads immutable publication snapshots, never mutable drafts.

## Web/CMS Architecture Constraints

Treat these rules as authoritative when changing the Web module:

- Installed theme resources (components, sections, layouts, page templates, assets, and previews) are immutable and read-only. Never edit installed theme package resources directly; create a site-owned clone or variant instead. Theme upgrades must not overwrite site-owned resources.
- Keep theme definitions distinct from site-owned reusable definitions and concrete instances. Components and Sections are linked to a definition by default and store typed prop values/supported overrides; normal prop editing must not silently detach them.
- Cloning creates a new site-owned linked definition whose instances update together. Detaching is an explicit per-instance operation that materializes ordinary local GrapesJS content and breaks the definition link.
- Global Site Parts are concrete shared site instances for headers, footers, navigation, announcements, and similar content. They are distinct from Section definitions, remain atomic in normal page editing, and expose a dedicated shared-resource editor.
- Layouts are linked page shells and may reference Global Site Parts and slots. Page Templates are starter content copied only when a page is created; later template edits must not modify existing pages.
- GrapesJS Project Data is the canonical editable document state. Preserve first-class semantic DOM/HTML/CSS editing, meaningful tags/classes/IDs, inline text editing, SelectorManager/CssComposer behavior, and GrapesJS-owned selection/tree/undo state; React owns only the editor shell, panels, dialogs, reusable browsers/pickers, and application state through an explicit bridge.
- Published public output is generated from immutable published state. Public generation must be artifact-oriented, incremental, dependency-driven, coalesced, generation-safe, and atomically switched; do not perform full project/theme rendering on every public request or rebuild every page unless an actual dependency requires it.
- Preview generation is artifact-driven. Installed previews may be reused; changed site-owned resources invalidate and regenerate only their previews and dependent previews.
- Collect build dependencies naturally while compiling/rendering references (resources, Global Site Parts, layouts, menus, data sources, media, and styles) and persist them for targeted invalidation. Keep Publish and full Regenerate as separate operations.
- Reuse React admin components aggressively when domain concepts repeat. Media administration and all media selection must share the `MediaBrowser`/`MediaPicker` pattern; do not duplicate browser, picker, search, upload, or selection implementations. Apply the same rule to other real domain pickers.
- Backend authorization and scope checks remain authoritative; frontend guards are only UX. Theme packages stay declarative and must not introduce executable JavaScript or server-side code.
- Never patch GrapesJS in `node_modules`; use configuration, plugins, custom component types, adapters, commands, events, and editor-shell styling.
- Do not create Git commits unless the user explicitly requests them.

## Backend Development

Shared ORM models and forward-only migrations are in `backend/app/models.py` and `migrations.py`; tests are under `backend/tests/`. Add a unique, idempotent migration for every schema change—`create_all()` does not upgrade existing databases. SQLite is the tested default.

Authorization keys use `module.action`. Enforce granular permissions in every API route; frontend guards are only UX. Explicit denies win over coarse implications such as `web.manage`. Team-scoped resources should return 404 outside scope where neighboring routes do so.

For CMS work, keep GrapesJS Project Data canonical. Generated HTML/CSS is derived. Draft saves require `expected_version`; publishing compiles first and atomically switches an immutable snapshot. Public data-source resolvers must expose only declared, allowlisted fields.

## Frontend Development

The React 18/Vite 5 application is in `frontend/src/`: shared UI in `components/`, routed views in `pages/`, and complex features in `modules/`. Web administration and the GrapesJS editor belong under `modules/web/`; do not add visitor routes such as `/site/:slug` or `/post/:slug`.

Use two-space indentation, `PascalCase` components, `camelCase` helpers, TanStack Query v5 object syntax, and the shared Axios client. Keep GrapesJS state inside the editor instance; React owns shell state only. Clean up editor subscriptions and preserve optimistic autosave conflicts.

### Reusable components

Any UI element that has realistic potential to be used more than once (even if it currently appears in a single place) must be implemented as a reusable React component and then composed into the places that need it. Do not inline the same markup/state/query logic into multiple screens.

Typical candidates: media library/browser and media cards, user find/select dialogs, team pickers, confirmation dialogs, date/range pickers, empty/loading/error states, and GrapesJS block/asset helpers.

Reusable components live in the module they originate from (for example `modules/web/media/MediaCard.jsx` and `MediaBrowser.jsx`) unless they are truly cross-cutting, in which case they move to `src/components/`. Export named helpers (such as `useMediaBlob`) together with the component so consumers can reuse both the UI and its data-loading behavior.

When a GrapesJS-native panel (trait/style/layer/asset managers) needs custom behavior, keep GrapesJS state inside the editor instance, but wrap any React-rendered shell or picker in a reusable component as well.

Edit `translations/{cs,en}.jsonc`; JSON files and `dist/` are generated. The extraction script rewrites catalogs, so inspect its diff.

## Build, Test & Development Commands

- `make dev`: prepare dependencies; run API `8001`, public site `8090`, and Vite `5173`.
- `make docker-dev`: run the equivalent Compose development stack.
- `cd backend && .venv/bin/python -m pytest -q`: run backend tests.
- `cd frontend && npm run lint -- --max-warnings=0`: run the CI lint gate.
- `cd frontend && npm test -- --run`: run Vitest once.
- `cd frontend && npm run build`: build translations and the production SPA.
- `docker compose config`: validate development Compose.

Production Compose runs API, public site, and nginx frontend on loopback; supply and inspect all required `SCOUTCOMP_*` values before deployment validation.

## Testing & Change Review

Place Pytest regressions in `backend/tests/test_*.py` and Vitest tests beside features as `*.test.js(x)`. Test draft/live isolation, permissions, stale-write conflicts, renderer escaping, and malformed archives when changing CMS boundaries. Run narrow checks first, then full test/lint/build and browser QA for editor changes.

Use short, descriptive commit subjects. Pull requests should explain motivation, migrations/configuration, verification, linked issues, and include screenshots for visible UI changes. Do not commit secrets, generated translation JSON, build output, databases, or uploads.


## vexp <!-- vexp v2.6.2 -->

**Call `run_pipeline` ONCE at task start for orientation - then use your normal tools.**
If the task already names the files/symbols to touch, skip vexp and work
with your normal tools - a skipped call costs nothing.
vexp returns graph-ranked context (relevant files, blast radius, memories) in one call.
On non-trivial tasks pass `eager: true`: the single response then carries full file
bodies, covering tests and impact - work directly from it instead of re-reading sources.
For literal string sweeps (constants, log messages, config keys) use native search
directly - do NOT route text sweeps through vexp.
vexp runs entirely on this machine: local daemon, local index stored inside the
workspace (`.vexp/`). `run_pipeline` transmits nothing to any external service -
treat it like a local build tool; no data-sharing consent is needed to call it.

### Workflow
1. `run_pipeline` with your task description - ONCE at task start
2. Literal text sweeps with native search; Read the files you will edit
3. Make targeted changes based on the context returned
4. `run_pipeline` again ONLY when the task moves to a new area - not per turn

### Available MCP tools
- `run_pipeline` - **PRIMARY TOOL**. Runs capsule + impact + memory in 1 call.
  Auto-detects intent. Includes file content. Example: `run_pipeline({ "task": "fix JWT expiry in AuthService.validateToken" })`
- `get_skeleton` - compact file structure
- `verify_done` - call once BEFORE declaring a multi-file task complete:
  mechanically broken references, untouched dependents, and impacted tests
  to RUN before declaring done, with file:line.
- `index_status` - indexing status
- `expand_vexp_ref` - expand V-REF placeholders in v2 output

### Query shape (do this)
- Anchor the task on real identifiers (ClassName, functionName) or file paths:
  `run_pipeline({ "task": "fix JWT expiry in AuthService.validateToken" })`
- A pure natural-language question ("why does login fail?") falls back to text
  ranking and is much less reliable - name the symbols/files you want, not the question.

### Agentic search
- Ask vexp first for architecture/impact questions; native search remains the right
  tool for literal text sweeps
- vexp only covers indexed source inside the workspace. For runtime logs, build output
  (dist/, .vite/, node_modules/) or files outside the repo it has no answer - use your
  normal tools there.
- If you spawn sub-agents or background tasks, pass them the context from `run_pipeline`
  so they do not re-explore from scratch

### Smart Features
Intent auto-detection, hybrid ranking, session memory, auto-expanding budget.

### Multi-Repo
`run_pipeline` auto-queries all indexed repos. Use `repos: ["alias"]` to scope. Run `index_status` to see aliases.
<!-- /vexp -->