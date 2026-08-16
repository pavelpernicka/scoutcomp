import PropTypes from "prop-types";
import { useMediaBlob } from "./MediaCard";

/**
 * Renders an auth-protected media preview.
 * - Data URIs (e.g. generated SVG wireframes) render directly.
 * - Everything else is fetched through the auth-bearing Axios client first.
 */
export default function MediaPreview({ src, alt = "", className, loading = "lazy", fallback = null }) {
  if (!src) return fallback;

  const isDataUri = typeof src === "string" && src.startsWith("data:");
  const blobUrl = useMediaBlob(isDataUri ? null : { id: src, url: src });

  if (isDataUri) {
    return <img src={src} alt={alt} className={className} loading={loading} />;
  }
  if (!blobUrl) {
    return <span className={className}>{fallback || <i className="fas fa-image" />}</span>;
  }
  return <img src={blobUrl} alt={alt} className={className} loading={loading} />;
}

MediaPreview.propTypes = {
  src: PropTypes.string,
  alt: PropTypes.string,
  className: PropTypes.string,
  loading: PropTypes.string,
  fallback: PropTypes.node,
};
