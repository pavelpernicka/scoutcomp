import api from "../../../services/api";

const unwrap = (response) => response.data;

export const cmsApi = {
  downloadSiteExport: () => api.get("/web/export", { responseType: "blob" }).then((response) => response.data),
  listPages: () => api.get("/web/pages").then(unwrap),
  getPage: (id) => api.get(`/web/pages/${id}`).then(unwrap),
  getPageEditorData: (id) => api.get(`/web/pages/${id}/editor-data`).then(unwrap),
  createPage: (payload) => api.post("/web/pages", payload).then(unwrap),
  saveDraft: (id, payload) => {
    const { project_data, draft_css, expected_version, ...metadata } = payload;
    return api.put(`/web/pages/${id}/draft`, {
      project_data,
      draft_css,
      expected_version,
      metadata,
    }).then(unwrap);
  },
  duplicatePage: (id) => api.post(`/web/pages/${id}/duplicate`).then(unwrap),
  trashPage: (id) => api.delete(`/web/pages/${id}`).then(unwrap),
  listTrash: () => api.get("/web/pages/trash").then(unwrap),
  restorePage: (id) => api.post(`/web/pages/${id}/restore`).then(unwrap),
  purgePage: (id) => api.delete(`/web/pages/${id}/purge`).then(unwrap),
  previewPage: (id, payload) => {
    const { project_data, expected_version, ...metadata } = payload;
    return api.post(`/web/pages/${id}/preview`, {
      project_data, expected_version, metadata,
    }).then(unwrap);
  },
  publishPage: (id, expectedVersion) =>
    api.post(`/web/pages/${id}/publish`, { expected_version: expectedVersion }).then(unwrap),
  unpublishPage: (id) => api.post(`/web/pages/${id}/unpublish`).then(unwrap),
  regeneratePublicPages: () => api.post("/web/pages/regenerate-public").then(unwrap),
  listRevisions: (id) => api.get(`/web/pages/${id}/revisions`).then(unwrap),
  restoreRevision: (id, revisionId) =>
    api.post(`/web/pages/${id}/restore/${revisionId}`).then(unwrap),

  listMedia: (params) => api.get("/web/media", { params }).then(unwrap),
  uploadMedia: (file, options = {}) => {
    const body = new FormData();
    body.append("file", file);
    if (options.folder_id != null) body.append("folder_id", String(options.folder_id));
    if (options.album) body.append("album", options.album);
    return api.post("/web/media", body).then(unwrap);
  },
  updateMedia: (id, payload) => api.put(`/web/media/${id}`, payload).then(unwrap),
  deleteMedia: (id) => api.delete(`/web/media/${id}`).then(unwrap),
  listFolders: () => api.get("/web/media/folders").then(unwrap),
  createFolder: (payload) => api.post("/web/media/folders", payload).then(unwrap),
  updateFolder: (id, payload) => api.put(`/web/media/folders/${id}`, payload).then(unwrap),
  deleteFolder: (id) => api.delete(`/web/media/folders/${id}`).then(unwrap),

  listDataSources: () => api.get("/web/data-sources").then(unwrap),
  listMenus: () => api.get("/web/menus").then(unwrap),
  listTemplates: () => api.get("/web/templates").then(unwrap),
  getTemplate: (id) => api.get(`/web/templates/${id}`).then(unwrap),
  createTemplate: (payload) => api.post("/web/templates", payload).then(unwrap),
  cloneTemplate: (id, payload = {}) => api.post(`/web/templates/${id}/clone`, payload).then(unwrap),
  updateTemplate: (id, payload) => api.put(`/web/templates/${id}`, payload).then(unwrap),
  publishTemplate: (id, expectedVersion) =>
    api.post(`/web/templates/${id}/publish`, { expected_version: expectedVersion }).then(unwrap),
  regenerateTemplatePreview: (id) => api.post(`/web/templates/${id}/preview`).then(unwrap),
  deleteTemplate: (id) => api.delete(`/web/templates/${id}`).then(unwrap),
  listDesignResources: (kind, params) => api.get(`/web/design/${kind}`, { params }).then(unwrap),
  createDesignResource: (kind, payload) => api.post(`/web/design/${kind}`, payload).then(unwrap),
  cloneDesignResource: (kind, id, payload = {}) =>
    api.post(`/web/design/${kind}/${id}/clone`, payload).then(unwrap),
  materializeDesignResource: (kind, id, payload) =>
    api.post(`/web/design/${kind}/${id}/materialize`, payload).then(unwrap),
  updateDesignResource: (kind, id, payload) =>
    api.put(`/web/design/${kind}/${id}`, payload).then(unwrap),
  publishDesignResource: (kind, id, expectedVersion) =>
    api.post(`/web/design/${kind}/${id}/publish`, { expected_version: expectedVersion }).then(unwrap),
  regenerateDesignPreview: (kind, id) =>
    api.post(`/web/design/${kind}/${id}/preview`).then(unwrap),
  deleteDesignResource: (kind, id) => api.delete(`/web/design/${kind}/${id}`).then(unwrap),
  getGlobalStyles: () => api.get("/web/design/styles").then(unwrap),
  getCanvasStyles: () => api.get("/web/design/canvas-styles").then(unwrap),
  saveGlobalStyles: (payload) => api.put("/web/design/styles", payload).then(unwrap),
  publishGlobalStyles: (expectedVersion) => api.post("/web/design/styles/publish", { expected_version: expectedVersion }).then(unwrap),

  listThemes: () => api.get("/web/themes").then(unwrap),
  installTheme: (file) => {
    const body = new FormData();
    body.append("file", file);
    return api.post("/web/themes/install", body).then(unwrap);
  },
  activateTheme: (id) => api.post(`/web/themes/${id}/activate`).then(unwrap),
  downloadTheme: (id) => api.get(`/web/themes/${id}/download`, { responseType: "blob" }).then((response) => response.data),
  duplicateTheme: (id, name) => api.post(`/web/themes/${id}/duplicate`, { name }).then(unwrap),
  uninstallTheme: (id) => api.delete(`/web/themes/${id}`).then(unwrap),
};


export const normalizePage = (page = {}) => ({
  ...page,
  project_data: page.project_data ?? page.data ?? null,
  draft_css: page.draft_css ?? "",
  draft_version: page.draft_version ?? page.version ?? 0,
  path_segment: page.path_segment ?? page.slug ?? "",
  path: page.path ?? page.path_segment ?? page.slug ?? "",
});

export const displayPagePath = (page = {}) => {
  const value = page.path || page.path_segment || page.slug || "";
  return value.startsWith("/") ? value : `/${value}`;
};
