import api from "../../../services/api";

const validMediaId = (value) => /^\d+$/.test(String(value || ""));

/**
 * Hydrate durable media references inside the isolated GrapesJS iframe.
 * Public /media URLs intentionally carry no bearer token; the editor fetches
 * each referenced file through the authenticated API and uses a temporary
 * object URL only for the open canvas.
 */
export async function hydrateEditorMediaPreviews(editor) {
  const byId = new Map();
  const visit = (component) => {
    const attributes = component?.getAttributes?.() || {};
    const mediaId = attributes["data-sc-media-id"];
    if (component?.get?.("type") === "image" && validMediaId(mediaId)) {
      const key = String(mediaId);
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push(component);
    }
    const backgroundMediaId = attributes["data-sc-background-media-id"];
    if (validMediaId(backgroundMediaId)) {
      const key = String(backgroundMediaId);
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key).push({ backgroundOwner: component });
    }
    component?.components?.().forEach?.(visit);
  };
  visit(editor?.getWrapper?.());
  const objectUrls = [];
  await Promise.all(Array.from(byId, async ([mediaId, components]) => {
    try {
      const { data } = await api.get(`/web/media/${mediaId}/file`, { responseType: "blob" });
      const blobUrl = URL.createObjectURL(data);
      objectUrls.push(blobUrl);
      components.forEach((component) => {
        if (component.backgroundOwner) {
          component.backgroundOwner.getEl?.()?.style?.setProperty("background-image", `url("${blobUrl}")`);
          return;
        }
        component.addAttributes?.({ src: blobUrl }, { silent: true });
        component.set?.("src", blobUrl, { silent: true });
      });
    } catch {
      // Keep the durable URL visible for diagnostics; publishing still uses
      // data-sc-media-id and never persists the temporary object URL.
    }
  }));
  return () => objectUrls.forEach((url) => URL.revokeObjectURL(url));
}
