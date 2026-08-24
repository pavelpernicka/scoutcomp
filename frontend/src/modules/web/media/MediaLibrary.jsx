import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import { cmsApi } from "../api/cms";
import MediaCard from "./MediaCard";
import { MEDIA_UPLOAD_ACCEPT, mediaUploadSizeError } from "./mediaUpload";
import "../styles/admin.css";

function flattenFolders(nodes, out = []) {
  nodes.forEach((node) => {
    out.push(node);
    if (node.children?.length) flattenFolders(node.children, out);
  });
  return out;
}

function FolderOptions({ folders, depth = 0 }) {
  return folders.map((folder) => [
    <option key={folder.id} value={folder.id}>
      {"\u00A0".repeat(depth * 2)}{depth > 0 ? "\u2514 " : ""}{folder.name}
    </option>,
    folder.children?.length ? <FolderOptions key={`children-${folder.id}`} folders={folder.children} depth={depth + 1} /> : null,
  ]);
}

function FolderTree({ items, selectedId, level = 0, onSelect, onRename, onDelete, onCreate, onDrop, onSelectOnly }) {
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState({});
  const [dropTarget, setDropTarget] = useState(null);
  const toggle = (id) => setCollapsed((prev) => ({ ...prev, [id]: !prev[id] }));

  return items.map((folder) => {
    const hasChildren = folder.children && folder.children.length > 0;
    const isExpanded = !collapsed[folder.id];
    const isRoot = folder.is_root || folder.name === "root";
    return (
      <div key={folder.id} className="web-folder-tree-item" style={{ paddingLeft: `${level * 18}px` }}>
        <div
          className={`web-folder-tree-row ${selectedId === folder.id ? "active" : ""} ${dropTarget === folder.id ? "drop-target" : ""}`}
          onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; setDropTarget(folder.id); }}
          onDragLeave={() => setDropTarget((current) => (current === folder.id ? null : current))}
          onDrop={(event) => { event.preventDefault(); setDropTarget(null); const mediaId = Number(event.dataTransfer.getData("text/plain")); if (Number.isFinite(mediaId)) onDrop(mediaId, folder.id); }}
        >
          {hasChildren ? (
            <button type="button" className="web-folder-toggle" onClick={() => toggle(folder.id)} aria-label={isExpanded ? t("web.collapse") : t("web.expand")}>
              <i className={`fas fa-chevron-${isExpanded ? "down" : "right"}`} />
            </button>
          ) : (
            <span className="web-folder-toggle" />
          )}
          <button type="button" className="web-folder-label" onClick={() => onSelect(folder.id)}>
            <i className={`fas fa-folder${selectedId === folder.id ? "-open" : ""} me-2`} />
            {folder.name}
          </button>
          {!onSelectOnly && (
            <span className="web-folder-actions">
              {!isRoot && (
                <>
                  <button type="button" className="web-folder-action" title={t("web.edit")} onClick={() => onRename(folder)}><i className="fas fa-pen" /></button>
                  <button type="button" className="web-folder-action" title={t("web.commands.newFolderChild")} onClick={() => onCreate(folder.id)}><i className="fas fa-folder-plus" /></button>
                  {!hasChildren && <button type="button" className="web-folder-action danger" title={t("web.delete")} onClick={() => onDelete(folder)}><i className="fas fa-trash" /></button>}
                </>
              )}
              {isRoot && <button type="button" className="web-folder-action" title={t("web.commands.newFolderChild")} onClick={() => onCreate(folder.id)}><i className="fas fa-folder-plus" /></button>}
            </span>
          )}
        </div>
        {isExpanded && hasChildren && (
          <FolderTree items={folder.children} selectedId={selectedId} level={level + 1} onSelect={onSelect} onRename={onRename} onDelete={onDelete} onCreate={onCreate} onDrop={onDrop} onSelectOnly={onSelectOnly} />
        )}
      </div>
    );
  });
}

FolderTree.propTypes = {
  items: PropTypes.array.isRequired,
  selectedId: PropTypes.number,
  level: PropTypes.number,
  onSelect: PropTypes.func.isRequired,
  onRename: PropTypes.func,
  onDelete: PropTypes.func,
  onCreate: PropTypes.func,
  onDrop: PropTypes.func,
  onSelectOnly: PropTypes.bool,
};

/**
 * Reusable full media library (folders tree + media grid + pagination +
 * upload + edit + preview). Used as the Media page and as a picker inside
 * modals.
 */
export default function MediaLibrary({ selectMode = false, onSelectItem, embedded = false }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [folderInitialized, setFolderInitialized] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize] = useState(24);
  const [editing, setEditing] = useState(null);
  const [metadata, setMetadata] = useState({ filename: "", note: "", folder_id: null });
  const [previewItem, setPreviewItem] = useState(null);
  const [folderForm, setFolderForm] = useState({ open: false, name: "", parentId: null, rename: null });

  const foldersQuery = useQuery({ queryKey: ["web", "media", "folders"], queryFn: cmsApi.listFolders });
  const folders = foldersQuery.data?.items || [];
  const flatFolders = flattenFolders(folders);
  const selectedName = flatFolders.find((f) => f.id === selectedFolder)?.name || "";

  useEffect(() => {
    if (!folderInitialized && folders.length) {
      const root = folders.find((f) => f.is_root || f.name === "root" || f.name === "Kořenový adresář");
      if (root) setSelectedFolder(root.id);
      setFolderInitialized(true);
    }
  }, [folders, folderInitialized]);

  const mediaQuery = useQuery({
    queryKey: ["web", "media", { folder_id: selectedFolder, page, pageSize }],
    queryFn: () => cmsApi.listMedia({ limit: pageSize, offset: page * pageSize, folder_id: selectedFolder }),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["web", "media"] });
    queryClient.invalidateQueries({ queryKey: ["web", "media", "folders"] });
  };

  const upload = useMutation({
    mutationFn: (file) => cmsApi.uploadMedia(file, { folder_id: selectedFolder }),
    onSuccess: invalidate,
    onError: (e) => setError(e?.response?.data?.detail || t("web.mediaUploadFailed")),
  });
  const remove = useMutation({ mutationFn: cmsApi.deleteMedia, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: () => cmsApi.updateMedia(editing.id, metadata),
    onSuccess: () => { setEditing(null); invalidate(); },
    onError: (e) => setError(e?.response?.data?.detail || t("web.saveFailed")),
  });
  const moveMedia = useMutation({
    mutationFn: ({ mediaId, folderId }) => cmsApi.updateMedia(mediaId, { folder_id: folderId }),
    onSuccess: invalidate,
    onError: (e) => setError(e?.response?.data?.detail || t("web.saveFailed")),
  });
  const createFolder = useMutation({
    mutationFn: () => cmsApi.createFolder({ name: folderForm.name, parent_id: folderForm.parentId }),
    onSuccess: () => { setFolderForm({ open: false, name: "", parentId: null, rename: null }); invalidate(); },
    onError: (e) => setError(e?.response?.data?.detail || t("web.saveFailed")),
  });
  const updateFolder = useMutation({
    mutationFn: () => cmsApi.updateFolder(folderForm.rename.id, { name: folderForm.name }),
    onSuccess: () => { setFolderForm({ open: false, name: "", parentId: null, rename: null }); invalidate(); },
    onError: (e) => setError(e?.response?.data?.detail || t("web.saveFailed")),
  });
  const deleteFolder = useMutation({
    mutationFn: (id) => cmsApi.deleteFolder(id),
    onSuccess: invalidate,
    onError: (e) => setError(e?.response?.data?.detail || t("web.deleteFailed")),
  });

  const media = Array.isArray(mediaQuery.data) ? mediaQuery.data : mediaQuery.data?.items || [];
  const mediaTotal = mediaQuery.data?.total ?? media.length;
  const totalPages = Math.max(1, Math.ceil(mediaTotal / pageSize));

  const handleUpload = (e) => {
    const file = e.target.files?.[0];
    const sizeError = mediaUploadSizeError(file, t);
    if (sizeError) setError(sizeError);
    else if (file) {
      setError("");
      upload.mutate(file);
    }
    e.target.value = "";
  };

  const handleDropOnFolder = useCallback((mediaId, folderId) => moveMedia.mutate({ mediaId, folderId }), [moveMedia]);

  const handleSelect = (item) => {
    if (selectMode && onSelectItem) {
      onSelectItem(item);
    } else {
      setPreviewItem(item);
    }
  };

  const manageProps = {
    onSelectOnly: false,
    onRename: (folder) => setFolderForm({ open: true, name: folder.name === "root" ? "" : folder.name, parentId: null, rename: folder }),
    onCreate: (parentId) => setFolderForm({ open: true, name: "", parentId, rename: null }),
    onDelete: (folder) => { if (window.confirm(t("web.confirmDeleteFolder"))) deleteFolder.mutate(folder.id); },
    onDrop: handleDropOnFolder,
  };

  return (
    <div className={`web-media-library-shell ${embedded ? "embedded" : ""}`}>
      {error && <div className="alert alert-danger">{error}</div>}
      <div className="web-media-library-toolbar">
        <small className="text-muted me-auto">{t("web.mediaUploadHint")}</small>
        <input ref={inputRef} className="visually-hidden" type="file" accept={MEDIA_UPLOAD_ACCEPT} onChange={handleUpload} />
        <button className="btn btn-primary" type="button" disabled={upload.isPending} onClick={() => inputRef.current?.click()}>
          <i className="fas fa-upload me-2" />
          {upload.isPending ? t("web.states.uploading") : t("web.uploadMedia")}
        </button>
      </div>
      <div className="web-media-layout">
        <aside className="web-media-sidebar">
          <div className="web-folder-sidebar-header">
            <h3><i className="fas fa-folder-tree me-2" />{t("web.folders")}</h3>
            <button type="button" className="btn btn-sm btn-outline-secondary" title={t("web.commands.newFolder")} onClick={() => setFolderForm({ open: true, name: "", parentId: null, rename: null })}>
              <i className="fas fa-plus" />
            </button>
          </div>
          <button type="button" className={`web-folder-all ${selectedFolder === null ? "active" : ""}`} onClick={() => setSelectedFolder(null)}>
            <i className="fas fa-images me-2" />{t("web.allMedia")}
          </button>
          {foldersQuery.isLoading ? <LoadingSpinner /> : (
            <FolderTree
              items={folders}
              selectedId={selectedFolder}
              onSelect={(id) => setSelectedFolder(id)}
              {...manageProps}
            />
          )}
        </aside>
        <main className="web-media-main">
          <div className="web-media-folder-breadcrumb">
            <span>{t("web.folder")}:</span>
            <strong>{selectedFolder ? selectedName : t("web.allMedia")}</strong>
          </div>
          {mediaQuery.isLoading ? <LoadingSpinner /> : media.length === 0 ? (
            <div className="web-admin-empty">
              <i className="fas fa-images" />
              <h3>{t("web.empty.mediaTitle")}</h3>
              <p>{t("web.empty.mediaBody")}</p>
            </div>
          ) : (
            <div className="web-media-library">
              {media.map((item) => (
                <MediaCard
                  key={item.id}
                  item={item}
                  onDragStart={!selectMode ? (event) => { event.dataTransfer.setData("text/plain", String(item.id)); event.dataTransfer.effectAllowed = "move"; } : undefined}
                  onPreview={(previewed) => setPreviewItem(previewed)}
                  onEdit={() => { setEditing(item); setMetadata({ filename: item.filename || "", note: item.note || "", folder_id: item.folder_id || null }); }}
                  onDelete={() => { if (window.confirm(t("web.confirmDeleteMedia"))) remove.mutate(item.id); }}
                  onSelect={selectMode ? () => handleSelect(item) : undefined}
                  onClick={selectMode ? undefined : undefined}
                  t={t}
                />
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <nav className="web-pagination d-flex align-items-center gap-2 mt-3" aria-label={t("web.pagination")}>
              <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t("web.prev")}</button>
              <span className="small text-muted">{page + 1} / {totalPages} · {mediaTotal} {t("web.mediaCount")}</span>
              <button type="button" className="btn btn-sm btn-outline-secondary" disabled={page >= totalPages - 1} onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}>{t("web.next")}</button>
            </nav>
          )}
        </main>
      </div>

      {folderForm.open && (
        <div className="modal d-block" role="dialog" aria-modal="true" tabIndex="-1">
          <div className="modal-dialog">
            <form className="modal-content" onSubmit={(e) => { e.preventDefault(); if (folderForm.rename) updateFolder.mutate(); else createFolder.mutate(); }}>
              <div className="modal-header">
                <h2 className="modal-title fs-5">{folderForm.rename ? t("web.renameFolder") : t("web.commands.newFolder")}</h2>
                <button type="button" className="btn-close" aria-label={t("web.close")} onClick={() => setFolderForm({ open: false, name: "", parentId: null, rename: null })} />
              </div>
              <div className="modal-body">
                <label className="form-label">
                  <span>{t("web.fields.name")}</span>
                  <input className="form-control" autoFocus value={folderForm.name} onChange={(e) => setFolderForm((v) => ({ ...v, name: e.target.value }))} disabled={folderForm.rename?.name === "root"} />
                </label>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setFolderForm({ open: false, name: "", parentId: null, rename: null })}>{t("web.cancel")}</button>
                <button type="submit" className="btn btn-primary" disabled={!folderForm.name.trim()}>{t("web.save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {editing && (
        <div className="modal d-block" role="dialog" aria-modal="true" aria-labelledby="media-meta-title" tabIndex="-1">
          <div className="modal-dialog">
            <form className="modal-content" onSubmit={(event) => { event.preventDefault(); update.mutate(); }}>
              <div className="modal-header">
                <h2 className="modal-title fs-5" id="media-meta-title">{t("web.edit")} · {editing.filename}</h2>
                <button type="button" className="btn-close" aria-label={t("web.close")} onClick={() => setEditing(null)} />
              </div>
              <div className="modal-body d-grid gap-3">
                <label className="form-label">
                  <span>{t("web.mediaFilename")}</span>
                  <input className="form-control" value={metadata.filename} onChange={(event) => setMetadata((value) => ({ ...value, filename: event.target.value }))} />
                </label>
                <label className="form-label">
                  <span>{t("web.folder")}</span>
                  <select className="form-select" value={metadata.folder_id || ""} onChange={(event) => setMetadata((value) => ({ ...value, folder_id: event.target.value ? Number(event.target.value) : null }))}>
                    <option value="">{t("web.noFolder")}</option>
                    <FolderOptions folders={folders} />
                  </select>
                </label>
                <label className="form-label">
                  <span>{t("web.mediaNote")}</span>
                  <textarea className="form-control" rows="3" value={metadata.note} onChange={(event) => setMetadata((value) => ({ ...value, note: event.target.value }))} />
                </label>
                <div className="web-media-detail-metadata">
                  <h6>{t("web.mediaMetadata")}</h6>
                  <dl>
                    <div><dt>{t("web.mediaMime")}</dt><dd>{editing.mime || "—"}</dd></div>
                    <div><dt>{t("web.mediaSize")}</dt><dd>{editing.size ? `${(editing.size / 1024).toFixed(1)} kB` : "—"}</dd></div>
                    <div><dt>{t("web.mediaUploadedAt")}</dt><dd>{editing.created_at ? new Date(editing.created_at).toLocaleString() : "—"}</dd></div>
                    <div><dt>{t("web.mediaUploadedBy")}</dt><dd>{editing.uploaded_by?.real_name || editing.uploaded_by?.username || "—"}</dd></div>
                  </dl>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-outline-secondary" onClick={() => setEditing(null)}>{t("web.cancel")}</button>
                <button type="submit" className="btn btn-primary" disabled={update.isPending}>{t("web.save")}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {previewItem && (
        <div className="modal d-block" role="dialog" aria-modal="true" tabIndex="-1" onClick={() => setPreviewItem(null)}>
          <div className="modal-dialog modal-lg modal-dialog-centered">
            <div className="modal-content" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <h2 className="modal-title fs-5">{previewItem.filename}</h2>
                <button type="button" className="btn-close" aria-label={t("web.close")} onClick={() => setPreviewItem(null)} />
              </div>
              <div className="modal-body text-center">
                <MediaCard item={previewItem} onClick={() => {}} t={t} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

MediaLibrary.propTypes = {
  selectMode: PropTypes.bool,
  onSelectItem: PropTypes.func,
  embedded: PropTypes.bool,
};
