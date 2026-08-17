# Frontend style ownership

`src/styles.css` is intentionally only the ordered entrypoint. It imports:

- `tokens.css` – colour, type and spacing tokens;
- `shell.css` – application shell and navigation;
- `design-system.css` – Bootstrap variable overrides and shared primitives;
- `content.css` – reusable content rendering and dashboard presentation;
- `admin.css` – shared administration layouts;
- `members.css` – member-facing details.

Styles for a component that owns behaviour are kept beside that component (for
example `components/AdminPanel.css`, `Modal.css` or
`modules/web/admin/ArticleEditBox.css`). New page-specific selectors belong
beside their page/module, not in the global entrypoint. Prefer composing
`AdminPanel`, `Modal`, `Button`, form controls and page headers before
introducing another page-specific surface.

Do not turn every `div` into a component: a primitive is extracted only when it
owns interaction/accessibility or is repeated as the same visual structure. The
page keeps its domain-specific layout and data flow; the component owns the
repeated shell and its CSS.
