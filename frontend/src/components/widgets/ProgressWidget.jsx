import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../../services/api";
import { useAuth } from "../../providers/AuthProvider";
import DecoratedCard from "../DecoratedCard";
import { formatDate } from "./utils";

export default function ProgressWidget() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();

  const { data: completions = [], isLoading: isLoadingCompletions } = useQuery({
    queryKey: ["completions", "me"],
    queryFn: async () => {
      const { data } = await api.get("/completions/me");
      return data;
    },
    enabled: Boolean(profile),
  });

  return (
    <DecoratedCard
      title={t("dashboard.yourJourney")}
      icon={<i className="fas fa-bolt"></i>}
      shadow={true}
      className="h-100"
      bodyClassName="p-0 d-flex flex-column"
    >
      {isLoadingCompletions ? (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">{t("tasks.loading")}</span>
          </div>
        </div>
      ) : completions.length === 0 ? (
        <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center py-4">
          <div className="display-4 mb-3"><i className="fas fa-star text-warning"></i></div>
          <h5 className="text-muted">{t("dashboard.readyToShine")}</h5>
          <p className="small text-muted mb-0">{t("dashboard.startCompleting")}</p>
        </div>
      ) : (
        <div className="d-flex flex-column gap-3 flex-grow-1 justify-content-between">
          <div className="p-3 activity-feed" style={{ maxHeight: '400px', overflowY: 'auto' }}>
            {completions.slice(0, 5).map((entry) => (
              <div key={entry.id} className={`p-3 mb-1 rounded border-start border-4 dashboard-progress-row ${
                entry.status === 'approved' ? 'border-success bg-success bg-opacity-10' :
                entry.status === 'pending' ? 'border-warning bg-warning bg-opacity-10' :
                'border-danger bg-danger bg-opacity-10'
              }`}>
                <div className="d-flex justify-content-between align-items-start">
                  <div className="flex-grow-1">
                    <div className="fw-medium mb-1 d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center">
                        <span className="me-2">
                          {entry.status === 'approved' ? <i className="fas fa-check-circle text-success"></i> : entry.status === 'pending' ? <i className="fas fa-hourglass-half text-warning"></i> : <i className="fas fa-times-circle text-danger"></i>}
                        </span>
                        <span>{entry.task?.name || entry.task_id}</span>
                      </div>
                      <span className="badge bg-done">{entry.count}x</span>
                    </div>
                    <div className="small mb-1">
                      {entry.status === "pending" && (
                        <span className="text-warning fw-medium">
                          {t("dashboard.awaitingApproval")}
                        </span>
                      )}
                      {entry.status === "approved" && (
                        <span className="text-success fw-medium">
                          {t("dashboard.amazing", { points: entry.points_awarded })}
                        </span>
                      )}
                      {entry.status === "rejected" && (
                        <div className="text-danger">
                          <div className="fw-medium">{t("dashboard.rejected")}</div>
                          {entry.admin_note && (
                            <div className="small mt-1 text-muted">
                              {t("dashboard.reason")}: {entry.admin_note}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="small text-muted">{formatDate(entry.submitted_at, i18n.language)}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
          {completions.length > 5 && (
            <div className="p-3 text-center">
              <small className="text-muted">{t("dashboard.moreInHistory", { count: completions.length - 5 })}</small>
            </div>
          )}
        </div>
      )}
    </DecoratedCard>
  );
}
