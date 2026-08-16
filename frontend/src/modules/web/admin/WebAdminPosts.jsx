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
import ArticleEditBox from "./ArticleEditBox";
import UserAvatar from "../../../components/UserAvatar";
import EventPickerField from "../../../components/EventPickerField";
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
    onSuccess: () => {
      invalidate();
      setFeedback({ type: "success", message: t("web.saveSuccess") });
    },
    onError: (error) => setFeedback({ type: "danger", message: error?.response?.data?.detail || t("web.saveFailed") }),
  });

  const handleDelete = (post) => {
    if (window.confirm(t("web.confirmDeletePost", { title: post.title }))) {
      deleteMutation.mutate(post.id);
    }
  };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div>
          <h1 className="h3 mb-0">{t("web.postsTitle")}</h1>
          <p className="text-muted mb-0 small">{t("web.postsSubtitle")}</p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing("new")}>
          <i className="fas fa-plus me-2"></i>
          {t("web.newPost")}
        </button>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} py-2`}>{feedback.message}</div>
      )}

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
        <div className="card shadow-sm">
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
                  <tr key={post.id}>
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
                    <td className="small text-muted">
                      {post.published_at ? formatDateToLocal(post.published_at, locale) : "—"}
                    </td>
                    <td className="small text-muted">
                      {post.updated_at ? formatDateToLocal(post.updated_at, locale) : "—"}
                    </td>
                    <td className="text-end">
                      <div className="btn-group btn-group-sm" role="group">
                        {canEdit && <button
                          type="button"
                          className="btn btn-outline-secondary"
                          title={t("web.edit")}
                          onClick={() => setEditing(post.id)}
                        >
                          <i className="fas fa-pen"></i>
                        </button>}
                        {canPublish && <button
                          type="button"
                          className={`btn ${post.published ? "btn-outline-warning" : "btn-outline-success"}`}
                          title={post.published ? t("web.unpublish") : t("web.editor.publish")}
                          onClick={() => visibilityMutation.mutate(post)}
                          disabled={visibilityMutation.isPending}
                        >
                          <i className={`fas ${post.published ? "fa-eye-slash" : "fa-eye"}`} />
                        </button>}
                        <button
                          type="button"
                          className="btn btn-outline-danger"
                          title={t("web.delete")}
                          onClick={() => handleDelete(post)}
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
          <div className="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2 small text-muted">
            <span>{t("web.itemsAndPages", { count: total, page, pages: totalPages })}</span>
            <div className="btn-group btn-group-sm">
              <button type="button" className="btn btn-outline-secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{t("web.previous")}</button>
              <button type="button" className="btn btn-outline-secondary" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>{t("web.next")}</button>
            </div>
          </div>
        </div>
      )}

      {editing !== null && (editing === "new" || editingPost) && (
        <ArticleEditBoxModal
          post={editing === "new" ? {} : editingPost}
          onCancel={() => setEditing(null)}
          onSaved={() => {
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
    </>
  );
}

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
    onSuccess: () => onSaved(),
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
        className="card web-builder-modal web-template-modal article-edit-modal"
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="card-body">
          <h5 className="card-title mb-3">
            <i className="fas fa-newspaper me-2"></i>
            {isNew ? t("web.newPost") : t("web.editPost")}
          </h5>
          <div className="mb-3">
            <label className="form-label small fw-semibold">{t("web.title")}</label>
            <input
              className="form-control form-control-sm"
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


          <div className="mb-3">
            <label className="form-label small fw-semibold">{t("web.postBody")}</label>
            <ArticleEditBox value={form.body} onChange={(body) => setForm((f) => ({ ...f, body }))} disabled={saveMutation.isPending} />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold d-block">{t("web.postCover")}</label>
            <MediaPickerField
              value={form.cover_media_id || null}
              className="article-media-picker"
              onChange={(item) => setForm((f) => ({ ...f, cover_media_id: item ? String(item.id) : "" }))}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">{t("web.linkedEvent")}</label>
            <EventPickerField
              value={form.event_id ? Number(form.event_id) : undefined}
              disabled={saveMutation.isPending}
              onChange={(item) => setForm((current) => ({ ...current, event_id: item ? String(item.id) : "" }))}
            />
            <div className="form-text">{t("web.eventLinkHint")}</div>
          </div>
          <div className="d-flex justify-content-end gap-2">
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
          </div>
        </div>
      </form>
    </div>
  );
}

ArticleEditBoxModal.propTypes = {
  post: PropTypes.object.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
