import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import api from "../../../services/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useAuth } from "../../../providers/AuthProvider";
import { formatDateToLocal } from "../../../utils/dateUtils";
import { buildPostDraftPayload } from "./contentContracts";
import MediaPickerField from "../media/MediaPickerField";
import MediaPreview from "../media/MediaPreview";
import ArticleEditBox from "./ArticleEditBox";
import UserAvatar from "../../../components/UserAvatar";
import EventPickerField from "../../../components/EventPickerField";
import Alert from "../../../components/Alert";
import AdminPageHeader from "./AdminPageHeader";
import "../styles/admin.css";

export default function WebAdminPosts() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();
  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";

  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(null);
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("updated_desc");
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const { data: postsResponse, isLoading } = useQuery({
    queryKey: ["web", "posts", { status, sort, page }],
    queryFn: async () => {
      const { data } = await api.get("/web/posts", { params: { status, sort, limit: pageSize, offset: (page - 1) * pageSize } });
      return data;
    },
    staleTime: 15_000,
  });
  const posts = postsResponse?.items || [];
  const total = postsResponse?.total || 0;
  const totalPages = postsResponse?.pages || 1;
  const canPublish = can("web.publish") || can("web.manage") || can("core.posts.publish");
  const canEdit = can("web.posts.manage") || can("web.manage") || can("core.posts.manage");

  const editingId = typeof editing === "number" ? editing : null;
  const {
    data: editingPost,
    isLoading: isLoadingPost,
    isError: isPostError,
  } = useQuery({
    queryKey: ["web", "posts", editingId],
    queryFn: async () => {
      const { data } = await api.get(`/web/posts/${editingId}`);
      return data;
    },
    enabled: editingId !== null,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["web", "posts"] });
    queryClient.invalidateQueries({ queryKey: ["web-news-list"] });
    queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
  };

  const deleteMutation = useMutation({
    mutationFn: async (postId) => {
      await api.delete(`/web/posts/${postId}`);
      return postId;
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

  const visibilityMutation = useMutation({
    mutationFn: async (post) => {
      if (post.published) return (await api.post(`/web/posts/${post.id}/unpublish`)).data;
      return (await api.post(`/web/posts/${post.id}/publish`, { expected_version: post.draft_version })).data;
    },
    onMutate: async (post) => {
      await queryClient.cancelQueries({ queryKey: ["web", "posts"] });
      const snapshots = queryClient.getQueriesData({ queryKey: ["web", "posts"] });
      queryClient.setQueriesData({ queryKey: ["web", "posts"] }, (current) => {
        if (!current?.items) return current;
        return { ...current, items: current.items.map((item) => item.id === post.id ? { ...item, published: !post.published, published_at: post.published ? null : new Date().toISOString() } : item) };
      });
      return { snapshots };
    },
    onSuccess: (response) => {
      const updatedPost = response?.post || response;
      queryClient.setQueriesData({ queryKey: ["web", "posts"] }, (current) => {
        if (!current?.items || !updatedPost?.id) return current;
        return { ...current, items: current.items.map((item) => item.id === updatedPost.id ? { ...item, ...updatedPost } : item) };
      });
      queryClient.invalidateQueries({ queryKey: ["web-news-list"] });
      queryClient.invalidateQueries({ queryKey: ["posts", "feed"] });
      setFeedback({ type: "success", message: t("web.saveSuccess") });
    },
    onError: (error, _post, context) => {
      context?.snapshots?.forEach(([key, data]) => queryClient.setQueryData(key, data));
      setFeedback({ type: "danger", message: error?.response?.data?.detail || t("web.saveFailed") });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["web", "posts"] }),
  });

  const handleDelete = (post) => {
    if (window.confirm(t("web.confirmDeletePost", { title: post.title }))) {
      deleteMutation.mutate(post.id);
    }
  };

  return (
    <div className="web-admin-posts">
      <AdminPageHeader title={t("web.postsTitle")} description={t("web.postsSubtitle")} action={<button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <i className="fas fa-plus me-2"></i>
          {t("web.newPost")}
        </button>} />

      {feedback && <Alert type={feedback.type} toast onDismiss={() => setFeedback(null)}>{feedback.message}</Alert>}

      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3">
        <div className="btn-group" role="group" aria-label={t("web.published")}>
          {[["all", t("web.all")], ["published", t("web.published")], ["draft", t("web.unpublished")]].map(([value, label]) => <button key={value} type="button" className={`btn btn-sm ${status === value ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => { setStatus(value); setPage(1); }}>{label}</button>)}
        </div>
        <label className="d-flex align-items-center gap-2 small text-muted">
          {t("web.sort")}
          <select className="form-select form-select-sm" value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }}>
            <option value="updated_desc">{t("web.sortUpdatedDesc")}</option>
            <option value="updated_asc">{t("web.sortUpdatedAsc")}</option>
            <option value="title_asc">{t("web.sortTitleAsc")}</option>
            <option value="title_desc">{t("web.sortTitleDesc")}</option>
            <option value="published_desc">{t("web.sortPublishedDesc")}</option>
          </select>
        </label>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : posts.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-newspaper fs-1 mb-3 d-block opacity-25"></i>
          {t("web.noPosts")}
        </div>
      ) : (
        <>
        <div className="web-posts-mobile-list d-md-none">
          {posts.map((post) => (
            <article key={post.id} className="web-posts-mobile-card">
              <button
                type="button"
                className="web-posts-mobile-card__main"
                onClick={() => canEdit && setEditing(post.id)}
                disabled={!canEdit}
              >
                <span className="web-posts-mobile-card__title">{post.title}</span>
                <span className="web-posts-mobile-card__meta">
                  <span className={`badge ${post.published ? "bg-success" : "bg-secondary"}`}>
                    <i className={`fas fa-${post.published ? "check" : "file"} me-1`} />
                    {post.published ? t("web.yes") : t("web.no")}
                  </span>
                  {post.author && <span className="web-posts-mobile-card__author"><UserAvatar user={{ real_name: post.author, avatar: post.author_avatar }} size={18} fallbackClass="bg-success" />{post.author}</span>}
                  {post.updated_at && <span>{formatDateToLocal(post.updated_at, locale)}</span>}
                </span>
              </button>
              <PostActions
                post={post}
                canEdit={canEdit}
                canPublish={canPublish}
                t={t}
                onEdit={() => setEditing(post.id)}
                onToggleVisibility={() => visibilityMutation.mutate(post)}
                onDelete={() => handleDelete(post)}
                visibilityPending={visibilityMutation.isPending}
                deletePending={deleteMutation.isPending}
                className="web-posts-mobile-card__actions"
              />
            </article>
          ))}
        </div>
        <div className="web-posts-mobile-pagination d-md-none">
          <span>{t("web.itemsAndPages", { count: total, page, pages: totalPages })}</span>
          <div className="btn-group btn-group-sm">
            <button type="button" className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t("web.previous")}</button>
            <button type="button" className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>{t("web.next")}</button>
          </div>
        </div>
        <div className="card shadow-sm web-posts-table d-none d-md-block">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>{t("web.title")}</th>
                  <th>{t("web.author")}</th>
                  <th>{t("web.published")}</th>
                  <th>{t("web.postPublishedAt")}</th>
                  <th>{t("web.updated")}</th>
                  <th className="text-end">{t("web.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr
                    key={post.id}
                    className={canEdit ? "web-posts-table__row" : undefined}
                    onClick={canEdit ? () => setEditing(post.id) : undefined}
                    onKeyDown={canEdit ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setEditing(post.id);
                      }
                    } : undefined}
                    role={canEdit ? "button" : undefined}
                    tabIndex={canEdit ? 0 : undefined}
                  >
                    <td className="fw-semibold">{post.title}</td>
                    <td className="small text-muted"><span className="d-inline-flex align-items-center gap-2"><UserAvatar user={{ real_name: post.author, avatar: post.author_avatar }} size={24} fallbackClass="bg-success" />{post.author || "—"}</span></td>
                    <td>
                      {post.published ? (
                        <span className="badge bg-success">
                          <i className="fas fa-check me-1"></i>
                          {t("web.yes")}
                        </span>
                      ) : (
                        <span className="badge bg-secondary">{t("web.no")}</span>
                      )}
                    </td>
                    <td className="small text-muted web-posts-table__updated">
                      {post.published_at ? formatDateToLocal(post.published_at, locale) : "—"}
                    </td>
                    <td className="small text-muted">
                      {post.updated_at ? formatDateToLocal(post.updated_at, locale) : "—"}
                    </td>
                    <td className="text-end">
                      <PostActions
                        post={post}
                        canEdit={canEdit}
                        canPublish={canPublish}
                        t={t}
                        onEdit={() => setEditing(post.id)}
                        onToggleVisibility={() => visibilityMutation.mutate(post)}
                        onDelete={() => handleDelete(post)}
                        visibilityPending={visibilityMutation.isPending}
                        deletePending={deleteMutation.isPending}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2 small text-muted">
            <span>{t("web.itemsAndPages", { count: total, page, pages: totalPages })}</span>
            <div className="btn-group btn-group-sm">
              <button type="button" className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t("web.previous")}</button>
              <button type="button" className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>{t("web.next")}</button>
            </div>
          </div>
        </div>
        </>
      )}

      {editing !== null && (editing === "new" || editingPost) && (
        <ArticleEditBoxModal
          post={editing === "new" ? {} : editingPost}
          onCancel={() => setEditing(null)}
          onSaved={(savedPost) => {
            queryClient.setQueriesData({ queryKey: ["web", "posts"] }, (current) => {
              if (!current?.items || !savedPost?.id) return current;
              return { ...current, items: current.items.map((item) => item.id === savedPost.id ? { ...item, ...savedPost } : item) };
            });
            setEditing(null);
            invalidate();
            setFeedback({ type: "success", message: t("web.saveSuccess") });
          }}
        />
      )}
      {editingId !== null && isLoadingPost && (
        <div className="web-builder-modal-backdrop"><LoadingSpinner /></div>
      )}
      {editingId !== null && isPostError && (
        <div className="web-builder-modal-backdrop" onClick={() => setEditing(null)}>
          <div className="alert alert-danger">{t("web.postLoadFailed")}</div>
        </div>
      )}
    </div>
  );
}

function PostActions({ post, canEdit, canPublish, t, onEdit, onToggleVisibility, onDelete, visibilityPending, deletePending, className = "", onClick }) {
  return (
    <div className={`btn-group btn-group-sm ${className}`.trim()} role="group" onClick={onClick}>
      {canEdit && <button type="button" className="btn btn-outline-secondary" title={t("web.edit")} onClick={onEdit}><i className="fas fa-pen" /></button>}
      {canPublish && <button type="button" className={`btn ${post.published ? "btn-outline-warning" : "btn-outline-success"}`} title={post.published ? t("web.unpublish") : t("web.editor.publish")} onClick={(event) => { event.stopPropagation(); onToggleVisibility(); }} disabled={visibilityPending}><i className={`fas ${post.published ? "fa-eye-slash" : "fa-eye"}`} /></button>}
      <button type="button" className="btn btn-outline-danger" title={t("web.delete")} onClick={onDelete} disabled={deletePending}><i className="fas fa-trash" /></button>
    </div>
  );
}

PostActions.propTypes = {
  post: PropTypes.object.isRequired,
  canEdit: PropTypes.bool.isRequired,
  canPublish: PropTypes.bool.isRequired,
  t: PropTypes.func.isRequired,
  onEdit: PropTypes.func.isRequired,
  onToggleVisibility: PropTypes.func.isRequired,
  onDelete: PropTypes.func.isRequired,
  visibilityPending: PropTypes.bool,
  deletePending: PropTypes.bool,
  className: PropTypes.string,
  onClick: PropTypes.func,
};

function ArticleEditBoxModal({ post, onCancel, onSaved }) {
  const { t } = useTranslation();
  const isNew = !post.id;

  const [form, setForm] = useState(() => ({
    title: post.title || "",
    body: post.body || "",
    cover_media_id: post.cover_media_id ? String(post.cover_media_id) : "",
    event_id: post.event_id ? String(post.event_id) : "",
  }));

  const saveMutation = useMutation({
    mutationFn: async ({ payload }) => {
      let saved;
      if (isNew) {
        const { data } = await api.post("/web/posts", payload);
        saved = data;
      } else {
        const { data } = await api.put(`/web/posts/${post.id}`, payload);
        saved = data;
      }
      return saved;
    },
    onSuccess: (savedPost) => onSaved(savedPost),
    onError: (error) => {
      window.alert(error?.response?.data?.detail || t("web.saveFailed"));
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    saveMutation.mutate({ payload: buildPostDraftPayload(post, form) });
  };

  return (
    <div className="web-builder-modal-backdrop" onClick={onCancel}>
      <form
        className="card web-builder-modal article-edit-modal"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="article-edit-modal__header">
              <div><span className="article-edit-modal__eyebrow">{isNew ? t("web.newContent") : t("web.editingContent")}</span><h2><i className="fas fa-newspaper me-2"></i>{isNew ? t("web.newPost") : t("web.editPost")}</h2></div>
          <button type="button" className="btn-close" aria-label={t("web.close")} onClick={onCancel} />
        </header>
        <div className="article-edit-modal__body">
          <div className="article-edit-modal__title-field">
            <label className="form-label">{t("web.title")}</label>
            <input
              className="form-control"
              value={form.title}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  title: e.target.value,
                }))
              }
              required
            />
          </div>
          <section className="article-edit-modal__editor">
                  <div className="article-edit-modal__section-heading"><span>{t("web.postBody")}</span><small>{t("web.postBodyHelp")}</small></div>
            <ArticleEditBox value={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))} disabled={saveMutation.isPending} />
          </section>
          <div className="article-edit-modal__settings">
          <section className="article-edit-modal__panel">
                  <div className="article-edit-modal__section-heading"><span>{t("web.postCover")}</span><small>{t("web.postCoverHelp")}</small></div>
            {form.cover_media_id && (
              <figure className="article-cover-preview">
                <MediaPreview
                  src={`/api/web/media/${encodeURIComponent(form.cover_media_id)}/file`}
                  alt={form.title || t("web.postCover")}
                  fallback={<i className="fas fa-image article-cover-preview-placeholder" aria-hidden="true" />}
                />
              </figure>
            )}
            <MediaPickerField
              value={form.cover_media_id || null}
              className="article-media-picker"
              onChange={(item) => {
                setForm((f) => ({ ...f, cover_media_id: item ? String(item.id) : "" }));
              }}
            />
          </section>
          <section className="article-edit-modal__panel">
            <div className="article-edit-modal__section-heading"><span>{t("web.linkedEvent")}</span><small>{t("web.eventLinkHint")}</small></div>
            <EventPickerField
              value={form.event_id ? Number(form.event_id) : undefined}
              disabled={saveMutation.isPending}
              onChange={(item) => setForm((current) => ({ ...current, event_id: item ? String(item.id) : "" }))}
            />
          </section>
          </div>
        </div>
          <footer className="article-edit-modal__footer">
            <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onCancel}>
              {t("web.cancel")}
            </button>
            <button
              type="submit"
              className="btn btn-sm btn-primary"
              disabled={saveMutation.isPending || !form.title.trim()}
            >
              <i className="fas fa-save me-1"></i>
              {t("web.save")}
            </button>
          </footer>
      </form>
    </div>
  );
}

ArticleEditBoxModal.propTypes = {
  post: PropTypes.object.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
