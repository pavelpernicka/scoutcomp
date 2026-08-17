import { useEffect, useState, useMemo, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import api from "../../../services/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import Alert from "../../../components/Alert";
import AdminPageHeader from "./AdminPageHeader";
import { useAuth } from "../../../providers/AuthProvider";
import {
  buildMenuDraftPayload,
  descendantMenuIds,
  nextTemporaryMenuId,
} from "./contentContracts";

export default function WebAdminMenus() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const canPublish = can("web.publish") || can("web.manage");
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
      setFeedback({ type: "success", message: t("web.saveSuccess") });
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

  const publishMutation = useMutation({
    mutationFn: async (menu) => {
      const { data } = await api.post(`/web/menus/${menu.id}/publish`, {
        expected_version: menu.draft_version,
      });
      return data;
    },
    onSuccess: () => {
      invalidate();
      setFeedback({ type: "success", message: t("web.menuPublishSuccess") });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("web.menuPublishFailed"),
      });
    },
  });

  const handleCreate = (event) => {
    event.preventDefault();
    if (!newMenu.name.trim()) return;
    createMutation.mutate({
      name: newMenu.name.trim(),
      location: newMenu.location || "main",
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
              />
            </div>
            <div className="col-12 col-md-3">
              <button
                type="submit"
                className="btn btn-sm btn-primary w-100"
                disabled={createMutation.isPending || !newMenu.name.trim()}
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
                          title={t("web.editItems")}
                          onClick={() => setEditingMenu(menu)}
                        >
                          <i className="fas fa-list"></i>
                        </button>
                        {canPublish && (
                          <button
                            type="button"
                            className="btn btn-outline-success"
                            title={t("web.editor.publish")}
                            onClick={() => publishMutation.mutate(menu)}
                            disabled={publishMutation.isPending}
                          >
                            <i className="fas fa-arrow-up-from-bracket"></i>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          title={t("web.delete")}
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
            setFeedback({ type: "success", message: t("web.saveSuccess") });
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

function MenuItemsEditor({ menu, onCancel, onSaved }) {
  const { t } = useTranslation();
  const [items, setItems] = useState(() => flattenTree(menu.items || [], null));

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
      window.alert(error?.response?.data?.detail || t("web.saveFailed"));
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
    saveMutation.mutate(buildMenuDraftPayload(menu, items));
  };

  const nested = useMemo(() => buildNested(items, null), [items]);

  return (
    <div className="web-builder-modal-backdrop" onClick={onCancel}>
      <form
        className="card web-builder-modal web-template-modal"
        style={{ maxWidth: 900 }}
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between mb-3">
            <h5 className="card-title mb-0">
              <i className="fas fa-bars me-2"></i>
              {t("web.editMenuItems", { name: menu.name })}
            </h5>
            <button type="button" className="btn-close" onClick={onCancel}></button>
          </div>

          {items.length === 0 && (
            <p className="text-muted small mb-3">{t("web.noMenuItems")}</p>
          )}

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

          <div className="d-flex justify-content-between gap-2 mt-3">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => addItem(null)}>
              <i className="fas fa-plus me-1"></i>
              {t("web.menuAddItem")}
            </button>
            <div className="d-flex gap-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
                {t("web.cancel")}
              </button>
              <button
                type="submit"
                className="btn btn-sm btn-primary"
                disabled={saveMutation.isPending}
              >
                <i className="fas fa-save me-1"></i>
                {t("web.save")}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

/* ---- Recursive tree row ---- */
function MenuTree({ nodes, items, pages, posts, onUpdate, onRemove, onMove, onAdd, onReparent, t, depth = 0 }) {
  const [dragOver, setDragOver] = useState(null);
  const [expanded, setExpanded] = useState({});

  const handleDragStart = useCallback((e, item) => {
    e.dataTransfer.setData("text/plain", String(item.id));
    e.dataTransfer.effectAllowed = "move";
  }, []);

  const handleDragOver = useCallback((e, item) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOver(item.id);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(null);
  }, []);

  const handleDrop = useCallback((e, targetItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const sourceId = Number(e.dataTransfer.getData("text/plain"));
    if (!sourceId || sourceId === targetItem.id) return;
    const descendants = descendantMenuIds(items, sourceId);
    if (descendants.has(targetItem.id)) return;
    onReparent(sourceId, targetItem.id);
  }, [items, onReparent]);

  const handleDropBefore = useCallback((e, targetItem) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const sourceId = Number(e.dataTransfer.getData("text/plain"));
    if (!sourceId || sourceId === targetItem.id) return;
    const descendants = descendantMenuIds(items, sourceId);
    if (descendants.has(targetItem.id)) return;
    // Reorder within the same parent (before target)
    onReparent(sourceId, targetItem.parent_id ?? null);
    onMove(sourceId, -1);
  }, [items, onReparent, onMove]);

  const toggleExpanded = (id) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  return nodes.map((item) => {
    const hasChildren = item.children?.length > 0;
    const isExpanded = expanded[item.id] !== false;
    const descendants = descendantMenuIds(items, item.id);
    const canBeParentOf = (candidateId) => candidateId !== item.id && !descendants.has(candidateId);
    const availableParents = items.filter((i) => canBeParentOf(i.id) && i.id !== item.id && i.label);
    const isDragTarget = dragOver === item.id;

    return (
      <div key={item.id} className="web-menu-tree-node" style={{ marginLeft: depth * 20 }}>
        <div
          className={`border rounded p-2 mb-1 bg-light ${isDragTarget ? "border-primary" : ""}`}
          draggable
          onDragStart={(e) => handleDragStart(e, item)}
          onDragOver={(e) => handleDragOver(e, item)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, item)}
          style={{ cursor: "grab" }}
        >
          <div
            className="web-menu-drag-handle"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
            onDrop={(e) => handleDropBefore(e, item)}
            style={{ height: 4, marginBottom: 2, borderRadius: 2 }}
          />
          <div className="row g-2 align-items-end">
            <div className="col-auto pe-0">
              {hasChildren ? (
                <button type="button" className="btn btn-sm btn-link p-0 me-1" onClick={() => toggleExpanded(item.id)} title={isExpanded ? t("web.collapse") : t("web.expand")}>
                  <i className={`fas fa-chevron-${isExpanded ? "down" : "right"}`} />
                </button>
              ) : null}
              <i className="fas fa-grip-vertical text-muted" style={{ cursor: "grab" }} />
            </div>
            <div className="col-12 col-md-4" style={{ paddingLeft: 0 }}>
              <input
                className="form-control form-control-sm"
                placeholder={t("web.menuItemLabel")}
                value={item.label}
                onChange={(e) => onUpdate(item.id, { label: e.target.value })}
              />
            </div>
            <div className="col-6 col-md-2">
              <select
                className="form-select form-select-sm"
                value={item.item_type}
                onChange={(e) => onUpdate(item.id, {
                  item_type: e.target.value,
                  page_id: null,
                  post_id: null,
                  page_slug: null,
                  url: "",
                })}
              >
                <option value="page">{t("web.menuItemTypes.page")}</option>
                <option value="post">{t("web.menuItemTypes.post")}</option>
                <option value="external">{t("web.menuItemTypes.external")}</option>
              </select>
            </div>
            <div className="col-6 col-md-3">
              {item.item_type === "page" && (
                <select
                  className="form-select form-select-sm"
                  value={item.page_id ?? ""}
                  onChange={(e) => onUpdate(item.id, { page_id: e.target.value ? Number(e.target.value) : null, page_slug: null })}
                >
                  <option value="">—</option>
                  {pages.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              )}
              {item.item_type === "post" && (
                <select
                  className="form-select form-select-sm"
                  value={item.post_id ?? ""}
                  onChange={(e) => onUpdate(item.id, { post_id: e.target.value ? Number(e.target.value) : null })}
                >
                  <option value="">—</option>
                  {posts.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              )}
              {item.item_type === "external" && (
                <input
                  className="form-control form-control-sm"
                  placeholder={t("web.menuItemUrl")}
                  value={item.url || ""}
                  onChange={(e) => onUpdate(item.id, { url: e.target.value })}
                />
              )}
            </div>
            <div className="col-12 col-md-3">
              <div className="d-flex gap-1 align-items-center">
                {availableParents.length > 0 && (
                  <select
                    className="form-select form-select-sm flex-grow-1"
                    value={item.parent_id ?? ""}
                    onChange={(e) => onReparent(item.id, e.target.value ? Number(e.target.value) : null)}
                  >
                    <option value="">{t("web.menuNoParent")}</option>
                    {buildParentOptions(availableParents)}
                  </select>
                )}
                <button type="button" className="btn btn-sm btn-outline-secondary" title={t("web.moveUp")} onClick={() => onMove(item.id, -1)}>
                  <i className="fas fa-chevron-up"></i>
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" title={t("web.moveDown")} onClick={() => onMove(item.id, 1)}>
                  <i className="fas fa-chevron-down"></i>
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" title={t("web.addSubItem")} onClick={() => onAdd(item.id)}>
                  <i className="fas fa-plus"></i>
                </button>
                <button type="button" className="btn btn-sm btn-outline-danger" title={t("web.delete")} onClick={() => onRemove(item.id)}>
                  <i className="fas fa-trash"></i>
                </button>
              </div>
            </div>
          </div>
          <div className="row g-2 mt-1">
            <div className="col-6 col-md-3">
              <select
                className="form-select form-select-sm"
                value={item.target || ""}
                onChange={(e) => onUpdate(item.id, { target: e.target.value || null })}
              >
                <option value="">{t("web.menuTargetSame")}</option>
                <option value="_blank">{t("web.menuTargetNew")}</option>
              </select>
            </div>
            <div className="col-6 col-md-9">
              <input
                className="form-control form-control-sm"
                placeholder={t("web.menuRel")}
                value={item.rel || ""}
                onChange={(e) => onUpdate(item.id, { rel: e.target.value || null })}
              />
            </div>
          </div>
        </div>
        {hasChildren && isExpanded && (
          <MenuTree
            nodes={item.children}
            items={items}
            pages={pages}
            posts={posts}
            onUpdate={onUpdate}
            onRemove={onRemove}
            onMove={onMove}
            onAdd={onAdd}
            onReparent={onReparent}
            t={t}
            depth={depth + 1}
          />
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
