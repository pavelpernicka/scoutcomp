const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const serializableClone = (value) => JSON.parse(JSON.stringify(value));

// These values hydrate the authenticated editor canvas only. A linked
// resource's persisted contract remains resourceKind/resourceId/props/variant;
// storing the materialized fragment would make snapshots stale and duplicate
// the authoritative server render.
const stripEditorOnlyPreview = (value) => {
  if (Array.isArray(value)) return value.map(stripEditorOnlyPreview);
  if (!isObject(value)) return value;
  const next = {};
  Object.entries(value).forEach(([key, child]) => {
    if (key === "livePreviewHtml" || key === "livePreviewCss" || key === "menuItems") return;
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
  if (/^\d+$/.test(backgroundMediaId) && isObject(next.style)) {
    next.style = {
      ...next.style,
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
  const project = canonical || createLegacyProject(legacyHtml, legacyCss);

  editor.loadProjectData(project);
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
