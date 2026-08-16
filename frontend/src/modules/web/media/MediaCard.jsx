import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import api from "../../../services/api";

function mimeIcon(mime) {
  if (!mime) return "fa-file";
  if (mime.startsWith("image/")) return "fa-file-image";
  if (mime === "application/pdf") return "fa-file-pdf";
  if (mime === "application/zip") return "fa-file-zipper";
  if (mime === "text/csv") return "fa-file-csv";
  if (mime === "text/plain") return "fa-file-lines";
  return "fa-file";
}

// sessionStorage-based blob cache is unreliable: blob URLs are revoked on
// navigation and stale "empty string" entries block re-fetch. Use a module-
// scoped Map that resets naturally with page lifetime.
const blobCache = new Map();

/**
 * Fetch a protected media blob through the auth-bearing Axios instance.
 * Returns a usable blob URL or "" while loading / on error.
 */
export function useMediaBlob(item) {
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    if (!item?.url) return;
    let cancelled = false;
    const cacheKey = item.url;

    // In-memory cache (no stale blob URLs across navigations).
    if (blobCache.has(cacheKey)) {
      setBlobUrl(blobCache.get(cacheKey));
      return undefined;
    }

    // Strip /api prefix because Axios baseURL already provides it.
    const relativeUrl = item.url.replace(/^\/api\//, "/");
    api.get(relativeUrl, { responseType: "blob" })
      .then(({ data }) => {
        if (cancelled) return;
        const url = URL.createObjectURL(data);
        blobCache.set(cacheKey, url);
        setBlobUrl(url);
      })
      .catch(() => {
        if (!cancelled) setBlobUrl("");
      });

    return () => { cancelled = true; };
  }, [item?.url, item?.id]);

  return blobUrl;
}

export default function MediaCard({ item, onDragStart, onEdit, onDelete, onClick, onSelect, onPreview, t }) {
  const blobUrl = useMediaBlob(item);
  const isImage = item.is_image !== false && item.mime && item.mime.startsWith("image/");

  const handleClick = () => onClick?.(item);
  const handleSelectPick = () => onSelect?.(item);
  const handlePreview = () => onPreview?.(item);

  return (
    <article
      className={`web-media-card${onClick ? " clickable" : ""}`}
      draggable={!onClick}
      onDragStart={onClick ? undefined : onDragStart}
      onClick={onClick ? handleClick : undefined}
    >
      <div className="web-media-thumb" onClick={isImage && onPreview ? handlePreview : undefined} role={isImage && onPreview ? "button" : undefined} tabIndex={isImage && onPreview ? 0 : undefined}>
        {blobUrl && isImage ? (
          <img src={blobUrl} alt={item.alt || ""} loading="lazy" />
        ) : (
          <i className={`fas ${mimeIcon(item.mime)} web-media-file-icon`} />
        )}
      </div>
      <div className="web-media-meta">
        <strong title={item.filename}>{item.filename}</strong>
        <span>{item.mime || "\u2014"}</span>
        {item.alt && <small>{item.alt}</small>}
      </div>
      <div className="d-flex gap-1">
        {onSelect && (
          <button className="btn btn-sm btn-primary" type="button" title={t("web.chooseFromMedia")} onClick={handleSelectPick}>
            <i className="fas fa-check" />
          </button>
        )}
        {!onClick && (
          <>
            <button className="btn btn-sm btn-outline-secondary" type="button" title={t("web.edit")} onClick={onEdit}>
              <i className="fas fa-pen" />
            </button>
            <button className="btn btn-sm btn-outline-danger" type="button" title={t("web.delete")} onClick={onDelete}>
              <i className="fas fa-trash" />
            </button>
          </>
        )}
      </div>
    </article>
  );
}

MediaCard.propTypes = {
  item: PropTypes.shape({
    id: PropTypes.number.isRequired,
    filename: PropTypes.string,
    mime: PropTypes.string,
    url: PropTypes.string,
    alt: PropTypes.string,
    is_image: PropTypes.bool,
  }).isRequired,
  onDragStart: PropTypes.func,
  onEdit: PropTypes.func,
  onDelete: PropTypes.func,
  onClick: PropTypes.func,
  onSelect: PropTypes.func,
  onPreview: PropTypes.func,
  t: PropTypes.func.isRequired,
};
