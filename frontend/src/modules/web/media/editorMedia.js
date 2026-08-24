import api from "../../../services/api";
import { editorMediaIds, EDITOR_MEDIA_PLACEHOLDER, replaceEditorMediaUrls } from "../editor/grapes/projectData";

const validMediaId = (value) => /^\d+$/.test(String(value || ""));

/**
 * Resolve protected media embedded in a server-materialized linked fragment
 * before that HTML/CSS is ever mounted in the canvas DOM.
 */
export async function hydrateEditorFragmentMedia(html = "", css = "") {
  const mediaIds = [...new Set([...editorMediaIds(html), ...editorMediaIds(css)])];
  const objectUrls = [];
  const previews = new Map(await Promise.all(mediaIds.map(async (mediaId) => {
    try {
      const { data } = await api.get(`/web/media/${mediaId}/file`, { responseType: "blob" });
      const url = URL.createObjectURL(data);
      objectUrls.push(url);
      return [mediaId, url];
    } catch {
      return [mediaId, EDITOR_MEDIA_PLACEHOLDER];
    }
  })));
  const replace = (mediaId) => previews.get(mediaId) || EDITOR_MEDIA_PLACEHOLDER;
  return {
    html: replaceEditorMediaUrls(html, replace),
    css: replaceEditorMediaUrls(css, replace),
    cleanup: () => objectUrls.forEach((url) => URL.revokeObjectURL(url)),
  };
}

/**
 * Hydrate durable media references inside the isolated GrapesJS iframe.
 * Public /media URLs intentionally carry no bearer token; the editor fetches
 * each referenced file through the authenticated API and uses a temporary
 * object URL only for the open canvas.
 */
export async function hydrateEditorMediaPreviews(editor) {
  let active = true;
  const objectUrls = [];
  const previews = new Map();
  const getPreview = (mediaId) => {
    if (!previews.has(mediaId)) {
      previews.set(mediaId, api.get(`/web/media/${mediaId}/file`, { responseType: "blob" })
        .then(({ data }) => {
          const url = URL.createObjectURL(data);
          if (!active) {
            URL.revokeObjectURL(url);
            return "";
          }
          objectUrls.push(url);
          return url;
        })
        .catch(() => ""));
    }
    return previews.get(mediaId);
  };
  const hydrateTree = (component) => {
    const tasks = [];
    const attributes = component?.getAttributes?.() || {};
    const mediaId = attributes["data-sc-media-id"];
    if (component?.get?.("type") === "image" && validMediaId(mediaId)) {
      const key = String(mediaId);
      const currentSrc = String(attributes.src || component.get?.("src") || "");
      if (!currentSrc.startsWith("blob:")) {
        tasks.push(getPreview(key).then((blobUrl) => {
          const currentId = component.getAttributes?.()?.["data-sc-media-id"];
          if (!active || !blobUrl || String(currentId || "") !== key) return;
          component.addAttributes?.({ src: blobUrl }, { silent: true });
          component.set?.("src", blobUrl, { silent: true });
          component.getEl?.()?.setAttribute?.("src", blobUrl);
        }));
      }
    }
    const backgroundMediaId = attributes["data-sc-background-media-id"];
    if (validMediaId(backgroundMediaId)) {
      const key = String(backgroundMediaId);
      const currentBackground = component.getEl?.()?.style?.backgroundImage || "";
      if (!currentBackground.includes("blob:")) {
        tasks.push(getPreview(key).then((blobUrl) => {
          const currentId = component.getAttributes?.()?.["data-sc-background-media-id"];
          if (!active || !blobUrl || String(currentId || "") !== key) return;
          component.getEl?.()?.style?.setProperty("background-image", `url("${blobUrl}")`);
        }));
      }
    }
    component?.components?.().forEach?.((child) => tasks.push(hydrateTree(child)));
    return Promise.all(tasks);
  };
  const onAdd = (component) => { void hydrateTree(component); };
  const onMount = (component) => { void hydrateTree(component); };
  const onAttributes = (component) => { void hydrateTree(component); };
  editor?.on?.("component:add", onAdd);
  editor?.on?.("component:mount", onMount);
  editor?.on?.("component:update:attributes", onAttributes);
  await hydrateTree(editor?.getWrapper?.());
  return () => {
    active = false;
    editor?.off?.("component:add", onAdd);
    editor?.off?.("component:mount", onMount);
    editor?.off?.("component:update:attributes", onAttributes);
    objectUrls.forEach((url) => URL.revokeObjectURL(url));
  };
}
