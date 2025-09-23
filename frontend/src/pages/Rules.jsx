import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { marked } from "marked";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

marked.setOptions({ breaks: true });

const renderMarkdown = (markdown) => ({
  __html: DOMPurify.sanitize(marked.parse(markdown || "")),
});

export default function RulesPage() {
  const { t } = useTranslation();
  const { isAdmin } = useAuth();
  const queryClient = useQueryClient();

  const [feedback, setFeedback] = useState(null);
  const [draft, setDraft] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const { data: page, isLoading } = useQuery({
    queryKey: ["pages", "rules"],
    queryFn: async () => {
      const { data } = await api.get("/pages/rules");
      return data;
    },
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!page) return;
    setDraft(page.content || "");
  }, [page]);

  const updateMutation = useMutation({
    mutationFn: async (content) => {
      const { data } = await api.put("/pages/rules", { content });
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["pages", "rules"], data);
      setFeedback({ type: "success", message: t("rules.updated", "Rules updated.") });
      setIsEditing(false);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("rules.updateFailed", "Failed to update rules."),
      });
    },
  });

  const hasChanges = useMemo(() => {
    if (!page) {
      return Boolean(draft);
    }
    return draft !== (page.content || "");
  }, [draft, page]);

  const updatedAtLabel = useMemo(() => {
    if (!page?.updated_at) return null;
    return new Date(page.updated_at).toLocaleString();
  }, [page?.updated_at]);

  const handleSave = () => {
    if (!hasChanges || updateMutation.isLoading) {
      return;
    }
    updateMutation.mutate(draft);
  };

  const handleCancel = () => {
    setDraft(page?.content || "");
    setIsEditing(false);
  };

  if (isLoading || !page) {
    return <div className="text-center text-muted py-5">{t("rules.loading", "Loading rules…")}</div>;
  }

  return (
    <>
      {/* Enthusiastic Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-body text-white position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <div className="row align-items-center">
                <div className="col-md-8">
                  <div className="d-flex align-items-center mb-2">
                    <span className="fs-1 me-3">📋</span>
                    <div>
                      <h1 className="mb-1">{t("rules.title", "Quest Guidelines & Rules")}</h1>
                      <p className="mb-0 opacity-90 fs-5">
                        {t("rules.subtitle", "Your essential guide to fair play and adventure!")}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="col-md-4 text-end">
                  <div className="display-2">⚖️</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="px-0">
        {feedback && (
          <div className={`alert alert-${feedback.type} shadow-sm border-0`} role="alert">
            <div className="d-flex align-items-center">
              <span className="me-2">
                {feedback.type === 'success' ? '✅' : feedback.type === 'danger' ? '⚠️' : 'ℹ️'}
              </span>
              {feedback.message}
            </div>
          </div>
        )}

        <div className="card shadow-lg border-0">
          <div className="card-header bg-light d-flex justify-content-between align-items-center border-0" style={{ borderRadius: '0.5rem 0.5rem 0 0' }}>
            <div className="d-flex align-items-center">
              <span className="me-2">📜</span>
              <strong>{t("rules.officialRules", "Official Rules")}</strong>
            </div>
            {isAdmin && (
              <div className="d-flex align-items-center gap-2">
                {isEditing && hasChanges && (
                  <span className="badge text-dark px-3 py-2 d-flex align-items-center" style={{ backgroundColor: '#ffc107' }}>
                    <span className="me-1">⚠️</span>
                    {t("rules.unsavedChanges", "Unsaved changes")}
                  </span>
                )}
                {isEditing ? (
                  <>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm px-3"
                      onClick={handleCancel}
                      disabled={updateMutation.isLoading}
                    >
                      <span className="me-1">↩️</span>
                      {t("common.cancel", "Cancel")}
                    </button>
                    <button
                      type="button"
                      className="btn btn-success btn-sm px-3"
                      onClick={handleSave}
                      disabled={!hasChanges || updateMutation.isLoading}
                    >
                      <span className="me-1">💾</span>
                      {updateMutation.isLoading ? t("rules.saving", "Saving...") : t("rules.save", "Save")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm px-3"
                    onClick={() => setIsEditing(true)}
                  >
                    <span className="me-1">✏️</span>
                    {t("rules.editRules", "Edit Rules")}
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="card-body p-4">
            {updatedAtLabel && (
              <div className="bg-light rounded p-2 mb-4 d-flex align-items-center">
                <span className="me-2">🕒</span>
                <small className="text-muted">{t("rules.lastUpdated", "Last updated")} {updatedAtLabel}</small>
              </div>
            )}

            {isAdmin && isEditing ? (
              <div className="row g-4">
                <div className="col-12 col-xl-6">
                  <div className="mb-3">
                    <label className="form-label fw-bold d-flex align-items-center">
                      <span className="me-2">📝</span>
                      {t("rules.markdownContent", "Markdown Content")}
                    </label>
                    <textarea
                      className="form-control border-2"
                      rows={18}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      disabled={updateMutation.isLoading}
                      placeholder={t("rules.markdownPlaceholder", "Enter your rules in Markdown format...")}
                      style={{ fontFamily: 'Monaco, Consolas, monospace', fontSize: '0.9rem' }}
                    ></textarea>
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <div className="mb-3">
                    <label className="form-label fw-bold d-flex align-items-center">
                      <span className="me-2">👁️</span>
                      {t("rules.livePreview", "Live Preview")}
                    </label>
                    <div
                      className="border-2 border-info rounded p-4 bg-light markdown-preview"
                      style={{ minHeight: '400px', maxHeight: '500px', overflowY: 'auto' }}
                      dangerouslySetInnerHTML={renderMarkdown(draft)}
                    />
                  </div>
                </div>
              </div>
            ) : page.content ? (
              <div className="bg-white rounded-3 p-4 border border-light">
                <div className="markdown-preview" dangerouslySetInnerHTML={renderMarkdown(page.content)} />
              </div>
            ) : (
              <div className="text-center py-5">
                <div className="display-1 mb-3">📝</div>
                <h3 className="text-muted mb-2">{t("rules.comingSoon", "Rules Coming Soon!")}</h3>
                <p className="text-muted mb-0">{t("rules.comingSoonMessage", "The official quest rules are being prepared and will be available here soon.")}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
