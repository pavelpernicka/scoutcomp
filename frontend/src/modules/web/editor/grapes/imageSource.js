/**
 * Update an image through the GrapesJS model (the canonical editor state) and
 * its mounted view. Updating `attributes.src` alone does not notify the native
 * image view, whose renderer listens to `change:src`; that leaves its fallback
 * SVG visible until the project is loaded again.
 */
export function setImageComponentSource(component, { src = "", mediaId, alt } = {}) {
  if (!component) return "";
  const nextSrc = String(src || "").trim();

  // ComponentImageView listens to this model property and synchronizes the
  // real <img>. Keep this before the metadata update to avoid rendering a
  // protected/durable URL for one frame before the blob preview is ready.
  component.set?.("src", nextSrc);

  const attributes = {};
  if (nextSrc) attributes.src = nextSrc;
  if (alt !== undefined) attributes.alt = String(alt || "");
  if (mediaId !== undefined && mediaId !== null && String(mediaId)) {
    attributes["data-sc-media-id"] = String(mediaId);
  }
  if (Object.keys(attributes).length) component.addAttributes?.(attributes);
  if (!nextSrc) component.removeAttributes?.("src");
  if (mediaId === null) component.removeAttributes?.("data-sc-media-id");

  // Custom image component views are allowed by GrapesJS. Keep their mounted
  // DOM in sync even when they do not implement ComponentImageView's listener.
  const element = component.getEl?.();
  if (element?.setAttribute && nextSrc) element.setAttribute("src", nextSrc);
  else if (element?.removeAttribute && !nextSrc) element.removeAttribute("src");

  return nextSrc;
}

