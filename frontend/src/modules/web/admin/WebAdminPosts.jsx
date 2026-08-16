import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import api from "../../../services/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { useAuth } from "../../../providers/AuthProvider";
import { formatDateToLocal } from "../../../utils/dateUtils";
import { buildPostDraftPayload, normalizeCollection } from "./contentContracts";

const slugify = (value) =>
  (value || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "prispevek";

export default function WebAdminPosts() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";

  const [feedback, setFeedback] = useState(null);
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ["web", "posts"],
    queryFn: async () => {
      const { data } = await api.get("/web/posts");
      return data;
    },
    staleTime: 15_000,
  });

  const { data: media = [] } = useQuery({
    queryKey: ["web", "media"],
    queryFn: async () => {
      const { data } = await api.get("/web/media");
      return normalizeCollection(data);
    },
    staleTime: 30_000,
  });

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
                  <th>{t("web.slug")}</th>
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
                    <td>
                      <code>{post.slug}</code>
                    </td>
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
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          title={t("web.edit")}
                          onClick={() => setEditing(post.id)}
                        >
                          <i className="fas fa-pen"></i>
                        </button>
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
        </div>
      )}

      {editing !== null && (editing === "new" || editingPost) && (
        <PostFormModal
          post={editing === "new" ? {} : editingPost}
          media={media}
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

function PostFormModal({ post, media, onCancel, onSaved }) {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canPublish = can("web.publish") || can("web.manage");
  const isNew = !post.id;

  const [form, setForm] = useState(() => ({
    title: post.title || "",
    slug: post.slug || "",
    excerpt: post.excerpt || "",
    body: post.body || "",
    cover_media_id: post.cover_media_id ? String(post.cover_media_id) : "",
  }));

  const saveMutation = useMutation({
    mutationFn: async ({ payload, publish }) => {
      let saved;
      if (isNew) {
        const { data } = await api.post("/web/posts", payload);
        saved = data;
      } else {
        const { data } = await api.put(`/web/posts/${post.id}`, payload);
        saved = data;
      }
      if (publish) {
        await api.post(`/web/posts/${saved.id}/publish`, { expected_version: saved.draft_version });
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
    const publish = event.nativeEvent.submitter?.value === "publish";
    saveMutation.mutate({ publish, payload: buildPostDraftPayload(post, form) });
  };

  return (
    <div className="web-builder-modal-backdrop" onClick={onCancel}>
      <form
        className="card web-builder-modal web-template-modal"
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
                  slug: isNew ? slugify(e.target.value) : f.slug,
                }))
              }
              required
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">{t("web.slug")}</label>
            <input
              className="form-control form-control-sm"
              value={form.slug}
              onChange={(e) => setForm((f) => ({ ...f, slug: slugify(e.target.value) }))}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">{t("web.postExcerpt")}</label>
            <textarea
              className="form-control form-control-sm"
              rows={2}
              value={form.excerpt}
              onChange={(e) => setForm((f) => ({ ...f, excerpt: e.target.value }))}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">
              {t("web.postBody")}
              <span className="text-muted fw-normal"> — Markdown</span>
            </label>
            <textarea
              className="form-control form-control-sm web-template-code"
              rows={8}
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            />
          </div>
          <div className="mb-3">
            <label className="form-label small fw-semibold">{t("web.postCover")}</label>
            <select
              className="form-select form-select-sm"
              value={form.cover_media_id}
              onChange={(e) =>
                setForm((f) => ({ ...f, cover_media_id: e.target.value }))
              }
            >
              <option value="">—</option>
              {media.map((item) => (
                <option key={item.id} value={String(item.id)}>
                  {item.filename}
                </option>
              ))}
            </select>
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
            {canPublish && <button type="submit" value="publish" className="btn btn-sm btn-success" disabled={saveMutation.isPending || !form.title.trim()}><i className="fas fa-arrow-up-from-bracket me-1" />{t("web.editor.publish")}</button>}
          </div>
        </div>
      </form>
    </div>
  );
}

PostFormModal.propTypes = {
  post: PropTypes.object.isRequired,
  media: PropTypes.array.isRequired,
  onCancel: PropTypes.func.isRequired,
  onSaved: PropTypes.func.isRequired,
};
