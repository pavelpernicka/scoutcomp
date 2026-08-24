export const MAX_MEDIA_UPLOAD_BYTES = 15 * 1024 * 1024;

export const MEDIA_UPLOAD_ACCEPT = "image/*,.pdf,.svg,.csv,.txt,.zip";

export function mediaUploadSizeError(file, t) {
  if (!file || file.size <= MAX_MEDIA_UPLOAD_BYTES) return "";
  return t("web.mediaTooLarge", { maxSize: 15 });
}
