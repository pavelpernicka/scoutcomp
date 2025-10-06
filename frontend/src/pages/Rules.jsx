import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { marked } from "marked";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { formatDateToLocal } from "../utils/dateUtils";
import HeroHeader from "../components/HeroHeader";
import Button from "../components/Button";
import Alert from "../components/Alert";
import LoadingSpinner from "../components/LoadingSpinner";
import DecoratedCard from "../components/DecoratedCard";
import Textarea from "../components/Textarea";

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
      setFeedback({ type: "success", message: t("rules.updated") });
      setIsEditing(false);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("rules.updateFailed"),
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
    return formatDateToLocal(page.updated_at);
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
    return <LoadingSpinner className="py-5" text={t("rules.loading")} centered />;
  }

  return (
    <>
      <HeroHeader
        title={t("rules.title")}
        subtitle={t("rules.subtitle")}
        icon="📋"
      >
      </HeroHeader>

      <div className="px-0">
        {feedback && (
          <Alert type={feedback.type} className="shadow-sm border-0 mb-4">
            {feedback.message}
          </Alert>
        )}

        <DecoratedCard
          title={t("rules.officialRules")}
          icon="📜"
          headerGradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
          shadow={true}
          rightContent={isAdmin && (
            <div className="d-flex align-items-center gap-2">
              {isEditing && hasChanges && (
                <span className="badge text-dark px-3 py-2 d-flex align-items-center" style={{ backgroundColor: '#ffc107' }}>
                  <i className="fas fa-exclamation-triangle me-1"></i>
                  {t("rules.unsavedChanges")}
                </span>
              )}
              {isEditing ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="px-3"
                    onClick={handleCancel}
                    disabled={updateMutation.isLoading}
                    icon="fas fa-undo"
                    iconPosition="left"
                  >
                    {t("common.cancel")}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    className="px-3"
                    onClick={handleSave}
                    disabled={!hasChanges || updateMutation.isLoading}
                    loading={updateMutation.isLoading}
                    icon="fas fa-save"
                    iconPosition="left"
                  >
                    {updateMutation.isLoading ? t("common.saving") : t("common.save")}
                  </Button>
                </>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  className="px-3"
                  onClick={() => setIsEditing(true)}
                  icon="fas fa-edit"
                  iconPosition="left"
                >
                  {t("rules.editRules")}
                </Button>
              )}
            </div>
          )}
        >
            {updatedAtLabel && (
              <div className="bg-light rounded p-2 mb-4 d-flex align-items-center">
                <i className="fas fa-clock text-muted me-2"></i>
                <small className="text-muted">{t("common.lastUpdated")} {updatedAtLabel}</small>
              </div>
            )}

            {isAdmin && isEditing ? (
              <div className="row g-4">
                <div className="col-12 col-xl-6">
                  <div className="mb-3">
                    <label className="form-label fw-bold d-flex align-items-center">
                      <span className="me-2">📝</span>
                      {t("rules.markdownContent")}
                    </label>
                    <Textarea
                      className="border-2"
                      rows={18}
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      disabled={updateMutation.isLoading}
                      placeholder={t("rules.markdownPlaceholder")}
                      style={{ fontFamily: 'Monaco, Consolas, monospace', fontSize: '0.9rem' }}
                    />
                  </div>
                </div>
                <div className="col-12 col-xl-6">
                  <div className="mb-3">
                    <label className="form-label fw-bold d-flex align-items-center">
                      <i className="fas fa-eye text-secondary me-2"></i>
                      {t("rules.livePreview")}
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
                <h3 className="text-muted mb-2">{t("rules.comingSoon")}</h3>
                <p className="text-muted mb-0">{t("rules.comingSoonMessage")}</p>
              </div>
            )}
        </DecoratedCard>
      </div>
    </>
  );
}
