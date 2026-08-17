import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { formatDateToLocal } from "../utils/dateUtils";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import Textarea from "../components/Textarea";
import AdminPageHeader from "../modules/web/admin/AdminPageHeader";

const extractErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (!detail) {
    return fallback;
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        const location = Array.isArray(item.loc)
          ? item.loc.filter((part) => part !== "body").join(".")
          : "";
        const message = item.msg || JSON.stringify(item);
        return location ? `${location}: ${message}` : message;
      })
      .filter(Boolean)
      .join("\n");
  }
  if (detail.msg) {
    return detail.msg;
  }
  return typeof detail === "object" ? JSON.stringify(detail) : fallback;
};

export default function AdminApprovals() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { canReviewCompletions } = useAuth();
  const [reasonMap, setReasonMap] = useState({});
  const [feedback, setFeedback] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const { data: pending = [], isLoading } = useQuery({
    queryKey: ["completions", "pending"],
    queryFn: async () => {
      const { data } = await api.get("/completions/pending");
      return data;
    },
    enabled: canReviewCompletions,
  });

  const reviewMutation = useMutation({
    mutationFn: async ({ id, status, note }) =>
      api.patch(`/completions/${id}`, {
        status,
        admin_note: note || undefined,
      }),
    onSuccess: (_, variables) => {
      const message =
        variables.status === "approved"
          ? t("approvals.approvedMessage")
          : t("approvals.rejectedMessage");
      setFeedback({ type: "success", message });
      queryClient.invalidateQueries({ queryKey: ["completions", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard", "members"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["completions", "me"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "active"] });
      setReasonMap((prev) => ({ ...prev, [variables.id]: "" }));
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: extractErrorMessage(error, t("approvals.error")) });
    },
  });

  const handleReview = (item, status) => {
    const reason = reasonMap[item.id]?.trim();
    if (status === "rejected" && !reason) {
      setFeedback({ type: "warning", message: t("approvals.reasonRequired") });
      return;
    }
    reviewMutation.mutate({ id: item.id, status, note: reason });
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
        <LoadingSpinner text={t("approvals.loading")} />
      </div>
    );
  }

  return (
    <div className="admin-approvals-page">
      <AdminPageHeader
        title={t("approvals.title")}
        description={t("approvals.subtitle")}
        action={(
          <div className="admin-approvals-pending-count">
          {pending.length} {t("approvals.pending")}
          </div>
        )}
      />

      <section className="admin-approvals-guide" aria-labelledby="approvals-guide-heading">
        <h2 id="approvals-guide-heading">{t("approvals.infoTitle")}</h2>
        <div className="admin-approvals-guide__items">
          <div className="admin-approvals-guide__item">
            <span className="admin-approvals-guide__marker admin-approvals-guide__marker--pending" aria-hidden="true" />
            <div>
              <strong>{t("approvals.pendingStatus")}</strong>
              <p>{t("approvals.pendingDescription")}</p>
            </div>
          </div>
          <div className="admin-approvals-guide__item">
            <span className="admin-approvals-guide__marker admin-approvals-guide__marker--approved" aria-hidden="true" />
            <div>
              <strong>{t("approvals.approvedStatus")}</strong>
              <p>{t("approvals.approvedDescription")}</p>
            </div>
          </div>
          <div className="admin-approvals-guide__item">
            <span className="admin-approvals-guide__marker admin-approvals-guide__marker--rejected" aria-hidden="true" />
            <div>
              <strong>{t("approvals.rejectedStatus")}</strong>
              <p>{t("approvals.rejectedDescription")}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Feedback */}
      {feedback && (
        <Alert type={feedback.type} toast onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      {/* Approvals List */}
      {!pending.length ? (
        <div className="admin-approvals-empty">
          <i className="fas fa-check-circle" aria-hidden="true" />
          <h2>{t("approvals.empty")}</h2>
          <p>{t("approvals.emptyDescription")}</p>
        </div>
      ) : (
        <div className="admin-approval-list">
          {pending.map((item) => (
              <article key={item.id} className="card admin-approval-card">
                <header className="admin-approval-card__header">
                  <div>
                    <h2>{item.task?.name || `Task #${item.task_id}`}</h2>
                    <p>{`${item.member?.real_name || item.member?.username || `User #${item.member_id}`}${item.member?.team_name ? ` · ${item.member.team_name}` : ""} · ${t("approvals.count")}: ${item.count}${item.variant ? ` · ${item.variant.name} (${item.variant.points} pts)` : ""} · ${formatDateToLocal(item.submitted_at)}`}</p>
                  </div>
                  <span className="admin-approval-card__status">{t("approvals.awaitingReview")}</span>
                </header>
                <div className="admin-approval-card__body">
                  <div className="admin-approval-card__submission">
                      {item.variant && (
                          <div className="admin-approval-variant">
                            <div className="d-flex align-items-center justify-content-between">
                              <div>
                                <strong>{item.variant.name}</strong>
                                {item.variant.description && <div>{item.variant.description}</div>}
                              </div>
                              <span>{item.variant.points} pts</span>
                            </div>
                          </div>
                      )}

                      <h3>{t("approvals.memberNote")}</h3>
                      <div className="admin-approval-note">
                        {item.member_note || <em className="text-muted">{t("approvals.noNote")}</em>}
                      </div>
                  </div>
                  <div className="admin-approval-card__review">
                      <label htmlFor={`approval-note-${item.id}`}>{t("approvals.adminFeedback")}</label>
                      <Textarea
                        id={`approval-note-${item.id}`}
                        className="mb-3"
                        rows={3}
                        placeholder={t("approvals.feedbackPlaceholder")}
                        value={reasonMap[item.id] || ""}
                        onChange={(event) =>
                          setReasonMap((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                      />
                      <div className="admin-approval-card__actions">
                        <Button
                          variant="success"
                          className="px-4"
                          disabled={reviewMutation.isLoading}
                          loading={reviewMutation.isLoading}
                          onClick={() => handleReview(item, "approved")}
                        >
                          {reviewMutation.isLoading ? t("approvals.processing") : t("approvals.approve")}
                        </Button>
                        <Button
                          variant="danger"
                          className="px-4"
                          disabled={reviewMutation.isLoading}
                          loading={reviewMutation.isLoading}
                          onClick={() => handleReview(item, "rejected")}
                        >
                          {reviewMutation.isLoading ? t("approvals.processing") : t("approvals.reject")}
                        </Button>
                      </div>
                  </div>
                </div>
              </article>
          ))}
        </div>
      )}
    </div>
  );
}
