import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import HeroHeader from "../components/HeroHeader";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import DecoratedCard from "../components/DecoratedCard";
import Textarea from "../components/Textarea";

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
    <>
      <HeroHeader
        title={t("approvals.title")}
        subtitle={t("approvals.subtitle")}
        icon="🔍"
        gradient="linear-gradient(135deg, #28a745 0%, #20c997 100%)"
      >
        <div className="badge bg-light text-success px-3 py-2 fs-4">
          {pending.length} {t("approvals.pending")}
        </div>
      </HeroHeader>

      {/* Information Panel */}
      <Alert type="info" className="shadow-sm border-0 mb-4" icon={<></>}>
        <h6 className="alert-heading mb-3">{t("approvals.infoTitle")}</h6>
        <div className="row g-3">
          <div className="col-md-4">
            <div className="d-flex align-items-start">
              <div className="badge bg-warning text-dark me-2 mt-1">&nbsp;</div>
              <div>
                <strong>{t("approvals.pendingStatus")}</strong>
                <div className="text-muted small">{t("approvals.pendingDescription")}</div>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="d-flex align-items-start">
              <div className="badge bg-success me-2 mt-1">&nbsp;</div>
              <div>
                <strong>{t("approvals.approvedStatus")}</strong>
                <div className="text-muted small">{t("approvals.approvedDescription")}</div>
              </div>
            </div>
          </div>
          <div className="col-md-4">
            <div className="d-flex align-items-start">
              <div className="badge bg-danger me-2 mt-1">&nbsp;</div>
              <div>
                <strong>{t("approvals.rejectedStatus")}</strong>
                <div className="text-muted small">{t("approvals.rejectedDescription")}</div>
              </div>
            </div>
          </div>
        </div>
      </Alert>

      {/* Feedback */}
      {feedback && (
        <Alert type={feedback.type} className="shadow-sm border-0 mb-4" icon={<></>}>
          {feedback.message}
        </Alert>
      )}

      {/* Approvals List */}
      {!pending.length ? (
        <DecoratedCard
          title={t("approvals.empty")}
          subtitle={t("approvals.emptyDescription")}
          icon={<i className="fas fa-check-circle text-success"></i>}
          shadow={true}
          bodyClassName="text-center py-5"
        />
      ) : (
        <div className="d-flex flex-column gap-4">
          {pending.map((item) => (
              <DecoratedCard
                key={item.id}
                title={item.task?.name || `Task #${item.task_id}`}
                subtitle={`${item.member?.real_name || item.member?.username || `User #${item.member_id}`}${item.member?.team_name ? ` • ${item.member.team_name}` : ''} • ${t("approvals.count")}: ${item.count}${item.variant ? ` • Variant: ${item.variant.name} (${item.variant.points} pts)` : ''} • ${new Date(item.submitted_at).toLocaleString()}`}
                icon="📝"
                headerGradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
                shadow={true}
                className="m-2"
                rightBadge={t("approvals.awaitingReview")}
              >
                  <div className="row">
                    <div className="col-md-8">
                      {/* Variant Information */}
                      {item.variant && (
                        <div className="mb-3">
                          <p className="text-muted mb-2">Selected Variant:</p>
                          <div className="bg-info bg-opacity-10 p-3 rounded border border-info border-opacity-25">
                            <div className="d-flex align-items-center justify-content-between">
                              <div>
                                <strong className="text-info">{item.variant.name}</strong>
                                <div className="small text-muted">{item.variant.description || 'No description'}</div>
                              </div>
                              <span className="badge bg-info">{item.variant.points} pts</span>
                            </div>
                          </div>
                        </div>
                      )}

                      <p className="text-muted mb-2">{t("approvals.memberNote")}</p>
                      <div className="bg-light p-3 rounded border">
                        {item.member_note || <em className="text-muted">{t("approvals.noNote")}</em>}
                      </div>
                    </div>
                    <div className="col-md-4">
                      <p className="text-muted mb-2">{t("approvals.adminFeedback")}</p>
                      <Textarea
                        className="mb-3"
                        rows={3}
                        placeholder={t("approvals.feedbackPlaceholder")}
                        value={reasonMap[item.id] || ""}
                        onChange={(event) =>
                          setReasonMap((prev) => ({ ...prev, [item.id]: event.target.value }))
                        }
                      />
                      <div className="d-grid gap-2 d-md-flex justify-content-md-end">
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
              </DecoratedCard>
          ))}
        </div>
      )}
    </>
  );
}
