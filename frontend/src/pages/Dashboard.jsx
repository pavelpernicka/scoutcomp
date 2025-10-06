import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import TaskCompletionDetailsModal from "../components/TaskCompletionDetailsModal";
import LoadingSpinner from "../components/LoadingSpinner";
import Card from "../components/Card";
import DecoratedCard from "../components/DecoratedCard";

const formatDate = (value, language = 'en') => {
  const locale = language === 'cs' ? 'cs-CZ' : 'en-US';
  return new Date(value).toLocaleString(locale);
};

const formatRelativeTime = (value, language = 'en', t) => {
  const date = new Date(value);
  const now = new Date();
  const diffInMs = now - date;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) {
    return t('dashboard.timeAgo.justNow');
  } else if (diffInMinutes < 60) {
    return t('dashboard.timeAgo.minutesAgo', { count: diffInMinutes });
  } else if (diffInHours < 24) {
    return t('dashboard.timeAgo.hoursAgo', { count: diffInHours });
  } else if (diffInDays < 7) {
    return t('dashboard.timeAgo.daysAgo', { count: diffInDays });
  } else {
    // For longer periods, show the actual date
    return formatDate(value, language);
  }
};

export default function Dashboard() {
  const { profile, isLoading } = useAuth();
  const { t, i18n } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  const { data: completions = [], isLoading: isLoadingCompletions } = useQuery({
    queryKey: ["completions", "me"],
    queryFn: async () => {
      const { data } = await api.get("/completions/me");
      return data;
    },
    enabled: Boolean(profile),
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get("/notifications");
      return data;
    },
    enabled: Boolean(profile),
    staleTime: 30_000,
  });

  const { data: dashboardMessages = [] } = useQuery({
    queryKey: ["dashboard", "messages"],
    queryFn: async () => {
      const { data } = await api.get("/dashboard-messages");
      return data;
    },
    enabled: Boolean(profile),
    staleTime: 30_000,
  });

  const { data: teamMembers = [] } = useQuery({
    queryKey: ["leaderboard", "team-members"],
    queryFn: async () => {
      const { data } = await api.get("/leaderboard/team-members");
      return data;
    },
    enabled: Boolean(profile?.user?.team_id),
    staleTime: 30_000,
  });

  const { data: userTaskDetails, isLoading: isLoadingDetails } = useQuery({
    queryKey: ["leaderboard", "user-task-details", selectedUserId],
    queryFn: async () => {
      const { data } = await api.get(`/leaderboard/user/${selectedUserId}/task-completions`);
      return data;
    },
    enabled: Boolean(selectedUserId),
    staleTime: 30_000,
  });

  const { data: teamActivity = { activities: [], stats: {} } } = useQuery({
    queryKey: ["leaderboard", "team-activity"],
    queryFn: async () => {
      const { data } = await api.get("/leaderboard/team-activity");
      return data;
    },
    enabled: Boolean(profile?.user?.team_id),
    staleTime: 60_000,
  });

  const handleShowDetails = (userId) => {
    setSelectedUserId(userId);
    setShowDetailsModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailsModal(false);
    setSelectedUserId(null);
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
        <LoadingSpinner text={t("tasks.loading")} />
      </div>
    );
  }

  const totalPoints = profile?.scoreboard?.total_points ?? 0;
  const memberRank = profile?.scoreboard?.member_rank ?? "–";
  const teamRank = profile?.scoreboard?.team_rank ?? "–";

  return (
    <div className="row g-4">
      {/* Welcome box */}
      <div className="col-12">
        <Card className="shadow-lg border-0" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
          <div className="card-body text-white p-4">
            <div className="row align-items-center">
              <div className="col-md-8">
                <div className="d-flex align-items-center mb-2">
                  <span className="fs-1 me-3">👋</span>
                  <div>
                    <h3 className="mb-1 fw-bold text-white h2">{t("dashboard.welcome", { username: profile?.user?.real_name || profile?.user?.username })}</h3>
                    {profile?.user?.team_name && (
                      <p className="mb-0 opacity-90">
                        {t("dashboard.teamPride", { teamName: profile.user.team_name })}
                      </p>
                    )}
                    {!profile?.user?.team_name && profile?.user?.team_id === null && (
                      <p className="mb-0 opacity-90">
                        {t("dashboard.welcomeNoGroup")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="row g-3 mt-2">
                  <div className="col-6 col-lg-3">
                    <div className="text-center bg-white text-black bg-opacity-20 rounded p-2">
                      <div className="fs-5 fw-bold">{totalPoints}</div>
                      <small className="opacity-90">{t("dashboard.totalPoints")}</small>
                    </div>
                  </div>
                  {memberRank !== "–" && (
                    <div className="col-6 col-lg-3">
                      <div className="text-center bg-white text-black bg-opacity-20 rounded p-2">
                        <div className="fs-5 fw-bold">#{memberRank}</div>
                        <small className="opacity-90">{t("dashboard.yourRank")}</small>
                      </div>
                    </div>
                  )}
                  {teamRank !== "–" && (
                    <div className="col-6 col-lg-3">
                      <div className="text-center bg-white text-black bg-opacity-20 rounded p-2">
                        <div className="fs-5 fw-bold">#{teamRank}</div>
                        <small className="opacity-90">{t("dashboard.teamRank")}</small>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Future: badge */}
              <div className="col-md-4 text-end d-none">
                <div className="display-1" style={{ fontSize: '4rem' }}><i className="fas fa-star text-warning"></i></div>
                {totalPoints > 0 && (
                  <div className="mt-2">
                    <span className="badge bg-warning text-dark px-3 py-2 fs-6">
                      Badge name
                    </span>
                  </div>
                )}
              </div>
              {/* End of badge */}
            </div>
          </div>
        </Card>
      </div>

      {dashboardMessages.length > 0 && (
        <div className="col-12">
          <DecoratedCard
            title={t("dashboard.announcements")}
            subtitle={t("dashboard.stayInformed")}
            icon={<span className="flip_vert fs-2">📢</span>}
            headerGradient="linear-gradient(135deg, #4834d4 0%, #686de0 100%)"
            shadow={true}
            border={false}
            bodyClassName="p-0"
          >
            <div className="d-flex flex-column">
                {dashboardMessages.map((message, index) => (
                  <div key={message.id} className={`p-4 ${index !== dashboardMessages.length - 1 ? 'border-bottom' : ''} position-relative overflow-hidden`} style={{ background: index % 2 === 0 ? '#f8f9fa' : 'white' }}>
                    <div className="position-absolute start-0 top-0 bottom-0 bg-primary" style={{ width: '4px' }}></div>
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <div className="d-flex align-items-center gap-2">
                        <h5 className="mb-0 text-dark display-6">{message.title || t("dashboard.infoTitle")}</h5>
                      </div>
                      <div className="text-end">
                        <small className="text-muted d-flex align-items-center gap-1">
                          <i className="fas fa-clock text-muted"></i>
                          {formatDate(message.created_at, i18n.language)}
                        </small>
                      </div>
                    </div>
                    <div className="AnnText">
                      <p className="mb-2 text-dark lead" style={{ lineHeight: '1.6' }}>{message.body}</p>
                      <span className="badge bg-primary px-2 py-2">
                        {message.team_name || t("dashboard.allTeams")}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
          </DecoratedCard>
        </div>
      )}

      <div className="col-12 col-xl-4">
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
          style={{ minHeight: '500px' }}
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
                {/* Week stats banner */}
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

                {/* Activity feed */}
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
      </div>

      <div className="col-12 col-xl-4">
        <DecoratedCard
          title={t("dashboard.notifications")}
          icon={<i className="fas fa-envelope text-white"></i>}
          headerGradient="linear-gradient(45deg, #E91E63, #ff7f27)"
          shadow={true}
          className="h-100"
          style={{ minHeight: '500px' }}
          bodyClassName="d-flex flex-column p-0 justify-content-between"
        >
            {notifications.length === 0 ? (
              <div className="flex-grow-1 d-flex align-items-center justify-content-center p-4">
                <div className="text-center">
                  <div className="display-4 mb-3"><i className="fas fa-inbox text-muted"></i></div>
                  <h5 className="text-muted">{t("dashboard.noMessagesYet")}</h5>
                  <p className="small text-muted mb-0">{t("dashboard.messagesWillAppear")}</p>
                </div>
              </div>
            ) : (
              <div className="d-block">
                <div className="p-3 bg-light border-bottom">
                  <div className="d-flex align-items-center justify-content-between">
                    <span className="fw-medium text-dark">{t("dashboard.recentMessages")}</span>
                    <span className="badge bg-primary">{notifications.length}</span>
                  </div>
                </div>
                <div className="flex-grow-1" style={{ maxHeight: '350px', overflowY: 'auto' }}>
                  <div className="list-group list-group-flush">
                    {notifications.map((notification, index) => (
                      <div key={notification.id} className={`list-group-item list-group-item-action border-0 ${index % 2 === 0 ? 'bg-light' : ''}`}>
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div className="d-flex align-items-center gap-2">
                            <div className="bg-primary rounded-circle d-flex align-items-center justify-content-center" style={{ width: '32px', height: '32px', fontSize: '14px', color: 'white' }}>
                              {notification.sender_real_name || notification.sender_username ?
                                (notification.sender_real_name || notification.sender_username).charAt(0).toUpperCase() :
                                <i className="fas fa-cog text-secondary"></i>
                              }
                            </div>
                            <div>
                              <span className="fw-semibold text-dark">
                                {notification.sender_real_name || notification.sender_username || t("dashboard.system")}
                              </span>
                              <div className="small text-muted">
                                {formatDate(notification.created_at, i18n.language)}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="ms-5">
                          <p className="mb-0 text-dark" style={{ lineHeight: '1.5' }}>
                            {notification.message}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {notifications.length > 10 && (
                   <div className="p-3 text-center">
                    <small className="text-muted">
                      <i className="fas fa-envelope me-2 text-primary"></i>{t("dashboard.scrollForMore", { count: notifications.length })}
                    </small>
                  </div>
                )}
              </div>
            )}
        </DecoratedCard>
      </div>

      <div className="col-12 col-xl-4">
        <DecoratedCard
          title={t("dashboard.yourJourney")}
          icon={<i className="fas fa-bolt text-white"></i>}
          headerGradient="linear-gradient(45deg, #E91E63, #ff7f27)"
          headerClassName="text-black"
          shadow={true}
          className="h-100"
          style={{ minHeight: '500px' }}
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
                  <div key={entry.id} className={`p-3 mb-1 rounded border-start border-4 ${
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
      </div>

      {profile?.user?.team_id && teamMembers.length > 0 && (
        <div className="col-12">
          <DecoratedCard
            title={t("dashboard.teamChampions")}
            subtitle={profile.user.team_name}
            icon="🏆"
            rightBadge={`${teamMembers.length} ${t("dashboard.heroes")}`}
            shadow={true}
            border={false}
            bodyClassName="p-0"
          >
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="bg-light">
                    <tr>
                      <th className="py-3 text-center">{t("dashboard.rank")}</th>
                      <th className="py-3">{t("dashboard.champion")}</th>
                      <th className="py-3 text-end">{t("dashboard.victories")}</th>
                      <th className="py-3 text-end">{t("dashboard.glory")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr key={member.entity_id} className={`${member.entity_id === profile.user.id ? "table-primary" : ""} ${member.rank <= 3 ? "fw-bold" : ""}`}>
                        <td className="py-3">
                          <div className="d-flex align-items-center justify-content-center">
                            {member.rank === 1 && <i className="fas fa-trophy fs-4 text-warning"></i>}
                            {member.rank === 2 && <i className="fas fa-medal fs-4 text-secondary"></i>}
                            {member.rank === 3 && <i className="fas fa-medal fs-4" style={{color: '#cd7f32'}}></i>}
                            {member.rank > 3 && <span className="font-weight-bold">#{member.rank}</span>}
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="d-flex align-items-center gap-2">
                            <button
                              type="button"
                              className="btn btn-link p-0 text-start fw-medium text-decoration-none"
                              onClick={() => handleShowDetails(member.entity_id, member.name)}
                              title={t("dashboard.seeDetails")}
                            >
                              {member.name}
                            </button>
                            {member.entity_id === profile.user.id && (
                              <span className="badge bg-primary rounded-pill px-2 py-1">
                                {t("common.you")} <i className="fas fa-star text-warning"></i>
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleShowDetails(member.entity_id, member.name)}
                            title={t("dashboard.viewTasks")}
                          >
                            {member.member_count || 0} <i className="fas fa-tasks ms-1"></i>
                          </button>
                        </td>
                        <td className="py-3 text-end">
                          <span className="fs-5 fw-bold text-success">
                            {member.score.toFixed(0)}
                            <small className="text-muted ms-1">{t("tasks.pts")}</small>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-light p-3 text-center">
                <small className="text-muted">
                  {t("dashboard.keepPushing")} 💪
                </small>
              </div>
          </DecoratedCard>
        </div>
      )}

      {/* Task Details Modal */}
      <TaskCompletionDetailsModal
        isVisible={showDetailsModal}
        onClose={handleCloseModal}
        userTaskDetails={userTaskDetails}
        isLoading={isLoadingDetails}
        title={t("dashboard.taskDetails")}
      />
    </div>
  );
}
