import { useEffect, useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import api from "../../../services/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Alert from "../../../components/Alert";
import Modal from "../../../components/Modal";
import ModalFooterStatus from "../../../components/ModalFooterStatus";
import AdminPageHeader from "./AdminPageHeader";
import {
  buildMenuDraftPayload,
  descendantMenuIds,
  nextTemporaryMenuId,
} from "./contentContracts";

export default function WebAdminMenus() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState(null);
  const [editingMenu, setEditingMenu] = useState(null);
  const [newMenu, setNewMenu] = useState({ name: "", location: "main" });

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const { data: menus = [], isLoading } = useQuery({
    queryKey: ["web", "menus"],
    queryFn: async () => {
      const { data } = await api.get("/web/menus");
      return data;
    },
    staleTime: 15_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["web", "menus"] });

  const createMutation = useMutation({
    mutationFn: async (payload) => api.post("/web/menus", payload),
    onSuccess: () => {
      invalidate();
      setNewMenu({ name: "", location: "main" });
      setFeedback({ type: "success", message: t("web.menuSaveSuccess") });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("web.saveFailed"),
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (menuId) => {
      await api.delete(`/web/menus/${menuId}`);
      return menuId;
    },
    onSuccess: () => {
      invalidate();
      setFeedback({ type: "success", message: t("web.deleteSuccess") });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("web.deleteFailed"),
      });
    },
  });

  const handleCreate = (event) => {
    event.preventDefault();
    if (!newMenu.name.trim() || !newMenu.location.trim()) return;
    createMutation.mutate({
      name: newMenu.name.trim(),
      location: newMenu.location.trim(),
    });
  };

  const handleDelete = (menu) => {
    if (window.confirm(t("web.confirmDeleteMenu", { name: menu.name }))) {
      deleteMutation.mutate(menu.id);
    }
  };

  return (
    <>
      <AdminPageHeader title={t("web.menusTitle")} description={t("web.menusSubtitle")} />

      {feedback && <Alert type={feedback.type} toast onDismiss={() => setFeedback(null)}>{feedback.message}</Alert>}

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <form className="row g-2 align-items-end" onSubmit={handleCreate}>
            <div className="col-12 col-md-5">
              <label className="form-label small fw-semibold">{t("web.menuName")}</label>
              <input
                className="form-control form-control-sm"
                value={newMenu.name}
                onChange={(e) => setNewMenu((m) => ({ ...m, name: e.target.value }))}
                placeholder={t("web.menuNamePlaceholder")}
                maxLength={100}
                required
              />
            </div>
            <div className="col-12 col-md-4">
              <label className="form-label small fw-semibold">{t("web.menuLocation")}</label>
              <input
                className="form-control form-control-sm"
                value={newMenu.location}
                onChange={(e) => setNewMenu((m) => ({ ...m, location: e.target.value }))}
                placeholder="main"
                maxLength={50}
                required
              />
            </div>
            <div className="col-12 col-md-3">
              <button
                type="submit"
                className="btn btn-sm btn-primary w-100"
                disabled={createMutation.isPending || !newMenu.name.trim() || !newMenu.location.trim()}
              >
                <i className="fas fa-plus me-1"></i>
                {t("web.newMenu")}
              </button>
            </div>
          </form>
          <div className="form-text mt-2">{t("web.menuLocationHint")}</div>
        </div>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : menus.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-bars fs-1 mb-3 d-block opacity-25"></i>
          {t("web.noMenus")}
        </div>
      ) : (
        <div className="card shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>{t("web.menuName")}</th>
                  <th>{t("web.menuLocation")}</th>
                  <th>{t("web.menuItems")}</th>
                  <th>{t("web.published")}</th>
                  <th className="text-end">{t("web.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {menus.map((menu) => (
                  <tr key={menu.id}>
                    <td className="fw-semibold">{menu.name}</td>
                    <td>
                      <code>{menu.location || "—"}</code>
                    </td>
                    <td className="text-muted small">{menu.item_count ?? menu.items?.length ?? 0}</td>
                    <td>
                      <span className={`badge ${menu.published_revision_id ? "bg-success" : "bg-secondary"}`}>
                        {menu.published_revision_id ? t("web.states.published") : t("web.states.draft")}
                      </span>
                    </td>
                    <td className="text-end">
                      <div className="btn-group btn-group-sm" role="group">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          title={t("web.editMenu")}
                          aria-label={t("web.editMenu")}
                          onClick={() => setEditingMenu(menu)}
                        >
                          <i className="fas fa-pen"></i>
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          title={t("web.delete")}
                          aria-label={t("web.delete")}
                          onClick={() => handleDelete(menu)}
                          disabled={deleteMutation.isPending}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {editingMenu !== null && (
        <MenuItemsEditor
          menu={editingMenu}
          onCancel={() => setEditingMenu(null)}
          onSaved={() => {
            setEditingMenu(null);
            invalidate();
            setFeedback({ type: "success", message: t("web.menuSaveSuccess") });
          }}
        />
      )}
    </>
  );
}

/* ================================================================
   Hierarchical tree editor for a single menu's items.
   ================================================================ */

function flattenTree(nodes, parentId, depth = 0) {
  return (nodes || []).flatMap((node) => [
    { ...node, parent_id: parentId, depth },
    ...flattenTree(node.children || [], node.id, depth + 1),
  ]);
}

function buildNested(items, parentId = null) {
  const result = [];
  (items || [])
    .filter((item) => (item.parent_id ?? null) === parentId)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .forEach((item) => {
      result.push({ ...item, children: buildNested(items, item.id) });
    });
  return result;
}

export function MenuItemsEditor({ menu, onCancel, onSaved }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(() => flattenTree(menu.items || [], null));
  const [details, setDetails] = useState({ name: menu.name, location: menu.location || "main" });
  const [saveError, setSaveError] = useState("");

  const { data: pages = [] } = useQuery({
    queryKey: ["web", "pages"],
    queryFn: async () => {
      const { data } = await api.get("/web/pages");
      return data;
    },
    staleTime: 30_000,
  });

  const { data: postsResponse } = useQuery({
    queryKey: ["web", "posts"],
    queryFn: async () => {
      const { data } = await api.get("/web/posts");
      return data;
    },
    staleTime: 30_000,
  });
  const posts = postsResponse?.items || [];

  const saveMutation = useMutation({
    mutationFn: async (payload) => api.put(`/web/menus/${menu.id}/items`, payload),
    onSuccess: () => onSaved(),
    onError: (error) => {
      setSaveError(error?.response?.data?.detail || t("web.saveFailed"));
    },
  });

  const addItem = (parentId = null) => {
    setItems((current) => {
      const maxPos = Math.max(0, ...current.filter((i) => (i.parent_id ?? null) === parentId).map((i) => i.position ?? 0));
      return [
        ...current,
        {
          id: nextTemporaryMenuId(current),
          label: "",
          item_type: "page",
          page_id: null,
          post_id: null,
          page_slug: null,
          url: "",
          target: null,
          rel: null,
          parent_id: parentId,
          position: maxPos + 1,
          depth: (current.find((i) => i.id === parentId)?.depth ?? -1) + 1,
        },
      ];
    });
  };

  const updateItem = (id, patch) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeItem = (id) => {
    setItems((current) => {
      const descendants = descendantMenuIds(current, id);
      descendants.add(id);
      return current.filter((item) => !descendants.has(item.id));
    });
  };

  const moveItem = (id, direction) => {
    setItems((current) => {
      const item = current.find((i) => i.id === id);
      if (!item) return current;
      const siblings = current.filter(
        (i) => (i.parent_id ?? null) === (item.parent_id ?? null)
      ).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
      const idx = siblings.findIndex((s) => s.id === id);
      if (idx === -1) return current;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= siblings.length) return current;
      const result = current.map((i) => ({ ...i }));
      const me = result.find((i) => i.id === id);
      const other = result.find((i) => i.id === siblings[newIdx].id);
      const tmp = me.position;
      me.position = other.position;
      other.position = tmp;
      return result;
    });
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setSaveError("");
    saveMutation.mutate(buildMenuDraftPayload({ ...menu, ...details }, items));
  };

  const nested = useMemo(() => buildNested(items, null), [items]);
  const invalid = !details.name.trim() || !details.location.trim() || items.some((item) => (
    !item.label.trim()
    || (item.item_type === "page" && !item.page_id && !item.page_slug)
    || (item.item_type === "post" && !item.post_id)
    || (item.item_type === "external" && !item.url?.trim())
  ));

  return (
    <Modal
      isVisible
      onClose={onCancel}
      title={t("web.editMenu")}
      subtitle={t("web.editMenuSubtitle")}
      icon={<i className="fas fa-bars" />}
      size="xl"
      className="web-menu-editor-modal"
      footer={(
        <>
          {saveError ? <ModalFooterStatus>{saveError}</ModalFooterStatus> : null}
          <button type="button" className="btn btn-outline-secondary me-auto" onClick={() => addItem(null)}>
            <i className="fas fa-plus me-2" />{t("web.menuAddItem")}
          </button>
          <div className="app-modal-footer-actions">
            <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>{t("web.cancel")}</button>
            <button type="submit" form="web-menu-editor-form" className="btn btn-primary" disabled={saveMutation.isPending || invalid}>
              <i className="fas fa-save me-2" />{saveMutation.isPending ? t("web.states.saving") : t("web.save")}
            </button>
          </div>
        </>
      )}
    >
      <form id="web-menu-editor-form" className="web-menu-editor" onSubmit={handleSubmit}>
        <section className="web-menu-editor-details" aria-labelledby="web-menu-details-title">
          <div className="web-menu-editor-section-heading">
            <div>
              <h3 id="web-menu-details-title">{t("web.menuDetails")}</h3>
              <p>{t("web.menuDetailsHint")}</p>
            </div>
          </div>
          <div className="web-menu-details-grid">
            <label>
              <span>{t("web.menuName")}</span>
              <input
                className="form-control"
                value={details.name}
                maxLength={100}
                onChange={(event) => setDetails((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </label>
            <label>
              <span>{t("web.menuDesignation")}</span>
              <input
                className="form-control web-menu-designation-input"
                value={details.location}
                maxLength={50}
                onChange={(event) => setDetails((current) => ({ ...current, location: event.target.value }))}
                required
              />
              <small>{t("web.menuLocationHint")}</small>
            </label>
          </div>
        </section>

        <section className="web-menu-editor-items" aria-labelledby="web-menu-items-title">
          <div className="web-menu-editor-section-heading">
            <div>
              <h3 id="web-menu-items-title">{t("web.menuItemsHeading")}</h3>
              <p>{t("web.menuItemsHint")}</p>
            </div>
            <span className="web-menu-item-count">{items.length}</span>
          </div>

          {items.length === 0 ? (
            <button type="button" className="web-menu-empty" onClick={() => addItem(null)}>
              <i className="fas fa-plus" aria-hidden="true" />
              <strong>{t("web.menuAddItem")}</strong>
              <span>{t("web.noMenuItems")}</span>
            </button>
          ) : (
            <MenuTree
              nodes={nested}
              items={items}
              pages={pages}
              posts={posts}
              onUpdate={updateItem}
              onRemove={removeItem}
              onMove={moveItem}
              onAdd={addItem}
              onReparent={(itemId, newParentId) => {
                setItems((current) =>
                  current.map((i) => (i.id === itemId ? { ...i, parent_id: newParentId || null } : i))
                );
              }}
              t={t}
            />
          )}
        </section>
      </form>
    </Modal>
  );
}

/* ---- Recursive tree row ---- */
function MenuTree({ nodes, items, pages, posts, onUpdate, onRemove, onMove, onAdd, onReparent, t, depth = 0 }) {
  const [dragOver, setDragOver] = useState(null);
  const [expanded, setExpanded] = useState({});

  const handleDragStart = useCallback((event, item) => {
    event.dataTransfer.setData("text/plain", String(item.id));
    event.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((event, item) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOver(item.id);
  }, []);

  const handleDragLeave = useCallback(() => setDragOver(null), []);

  const handleDrop = useCallback((event, targetItem) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    const sourceId = Number(event.dataTransfer.getData("text/plain"));
    if (!sourceId || sourceId === targetItem.id) return;
    const descendants = descendantMenuIds(items, sourceId);
    if (!descendants.has(targetItem.id)) onReparent(sourceId, targetItem.id);
  }, [items, onReparent]);

  const handleDropBefore = useCallback((event, targetItem) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOver(null);
    const sourceId = Number(event.dataTransfer.getData("text/plain"));
    if (!sourceId || sourceId === targetItem.id) return;
    const descendants = descendantMenuIds(items, sourceId);
    if (descendants.has(targetItem.id)) return;
    onReparent(sourceId, targetItem.parent_id ?? null);
    onMove(sourceId, -1);
  }, [items, onReparent, onMove]);

  const toggleExpanded = (id) => setExpanded((current) => ({ ...current, [id]: !current[id] }));

  return nodes.map((item) => {
    const hasChildren = item.children?.length > 0;
    const isExpanded = expanded[item.id] !== false;
    const descendants = descendantMenuIds(items, item.id);
    const availableParents = items.filter((candidate) => (
      candidate.id !== item.id && !descendants.has(candidate.id) && candidate.label
    ));
    const siblings = items
      .filter((candidate) => (candidate.parent_id ?? null) === (item.parent_id ?? null))
      .sort((left, right) => (left.position ?? 0) - (right.position ?? 0));
    const siblingIndex = siblings.findIndex((candidate) => candidate.id === item.id);

    return (
      <div key={item.id} className={`web-menu-tree-node ${depth === 0 ? "is-root" : ""}`} style={{ "--menu-depth": depth }}>
        <article
          className={`web-menu-item-card ${dragOver === item.id ? "is-drag-target" : ""}`}
          onDragOver={(event) => handleDragOver(event, item)}
          onDragLeave={handleDragLeave}
          onDrop={(event) => handleDrop(event, item)}
        >
          <div
            className="web-menu-drop-before"
            onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); }}
            onDrop={(event) => handleDropBefore(event, item)}
          />
          <header className="web-menu-item-header">
            <div className="web-menu-item-identity">
              {hasChildren ? (
                <button type="button" className="web-menu-icon-button" onClick={() => toggleExpanded(item.id)} title={isExpanded ? t("web.collapse") : t("web.expand")} aria-label={isExpanded ? t("web.collapse") : t("web.expand")}>
                  <i className={`fas fa-chevron-${isExpanded ? "down" : "right"}`} />
                </button>
              ) : <span className="web-menu-icon-spacer" />}
              <button type="button" className="web-menu-icon-button is-drag-handle" draggable onDragStart={(event) => handleDragStart(event, item)} title={t("web.menuDragItem")} aria-label={t("web.menuDragItem")}>
                <i className="fas fa-grip-vertical" />
              </button>
              <div>
                <strong>{item.label || t("web.menuNewItem")}</strong>
                <span>{depth > 0 ? t("web.menuNestedItem") : t("web.menuRootItem")}</span>
              </div>
            </div>
            <div className="web-menu-item-actions">
              <button type="button" className="web-menu-icon-button" title={t("web.moveUp")} aria-label={t("web.moveUp")} disabled={siblingIndex <= 0} onClick={() => onMove(item.id, -1)}><i className="fas fa-arrow-up" /></button>
              <button type="button" className="web-menu-icon-button" title={t("web.moveDown")} aria-label={t("web.moveDown")} disabled={siblingIndex === siblings.length - 1} onClick={() => onMove(item.id, 1)}><i className="fas fa-arrow-down" /></button>
              <button type="button" className="web-menu-icon-button" title={t("web.addSubItem")} aria-label={t("web.addSubItem")} onClick={() => onAdd(item.id)}><i className="fas fa-plus" /></button>
              <button type="button" className="web-menu-icon-button is-danger" title={t("web.delete")} aria-label={t("web.delete")} onClick={() => onRemove(item.id)}><i className="fas fa-trash" /></button>
            </div>
          </header>

          <div className="web-menu-item-fields">
            <label className="web-menu-item-label-field">
              <span>{t("web.menuItemLabel")}</span>
              <input className="form-control" placeholder={t("web.menuItemLabelPlaceholder")} value={item.label} maxLength={100} onChange={(event) => onUpdate(item.id, { label: event.target.value })} required />
            </label>
            <label>
              <span>{t("web.menuItemType")}</span>
              <select className="form-select" value={item.item_type} onChange={(event) => onUpdate(item.id, { item_type: event.target.value, page_id: null, post_id: null, page_slug: null, url: "" })}>
                <option value="page">{t("web.menuItemTypes.page")}</option>
                <option value="post">{t("web.menuItemTypes.post")}</option>
                <option value="external">{t("web.menuItemTypes.external")}</option>
              </select>
            </label>
            <label>
              <span>{t("web.menuDestination")}</span>
              {item.item_type === "page" && (
                <select className="form-select" value={item.page_id ?? ""} onChange={(event) => onUpdate(item.id, { page_id: event.target.value ? Number(event.target.value) : null, page_slug: null })} required>
                  <option value="">{t("web.menuChoosePage")}</option>
                  {pages.map((page) => <option key={page.id} value={page.id}>{page.title}</option>)}
                </select>
              )}
              {item.item_type === "post" && (
                <select className="form-select" value={item.post_id ?? ""} onChange={(event) => onUpdate(item.id, { post_id: event.target.value ? Number(event.target.value) : null })} required>
                  <option value="">{t("web.menuChoosePost")}</option>
                  {posts.map((post) => <option key={post.id} value={post.id}>{post.title}</option>)}
                </select>
              )}
              {item.item_type === "external" && (
                <input className="form-control" placeholder={t("web.menuItemUrl")} value={item.url || ""} onChange={(event) => onUpdate(item.id, { url: event.target.value })} required />
              )}
            </label>
          </div>

          <details className="web-menu-item-advanced">
            <summary>{t("web.menuAdvanced")}</summary>
            <div className="web-menu-item-advanced-fields">
              <label>
                <span>{t("web.menuParent")}</span>
                <select className="form-select" value={item.parent_id ?? ""} onChange={(event) => onReparent(item.id, event.target.value ? Number(event.target.value) : null)}>
                  <option value="">{t("web.menuNoParent")}</option>
                  {buildParentOptions(availableParents)}
                </select>
              </label>
              <label>
                <span>{t("web.menuTarget")}</span>
                <select className="form-select" value={item.target || ""} onChange={(event) => onUpdate(item.id, { target: event.target.value || null })}>
                  <option value="">{t("web.menuTargetSame")}</option>
                  <option value="_blank">{t("web.menuTargetNew")}</option>
                </select>
              </label>
              <label>
                <span>{t("web.menuRel")}</span>
                <input className="form-control" value={item.rel || ""} onChange={(event) => onUpdate(item.id, { rel: event.target.value || null })} />
              </label>
            </div>
          </details>
        </article>
        {hasChildren && isExpanded && (
          <MenuTree nodes={item.children} items={items} pages={pages} posts={posts} onUpdate={onUpdate} onRemove={onRemove} onMove={onMove} onAdd={onAdd} onReparent={onReparent} t={t} depth={depth + 1} />
        )}
      </div>
    );
  });
}

// Render parent options hierarchically with indentation.
function buildParentOptions(parents) {
  // Group by parent_id
  const byParent = new Map();
  parents.forEach((p) => {
    const key = p.parent_id ?? null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(p);
  });
  const render = (parentId, depth) => {
    const list = (byParent.get(parentId) || []).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return list.flatMap((p) => [
      <option key={p.id} value={p.id}>
        {"\u00A0".repeat(depth * 2)}{depth > 0 ? "\u2514 " : ""}{p.label}
      </option>,
      ...render(p.id, depth + 1),
    ]);
  };
  return render(null, 0);
}

MenuItemsEditor.propTypes = {
  menu: PropTypes.object.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
MenuTree.propTypes = {
  nodes: PropTypes.array.isRequired,
  items: PropTypes.array.isRequired,
  pages: PropTypes.array.isRequired,
  posts: PropTypes.array.isRequired,
  onUpdate: PropTypes.func.isRequired,
  onRemove: PropTypes.func.isRequired,
  onMove: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
  onReparent: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
