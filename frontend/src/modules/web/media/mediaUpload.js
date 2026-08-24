export const MAX_MEDIA_UPLOAD_BYTES = 15 * 1024 * 1024;

export const MEDIA_UPLOAD_ACCEPT = "image/*,.pdf,.svg,.csv,.txt,.zip";

export function mediaUploadSizeError(file, t) {
  if (!file || file.size <= MAX_MEDIA_UPLOAD_BYTES) return "";
  return t("web.mediaTooLarge", { maxSize: 15 });
}

/** Put a successful upload into the first media page without another round trip. */
export function prependUploadedMedia(current, item, limit) {
  const previousItems = Array.isArray(current?.items) ? current.items : [];
  const alreadyPresent = previousItems.some((entry) => entry.id === item.id);
  const items = [item, ...previousItems.filter((entry) => entry.id !== item.id)].slice(0, limit);
  return {
    ...(current || {}),
    items,
    total: Math.max(items.length, Number(current?.total || 0) + (alreadyPresent ? 0 : 1)),
    limit: current?.limit || limit,
    offset: 0,
  };
}
