import { editorMediaIds, EDITOR_MEDIA_PLACEHOLDER } from "./projectData";

/**
 * Update an image through the GrapesJS model (the canonical editor state) and
 * its mounted view. Updating `attributes.src` alone does not notify the native
 * image view, whose renderer listens to `change:src`; that leaves its fallback
 * SVG visible until the project is loaded again.
 */
export function setImageComponentSource(component, { src = "", mediaId, alt } = {}) {
  if (!component) return "";
  const nextSrc = String(src || "").trim();
  const embeddedMediaId = editorMediaIds(nextSrc)[0];
  const previewSrc = embeddedMediaId ? EDITOR_MEDIA_PLACEHOLDER : nextSrc;
  const nextMediaId = embeddedMediaId || mediaId;

  // ComponentImageView listens to this model property and synchronizes the
  // real <img>. Keep this before the metadata update to avoid rendering a
  // protected/durable URL for one frame before the blob preview is ready.
  component.set?.("src", previewSrc);

  const attributes = {};
  if (previewSrc) attributes.src = previewSrc;
  if (alt !== undefined) attributes.alt = String(alt || "");
  if (nextMediaId !== undefined && nextMediaId !== null && String(nextMediaId)) {
    attributes["data-sc-media-id"] = String(nextMediaId);
  }
  if (Object.keys(attributes).length) component.addAttributes?.(attributes);
  if (!previewSrc) component.removeAttributes?.("src");
  if (mediaId === null && !embeddedMediaId) component.removeAttributes?.("data-sc-media-id");

  // Custom image component views are allowed by GrapesJS. Keep their mounted
  // DOM in sync even when they do not implement ComponentImageView's listener.
  const element = component.getEl?.();
  if (element?.setAttribute && previewSrc) element.setAttribute("src", previewSrc);
  else if (element?.removeAttribute && !previewSrc) element.removeAttribute("src");

  return previewSrc;
}
