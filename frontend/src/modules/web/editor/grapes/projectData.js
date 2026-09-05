const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const serializableClone = (value) => JSON.parse(JSON.stringify(value));

// A <p> element only accepts phrasing content. Chromium's contenteditable
// implementation nevertheless creates <div>/<p>/<ul> children when Enter or
// a list action is used inside a GrapesJS text component. GrapesJS stores that
// invalid tree literally and renders it literally in the canvas, while a real
// page reparses the same HTML and hoists the block children out of the <p>.
// Normalize through GrapesJS' browser-backed parser so the canonical model and
// the public browser use the same HTML tree.
const PARAGRAPH_BLOCK_CHILDREN = new Set([
  "address", "article", "aside", "blockquote", "details", "dialog", "div", "dl",
  "fieldset", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6",
  "header", "hgroup", "hr", "main", "menu", "nav", "ol", "p", "pre", "section",
  "table", "ul",
]);

const componentTagName = (component) => String(component?.get?.("tagName") || "").toLowerCase();
const componentChildren = (component) => component?.components?.()?.models || [];

export function normalizeInvalidParagraphComponents(editor, roots) {
  const rootComponents = roots
    ? (Array.isArray(roots) ? roots : [roots])
    : componentChildren(editor?.getWrapper?.());
  const invalid = [];
  const visit = (component) => {
    const children = componentChildren(component);
    children.forEach(visit);
    const type = String(component?.get?.("type") || "default");
    if ((type === "text" || type === "default")
      && !component?.get?.("scBindings")
      && componentTagName(component) === "p"
      && children.some((child) => PARAGRAPH_BLOCK_CHILDREN.has(componentTagName(child)))) {
      invalid.push(component);
    }
  };
  rootComponents.filter(Boolean).forEach(visit);

  let normalized = 0;
  invalid.forEach((component) => {
    if (!component.collection || typeof component.toHTML !== "function" || typeof component.replaceWith !== "function") return;
    component.replaceWith(component.toHTML(), { fromScoutCompTextNormalization: true });
    normalized += 1;
  });
  return normalized;
}

// A persisted public URL cannot be requested from the authenticated editor
// iframe before its bearer-authenticated blob preview is ready. A transparent
// data image keeps the native image component mounted without a broken-image
// flash; it is replaced asynchronously and never leaves the editor snapshot.
export const EDITOR_MEDIA_PLACEHOLDER = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

const editorMediaPattern = () => /(https?:\/\/[^/"'()\s]+)?(?:\/api\/web)?\/media\/([1-9][0-9]{0,9})\/file/g;
const sameEditorOrigin = (origin) => !origin
  || typeof window === "undefined"
  || origin === window.location.origin;

export const editorMediaIds = (value) => [...String(value || "").matchAll(editorMediaPattern())]
  .filter((match) => sameEditorOrigin(match[1]))
  .map((match) => match[2]);

export const replaceEditorMediaUrls = (value, replacement = EDITOR_MEDIA_PLACEHOLDER) => String(value || "").replace(
  editorMediaPattern(),
  (url, origin, mediaId) => {
    if (!sameEditorOrigin(origin)) return url;
    return typeof replacement === "function" ? replacement(mediaId, url) : replacement;
  },
);

const placeholderizeEditorMarkup = (value) => String(value || "").replace(/<[a-z][^>]*>/gi, (tag) => {
  const isImage = /^<img\b/i.test(tag);
  const inlineStyle = tag.match(/\bstyle\s*=\s*(?:"[^"]*"|'[^']*')/i)?.[0] || "";
  const mediaId = editorMediaIds(isImage ? tag : inlineStyle)[0];
  if (!mediaId) return tag;
  const marker = isImage ? "data-sc-media-id" : "data-sc-background-media-id";
  // `data:,` is a valid empty CSS image without the semicolon that GrapesJS'
  // inline-style parser would otherwise truncate in an unquoted url(...).
  const hydratedTag = replaceEditorMediaUrls(tag, isImage ? EDITOR_MEDIA_PLACEHOLDER : "data:,");
  if (new RegExp(`\\b${marker}\\s*=`, "i").test(hydratedTag)) return hydratedTag;
  return hydratedTag.replace(/\s*\/?>(?=$)/, (end) => ` ${marker}="${mediaId}"${end}`);
});

export const withEditorMediaPlaceholders = (value) => {
  if (Array.isArray(value)) return value.map(withEditorMediaPlaceholders);
  if (typeof value === "string" && /<[a-z][^>]*>/i.test(value)) return placeholderizeEditorMarkup(value);
  if (!isObject(value)) return value;
  const next = Object.fromEntries(Object.entries(value).map(([key, child]) => [key, withEditorMediaPlaceholders(child)]));
  const attributes = isObject(next.attributes) ? next.attributes : null;
  const mediaId = String(attributes?.["data-sc-media-id"]
    || editorMediaIds(attributes?.src || next.src)[0]
    || "");
  const isImage = next.type === "image"
    || String(next.tagName || "").toLowerCase() === "img"
    || Boolean(attributes?.src);
  if (isImage && /^\d+$/.test(mediaId)) {
    next.attributes = { ...attributes, src: EDITOR_MEDIA_PLACEHOLDER, "data-sc-media-id": mediaId };
    if ("src" in next) next.src = EDITOR_MEDIA_PLACEHOLDER;
  }
  const backgroundMediaId = String(attributes?.["data-sc-background-media-id"]
    || (isObject(next.style) ? editorMediaIds(next.style["background-image"])[0] : "")
    || "");
  if (/^\d+$/.test(backgroundMediaId) && isObject(next.style)) {
    const safePreviewStyle = { ...next.style };
    delete safePreviewStyle["background-image"];
    next.attributes = { ...(isObject(next.attributes) ? next.attributes : {}), "data-sc-background-media-id": backgroundMediaId };
    next.style = safePreviewStyle;
  }
  if ("previewUrl" in next && !String(next.previewUrl || "").startsWith("data:image/")) next.previewUrl = "";
  return next;
};

// These values hydrate the authenticated editor canvas only. A linked
// resource's persisted contract remains resourceKind/resourceId/props/variant;
// storing the materialized fragment would make snapshots stale and duplicate
// the authoritative server render.
const stripEditorOnlyPreview = (value) => {
  if (Array.isArray(value)) return value.map(stripEditorOnlyPreview);
  if (!isObject(value)) return value;
  const next = {};
  Object.entries(value).forEach(([key, child]) => {
    if (key === "livePreviewHtml" || key === "livePreviewCss" || key === "previewUrl" || key === "menuItems") return;
    next[key] = stripEditorOnlyPreview(child);
  });
  const attributes = isObject(next.attributes) ? next.attributes : null;
  const mediaId = String(attributes?.["data-sc-media-id"] || "");
  const isImage = next.type === "image" || String(next.tagName || "").toLowerCase() === "img" || attributes?.src;
  if (isImage && /^\d+$/.test(mediaId)) {
    next.attributes = { ...attributes, src: `/media/${mediaId}/file` };
    if ("src" in next) next.src = `/media/${mediaId}/file`;
  }
  const backgroundMediaId = String(attributes?.["data-sc-background-media-id"] || "");
  if (/^\d+$/.test(backgroundMediaId)) {
    next.style = {
      ...(isObject(next.style) ? next.style : {}),
      "background-image": `url("/media/${backgroundMediaId}/file")`,
    };
  }
  return next;
};

const withSchemaVersion = (project) => ({
  ...project,
  scoutcomp: {
    ...(isObject(project.scoutcomp) ? project.scoutcomp : {}),
    schemaVersion: 2,
  },
});

/** Return canonical GrapesJS project data, or null for legacy/empty input. */
export function normalizeProjectData(value) {
  const candidate = isObject(value?.project_data)
    ? value.project_data
    : isObject(value?.projectData)
      ? value.projectData
      : isObject(value?.data)
        ? value.data
      : value;

  if (!isObject(candidate) || !Array.isArray(candidate.pages)) return null;
  return withSchemaVersion(serializableClone(candidate));
}

/** Build the one-page project used only to import legacy HTML/CSS content. */
export function createLegacyProject(html = "", css = "") {
  return withSchemaVersion({
    pages: [
      {
        id: "scoutcomp-page",
        component: typeof html === "string" ? html : "",
        styles: typeof css === "string" ? css : "",
      },
    ],
  });
}

/**
 * Load canonical project JSON. HTML/CSS is accepted only as a compatibility
 * path for records created before project-data persistence was introduced.
 */
export function loadEditorProject(editor, { projectData, legacyHtml = "", legacyCss = "" } = {}) {
  const canonical = normalizeProjectData(projectData);
  const project = withEditorMediaPlaceholders(canonical || createLegacyProject(legacyHtml, legacyCss));

  editor.loadProjectData(project);
  normalizeInvalidParagraphComponents(editor);
  editor.UndoManager.clear();
  editor.clearDirtyCount();
  return { project, importedLegacy: !canonical };
}

/** Capture the canonical editor representation and derived output atomically. */
export function getEditorSnapshot(editor) {
  return {
    projectData: withSchemaVersion(stripEditorOnlyPreview(editor.getProjectData())),
    html: editor.getHtml(),
    css: editor.getCss(),
    dirtyCount: editor.getDirtyCount(),
  };
}
