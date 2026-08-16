import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../../../services/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import { formatDateToLocal } from "../../../utils/dateUtils";

export default function WebAdminTrash() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";

  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const { data: pages = [], isLoading } = useQuery({
    queryKey: ["web", "trash"],
    queryFn: async () => {
      const { data } = await api.get("/web/pages/trash");
      return data;
    },
    staleTime: 15_000,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["web", "trash"] });
    queryClient.invalidateQueries({ queryKey: ["web", "pages"] });
  };

  const restoreMutation = useMutation({
    mutationFn: async (pageId) => {
      await api.post(`/web/pages/${pageId}/restore`);
      return pageId;
    },
    onSuccess: () => {
      invalidate();
      setFeedback({ type: "success", message: t("web.restoreSuccess") });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("web.restoreFailed"),
      });
    },
  });

  const purgeMutation = useMutation({
    mutationFn: async (pageId) => {
      await api.delete(`/web/pages/${pageId}/purge`);
      return pageId;
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

  const handlePurge = (page) => {
    if (window.confirm(t("web.confirmPurge", { title: page.title }))) {
      purgeMutation.mutate(page.id);
    }
  };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div>
          <h1 className="h3 mb-0">{t("web.trashTitle")}</h1>
          <p className="text-muted mb-0 small">{t("web.trashSubtitle")}</p>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} py-2`}>{feedback.message}</div>
      )}

      {isLoading ? (
        <LoadingSpinner />
      ) : pages.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-trash-can fs-1 mb-3 d-block opacity-25"></i>
          {t("web.trashEmpty")}
        </div>
      ) : (
        <div className="card shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>{t("web.title")}</th>
                  <th>{t("web.slug")}</th>
                  <th>{t("web.template")}</th>
                  <th>{t("web.deletedAt")}</th>
                  <th className="text-end">{t("web.actions")}</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td className="fw-semibold">{page.title}</td>
                    <td>
                      <code>{page.slug}</code>
                    </td>
                    <td>{page.template || "—"}</td>
                    <td className="small text-muted">
                      {page.deleted_at ? formatDateToLocal(page.deleted_at, locale) : "—"}
                    </td>
                    <td className="text-end">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-success me-1"
                        title={t("web.restore")}
                        onClick={() => restoreMutation.mutate(page.id)}
                        disabled={restoreMutation.isPending}
                      >
                        <i className="fas fa-rotate-left"></i>
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger"
                        title={t("web.purge")}
                        onClick={() => handlePurge(page)}
                        disabled={purgeMutation.isPending}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
