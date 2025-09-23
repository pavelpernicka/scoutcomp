import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

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
          ? t("approvals.approvedMessage", "Completion approved")
          : t("approvals.rejectedMessage", "Completion rejected");
      setFeedback({ type: "success", message });
      queryClient.invalidateQueries({ queryKey: ["completions", "pending"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard", "members"] });
      queryClient.invalidateQueries({ queryKey: ["leaderboard", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["completions", "me"] });
      queryClient.invalidateQueries({ queryKey: ["tasks", "active"] });
      setReasonMap((prev) => ({ ...prev, [variables.id]: "" }));
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: extractErrorMessage(error, t("approvals.error", "Action failed.")) });
    },
  });

  const handleReview = (item, status) => {
    const reason = reasonMap[item.id]?.trim();
    if (status === "rejected" && !reason) {
      setFeedback({ type: "warning", message: t("approvals.reasonRequired", "Please provide a reason for rejection.") });
      return;
    }
    reviewMutation.mutate({ id: item.id, status, note: reason });
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">{t("approvals.loading", "Loading...")}</span>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-body text-white position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #28a745 0%, #20c997 100%)' }}>
              <div className="row align-items-center">
                <div className="col-md-8">
                  <div className="d-flex align-items-center mb-2">
                    <div>
                      <h1 className="mb-1">{t("approvals.title", "Task Approvals")}</h1>
                      <p className="mb-0 opacity-90 fs-5">
                        {t("approvals.subtitle", "Review and approve member task completions")}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="col-md-4 text-end">
                  <div className="badge bg-light text-success px-3 py-2 fs-4">
                    {pending.length} {t("approvals.pending", "pending")}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Information Panel */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="alert alert-info shadow-sm border-0">
            <h6 className="alert-heading mb-3">{t("approvals.infoTitle", "What users see:")}</h6>
            <div className="row g-3">
              <div className="col-md-4">
                <div className="d-flex align-items-start">
                  <div className="badge bg-warning text-dark me-2 mt-1">&nbsp;</div>
                  <div>
                    <strong>{t("approvals.pendingStatus", "Pending Review")}</strong>
                    <div className="text-muted small">{t("approvals.pendingDescription", "Task appears as 'Awaiting approval' in user's dashboard")}</div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="d-flex align-items-start">
                  <div className="badge bg-success me-2 mt-1">&nbsp;</div>
                  <div>
                    <strong>{t("approvals.approvedStatus", "Approved")}</strong>
                    <div className="text-muted small">{t("approvals.approvedDescription", "Points added to score, task marked as completed")}</div>
                  </div>
                </div>
              </div>
              <div className="col-md-4">
                <div className="d-flex align-items-start">
                  <div className="badge bg-danger me-2 mt-1">&nbsp;</div>
                  <div>
                    <strong>{t("approvals.rejectedStatus", "Rejected")}</strong>
                    <div className="text-muted small">{t("approvals.rejectedDescription", "User sees feedback and can resubmit")}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="row mb-4">
          <div className="col-12">
            <div className={`alert alert-${feedback.type} shadow-sm border-0`} role="alert">
              <div className="d-flex align-items-center">
                {feedback.message}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Approvals List */}
      {!pending.length ? (
        <div className="row">
          <div className="col-12">
            <div className="card shadow-lg border-0 p-3">
              <div className="card-body text-center py-5">
                <div className="display-1 text-muted mb-3">✅</div>
                <h4 className="text-muted mb-2">{t("approvals.empty", "All caught up!")}</h4>
                <p className="text-muted">{t("approvals.emptyDescription", "No task completions are waiting for review right now.")}</p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="row g-4">
          {pending.map((item) => (
            <div key={item.id} className="col-12">
              <div className="card shadow-lg border-0 p-3">
                <div className="card-header bg-light border-0">
                  <div className="row align-items-center">
                    <div className="col-md-8">
                      <h5 className="mb-1 fw-bold text-primary">{item.task?.name || `Task #${item.task_id}`}</h5>
                      <div className="d-flex align-items-center gap-3 text-muted">
                        <span>
                          <strong>{item.member?.username || `User #${item.member_id}`}</strong>
                          {item.member?.team_name && ` • ${item.member.team_name}`}
                        </span>
                        <span>•</span>
                        <span>{t("approvals.count", "Count")}: {item.count}</span>
                        <span>•</span>
                        <span>{new Date(item.submitted_at).toLocaleString()}</span>
                      </div>
                    </div>
                    <div className="col-md-4 text-md-end">
                      <span className="badge bg-warning text-dark px-3 py-2">
                        {t("approvals.awaitingReview", "Awaiting Review")}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="card-body">
                  <div className="row">
                    <div className="col-md-8">
                      <p className="text-muted mb-2">{t("approvals.memberNote", "Member's Note:")}</p>
                      <div className="bg-light p-3 rounded">
                        {item.member_note || <em className="text-muted">{t("approvals.noNote", "No note provided")}</em>}
                      </div>
                    </div>
                    <div className="col-md-4">
                      <p className="text-muted mb-2">{t("approvals.adminFeedback", "Admin Feedback:")}</p>
                      <textarea
                        className="form-control mb-3"
                        rows={3}
                        placeholder={t("approvals.feedbackPlaceholder", "Optional feedback (required for rejection)")}
                        value={reasonMap[item.id] || ""}
                        onChange={(event) =>
                          setReasonMap((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                      />
                      <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                        <button
                          type="button"
                          className="btn btn-success px-4"
                          disabled={reviewMutation.isLoading}
                          onClick={() => handleReview(item, "approved")}
                        >
                          {reviewMutation.isLoading ? t("approvals.processing", "Processing...") : t("approvals.approve", "Approve")}
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger px-4"
                          disabled={reviewMutation.isLoading}
                          onClick={() => handleReview(item, "rejected")}
                        >
                          {reviewMutation.isLoading ? t("approvals.processing", "Processing...") : t("approvals.reject", "Reject")}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
