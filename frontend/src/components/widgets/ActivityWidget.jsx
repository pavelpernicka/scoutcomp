import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../../services/api";
import { useAuth } from "../../providers/AuthProvider";
import DecoratedCard from "../DecoratedCard";
import { formatRelativeTime } from "./utils";

export default function ActivityWidget() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();

  const { data: teamActivity = { activities: [], stats: {} } } = useQuery({
    queryKey: ["leaderboard", "team-activity"],
    queryFn: async () => {
      const { data } = await api.get("/leaderboard/team-activity");
      return data;
    },
    enabled: Boolean(profile?.user?.team_id),
    staleTime: 60_000,
  });

  return (
    <DecoratedCard
      title={t("dashboard.teamActivity")}
      icon={<i className="fas fa-chart-line text-white"></i>}
      headerGradient="linear-gradient(45deg, #E91E63, #ff7f27)"
      rightContent={
        teamActivity.stats.team_name && (
          <span className="badge bg-white text-dark">{teamActivity.stats.team_name}</span>
        )
      }
      shadow={true}
      className="h-100"
      bodyClassName="p-0 d-flex flex-column justify-content-between"
    >
      {teamActivity.activities.length === 0 ? (
        <div className="flex-grow-1 d-flex align-items-center justify-content-center p-4">
          <div className="text-center py-4 text-muted">
            <div className="display-4 mb-3">🚀</div>
            <h5 className="text-muted">{t("dashboard.makeMagic")}</h5>
            <p className="small text-muted mb-0">{t("dashboard.completeTasksToSee")}</p>
          </div>
        </div>
      ) : (
        <div className="d-block">
          <div className="bg-light p-3 border-bottom">
            <div className="row text-center g-0">
              <div className="col-4">
                <div className="fw-bold text-primary fs-5">{teamActivity.stats.total_completions_this_week}</div>
                <div className="small text-muted">{t("dashboard.tasksDone")}</div>
              </div>
              <div className="col-4">
                <div className="fw-bold text-success fs-5">{teamActivity.stats.total_points_this_week.toFixed(0)}</div>
                <div className="small text-muted">{t("dashboard.pointsEarned")}</div>
              </div>
              <div className="col-4">
                <div className="fw-bold text-warning fs-5">{teamActivity.stats.active_members}</div>
                <div className="small text-muted">{t("dashboard.activeHeroes")}</div>
              </div>
            </div>
          </div>

          <div className="d-block activity-feed" style={{ maxHeight: '380px', overflowY: 'auto' }}>
            {teamActivity.activities.slice(0, 8).map((activity) => (
              <div key={activity.id} className={`p-3 border-bottom ${activity.is_current_user ? 'bg-primary bg-opacity-10' : ''}`}>
                <div className="d-block align-items-start gap-2">
                  <div className="flex-shrink-0">
                    {activity.is_current_user ? (
                      <span className="badge bg-primary rounded-pill">{t("common.you")}</span>
                    ) : (
                      <div className="bg-secondary rounded-circle d-flex align-items-center justify-content-center" style={{ width: '28px', height: '28px', fontSize: '12px', color: 'white' }}>
                        {activity.member_name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <div className="flex-grow-1 min-w-0">
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="min-w-0">
                        <div className="fw-medium mb-1">
                          {activity.is_current_user ? (
                            <span className="text-primary">{t("dashboard.youCompleted")}</span>
                          ) : (
                            <span><strong>{activity.member_name}</strong> {t("dashboard.completed")}</span>
                          )} <span className="text-dark">{activity.task_name}</span>
                          {activity.count > 1 && (
                            <span className="badge bg-done ms-2">{activity.count}x</span>
                          )}
                        </div>
                        <div className="small text-muted">
                          {activity.submitted_at ? formatRelativeTime(activity.submitted_at, i18n.language, t) : activity.time_ago}
                        </div>
                      </div>
                      <div className="text-end flex-shrink-0">
                        <div className="fw-bold text-success">+{activity.points.toFixed(0)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {teamActivity.activities.length > 8 && (
            <div className="p-3 text-center">
              <small className="text-muted">{t("dashboard.moreAchievements", { count: teamActivity.activities.length - 8 })}</small>
            </div>
          )}
        </div>
      )}
    </DecoratedCard>
  );
}
