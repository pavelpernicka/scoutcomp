import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import MediaCard from "./MediaCard";
import useMediaBrowser from "./useMediaBrowser";

/**
 * Reusable media browser/picker. Shares media query, folder listing, upload
 * and move logic with MediaLibrary through useMediaBrowser.
 */
export default function MediaBrowser({ initialFolderId, onSelect, onClose }) {
  const { t } = useTranslation();
  const {
    inputRef,
    error,
    selectedFolder,
    setSelectedFolder,
    folders,
    media,
    upload,
    handleUpload,
  } = useMediaBrowser({ initialFolderId, limit: 200 });

  return (
    <div className="web-media-browser">
      <div className="web-media-browser-header">
        <h3><i className="fas fa-images me-2" />{t("web.nav.media")}</h3>
        <button type="button" className="btn-close" aria-label={t("web.close")} onClick={onClose} />
      </div>
      {error && <div className="alert alert-danger m-2">{error}</div>}
      <div className="web-media-browser-body">
        <aside className="web-media-browser-sidebar">
          <div className="web-media-browser-folders">
            <button
              type="button"
              className={`web-folder-all ${selectedFolder === null ? "active" : ""}`}
              onClick={() => setSelectedFolder(null)}
            >
              <i className="fas fa-images me-2" />{t("web.allMedia")}
            </button>
            {folders.map((folder) => (
              <button
                key={folder.id}
                type="button"
                className={`web-folder-item ${selectedFolder === folder.id ? "active" : ""}`}
                onClick={() => setSelectedFolder(folder.id)}
              >
                <i className="fas fa-folder me-2" />
                {folder.name}
              </button>
            ))}
          </div>
        </aside>
        <main className="web-media-browser-main">
          <div className="web-media-browser-toolbar">
            <input ref={inputRef} className="visually-hidden" type="file" accept="image/*,.pdf,.svg,.csv,.txt,.zip" onChange={handleUpload} />
            <button type="button" className="btn btn-sm btn-primary" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
              <i className="fas fa-upload me-1" />{t("web.uploadMedia")}
            </button>
          </div>
          <div className="web-media-library web-media-browser-grid">
            {media.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onDragStart={() => {}}
                onEdit={() => onSelect?.(item)}
                onDelete={() => {}}
                t={t}
                onClick={() => onSelect?.(item)}
              />
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

MediaBrowser.propTypes = {
  initialFolderId: PropTypes.number,
  onSelect: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
};
