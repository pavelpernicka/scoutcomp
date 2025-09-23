import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useState } from "react";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

const formatDate = (value) => new Date(value).toLocaleString();

export default function Dashboard() {
  const { profile, isLoading } = useAuth();
  const { t } = useTranslation();
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

  const handleShowDetails = (userId, userName) => {
    setSelectedUserId(userId);
    setShowDetailsModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailsModal(false);
    setSelectedUserId(null);
  };

  if (isLoading) {
    return <div className="text-center py-5">{t("tasks.loading", "Loading…")}</div>;
  }

  const totalPoints = profile?.scoreboard?.total_points ?? 0;
  const memberRank = profile?.scoreboard?.member_rank ?? "–";
  const teamRank = profile?.scoreboard?.team_rank ?? "–";

  return (
    <div className="row g-4">
      {/* Welcome box */}
      <div className="col-12">
        <div className="card shadow-lg border-0" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
          <div className="card-body text-white p-4">
            <div className="row align-items-center">
              <div className="col-md-8">
                <div className="d-flex align-items-center mb-2">
                  <span className="fs-2 me-2">🎯</span>
                  <div>
                    <h3 className="mb-1 fw-bold text-white">{t("dashboard.welcome", "Welcome, {{username}}!", { username: profile?.user?.username })}</h3>
                    {profile?.user?.team_name && (
                      <p className="mb-0 opacity-90">
                        <span className="me-2">🏆</span>
                        {t("dashboard.teamPride", "Proudly representing {{teamName}}", { teamName: profile.user.team_name })}
                      </p>
                    )}
                    {!profile?.user?.team_name && profile?.user?.team_id === null && (
                      <p className="mb-0 opacity-90">
                        <span className="me-2">🚀</span>
                        {t("dashboard.welcomeNoGroup", "You are not in any group yet, it you think you should be, contact admin")}
                      </p>
                    )}
                  </div>
                </div>
                <div className="row g-3 mt-2">
                  <div className="col-6 col-lg-3">
                    <div className="text-center bg-white text-black bg-opacity-20 rounded p-2">
                      <div className="fs-5 fw-bold">{totalPoints}</div>
                      <small className="opacity-90">{t("dashboard.totalPoints", "Total Points")}</small>
                    </div>
                  </div>
                  {memberRank !== "–" && (
                    <div className="col-6 col-lg-3">
                      <div className="text-center bg-white text-black bg-opacity-20 rounded p-2">
                        <div className="fs-5 fw-bold">#{memberRank}</div>
                        <small className="opacity-90">{t("dashboard.yourRank", "Your Rank")}</small>
                      </div>
                    </div>
                  )}
                  {teamRank !== "–" && (
                    <div className="col-6 col-lg-3">
                      <div className="text-center bg-white text-black bg-opacity-20 rounded p-2">
                        <div className="fs-5 fw-bold">#{teamRank}</div>
                        <small className="opacity-90">{t("dashboard.teamRank", "Team Rank")}</small>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {/* Future: badge */}
              <div className="col-md-4 text-end d-none">
                <div className="display-1" style={{ fontSize: '4rem' }}>🌟</div>
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
        </div>
      </div>

      {dashboardMessages.length > 0 && (
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-header text-white position-relative" style={{ background: 'linear-gradient(135deg, #4834d4 0%, #686de0 100%)' }}>
              <div className="d-flex align-items-center gap-3">
                <span className="fs-2">📢</span>
                <div>
                  <h4 className="mb-1">{t("dashboard.announcements", "Important Announcements")}</h4>
                  <p className="mb-0 opacity-90">{t("dashboard.stayInformed", "Stay informed about what's happening!")}</p>
                </div>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="d-flex flex-column">
                {dashboardMessages.map((message, index) => (
                  <div key={message.id} className={`p-4 ${index !== dashboardMessages.length - 1 ? 'border-bottom' : ''} position-relative overflow-hidden`} style={{ background: index % 2 === 0 ? '#f8f9fa' : 'white' }}>
                    <div className="position-absolute start-0 top-0 bottom-0 bg-primary" style={{ width: '4px' }}></div>
                    <div className="d-flex justify-content-between align-items-start mb-3">
                      <div className="d-flex align-items-center gap-2">
                        <span className="badge bg-primary px-3 py-2">
                          {message.team_name || t("dashboard.allTeams", "All Teams")}
                        </span>
                        <h5 className="mb-0 text-dark">{message.title || t("dashboard.infoTitle", "Information")}</h5>
                      </div>
                      <div className="text-end">
                        <small className="text-muted d-flex align-items-center gap-1">
                          <span>🕐</span>
                          {formatDate(message.created_at)}
                        </small>
                      </div>
                    </div>
                    <div className="ms-2">
                      <p className="mb-0 text-dark" style={{ lineHeight: '1.6' }}>{message.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card-footer bg-light text-center py-3">
              <small className="text-muted">
                ✨ {t("dashboard.totalAnnouncements", "{{count}} announcement(s)", { count: dashboardMessages.length })}
              </small>
            </div>
          </div>
        </div>
      )}

      <div className="col-12 col-xl-4">
        <div className="card shadow-sm h-100" style={{ minHeight: '500px' }}>
          <div className="card-header d-flex justify-content-between align-items-center">
            <div className="d-flex align-items-center gap-2">
              <span>🔥 {t("dashboard.teamActivity", "Team Activity")}</span>
              {teamActivity.stats.team_name && (
                <span className="badge bg-success">{teamActivity.stats.team_name}</span>
              )}
            </div>
            <span className="small text-muted">{t("dashboard.lastDays", "Last 7 days")}</span>
          </div>
          <div className="card-body p-0 d-flex flex-column justify-content-between">
            {teamActivity.activities.length === 0 ? (
              <div className="text-center py-4 text-muted">
                <div className="mb-2">🚀</div>
                <div>{t("dashboard.makeMagic", "Time to make some magic happen!")}</div>
                <small>{t("dashboard.completeTasksToSee", "Complete tasks to see your team's amazing progress here")}</small>
              </div>
            ) : (
              <>
                {/* Week stats banner */}
                <div className="bg-light p-3 border-bottom">
                  <div className="row text-center g-0">
                    <div className="col-4">
                      <div className="fw-bold text-primary fs-5">{teamActivity.stats.total_completions_this_week}</div>
                      <div className="small text-muted">{t("dashboard.tasksDone", "Tasks Done!")}</div>
                    </div>
                    <div className="col-4">
                      <div className="fw-bold text-success fs-5">{teamActivity.stats.total_points_this_week.toFixed(0)}</div>
                      <div className="small text-muted">{t("dashboard.pointsEarned", "Points Earned!")}</div>
                    </div>
                    <div className="col-4">
                      <div className="fw-bold text-warning fs-5">{teamActivity.stats.active_members}</div>
                      <div className="small text-muted">{t("dashboard.activeHeroes", "Active Heroes!")}</div>
                    </div>
                  </div>
                </div>

                {/* Activity feed */}
                <div className="activity-feed" style={{ maxHeight: '300px', overflowY: 'auto' }}>
                  {teamActivity.activities.slice(0, 8).map((activity, index) => (
                    <div key={activity.id} className={`p-3 border-bottom ${activity.is_current_user ? 'bg-primary bg-opacity-10' : ''}`}>
                      <div className="d-flex align-items-start gap-2">
                        <div className="flex-shrink-0">
                          {activity.is_current_user ? (
                            <span className="badge bg-primary rounded-pill">You</span>
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
                                  <span className="text-primary">{t("dashboard.youCompleted", "You completed")}</span>
                                ) : (
                                  <span><strong>{activity.member_name}</strong> {t("dashboard.completed", "completed")}</span>
                                )} <span className="text-dark">{activity.task_name}</span>
                                {activity.count > 1 && (
                                  <span className="badge bg-info ms-2">{activity.count}x</span>
                                )}
                              </div>
                              <div className="small text-muted">
                                {activity.time_ago}
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
                    <small className="text-muted">{t("dashboard.moreAchievements", "And {{count}} more amazing achievements! 🎉", { count: teamActivity.activities.length - 8 })}</small>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="col-12 col-xl-4">
        <div className="card shadow-sm h-100" style={{ minHeight: '500px' }}>
          <div className="card-header">{t("dashboard.notifications", "Messages")}</div>
          <div className="card-body d-flex flex-column p-0 justify-content-between">
            {notifications.length === 0 ? (
              <div className="flex-grow-1 d-flex align-items-center justify-content-center p-4">
                <div className="text-center">
                  <div className="display-4 mb-3">📬</div>
                  <h5 className="text-muted">{t("dashboard.noMessagesYet", "No messages yet")}</h5>
                  <p className="small text-muted mb-0">{t("dashboard.messagesWillAppear", "Important messages will appear here when available")}</p>
                </div>
              </div>
            ) : (
              <>
                <div className="p-3 bg-light border-bottom">
                  <div className="d-flex align-items-center justify-content-between">
                    <span className="fw-medium text-dark">💬 {t("dashboard.recentMessages", "Recent Messages")}</span>
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
                              {notification.sender_username ?
                                notification.sender_username.charAt(0).toUpperCase() :
                                '⚙️'
                              }
                            </div>
                            <div>
                              <span className="fw-semibold text-dark">
                                {notification.sender_username || t("dashboard.system", "System")}
                              </span>
                              <div className="small text-muted">
                                {formatDate(notification.created_at)}
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
                      📨 {t("dashboard.scrollForMore", "Scroll up to see all {{count}} messages", { count: notifications.length })}
                    </small>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="col-12 col-xl-4">
        <div className="card shadow-sm h-100" style={{ minHeight: '500px' }}>
          <div className="card-header bg-gradient text-white" style={{ background: 'linear-gradient(45deg, #ff6b6b, #feca57)' }}>
            <div className="d-flex align-items-center text-black gap-2">
              <span>⚡</span>
              <span>{t("dashboard.yourJourney", "How is it going")}</span>
            </div>
          </div>
          <div className="p-0 card-body d-flex flex-column">
            {isLoadingCompletions ? (
              <div className="text-center py-4">
                <div className="spinner-border text-primary" role="status">
                  <span className="visually-hidden">{t("tasks.loading", "Loading…")}</span>
                </div>
              </div>
            ) : completions.length === 0 ? (
              <div className="flex-grow-1 d-flex flex-column align-items-center justify-content-center text-center py-4">
                <div className="display-4 mb-3">🎪</div>
                <h5 className="text-muted">{t("dashboard.readyToShine", "Ready to shine?")}</h5>
                <p className="small text-muted mb-0">{t("dashboard.startCompleting", "Start completing tasks to see your amazing progress!")}</p>
              </div>
            ) : (
              <div className="d-flex flex-column gap-3 flex-grow-1 justify-content-between">
              <div className="p-3 activity-feed" style={{ maxHeight: '390px', overflowY: 'auto' }}>
                {completions.slice(0, 5).map((entry) => (
                  <div key={entry.id} className={`p-3 rounded border-start border-4 ${
                    entry.status === 'approved' ? 'border-success bg-success bg-opacity-10' :
                    entry.status === 'pending' ? 'border-warning bg-warning bg-opacity-10' :
                    'border-danger bg-danger bg-opacity-10'
                  }`}>
                    <div className="d-flex justify-content-between align-items-start">
                      <div className="flex-grow-1">
                        <div className="fw-medium mb-1 d-flex align-items-center justify-content-between">
                          <div className="d-flex align-items-center">
                            <span className="me-2">
                              {entry.status === 'approved' ? '✅' : entry.status === 'pending' ? '⏳' : '❌'}
                            </span>
                            <span>{entry.task?.name || entry.task_id}</span>
                          </div>
                          <span className="badge bg-info">{entry.count}x</span>
                        </div>
                        <div className="small mb-1">
                          {entry.status === "pending" && (
                            <span className="text-warning fw-medium">
                              {t("dashboard.awaitingApproval", "⏰ Awaiting approval")}
                            </span>
                          )}
                          {entry.status === "approved" && (
                            <span className="text-success fw-medium">
                              🎉 {t("dashboard.amazing", "Amazing! +{{points}} points", { points: entry.points_awarded })}
                            </span>
                          )}
                          {entry.status === "rejected" && (
                            <div className="text-danger">
                              <div className="fw-medium">❌ {t("dashboard.rejected", "Rejected")}</div>
                              {entry.admin_note && (
                                <div className="small mt-1 text-muted">
                                  {t("dashboard.reason", "Reason")}: {entry.admin_note}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="small text-muted">{formatDate(entry.submitted_at)}</div>
                      </div>
                    </div>
                  </div>
                ))}
                </div>
                {completions.length > 5 && (
                  <div className="p-3 text-center">
                    <small className="text-muted">{t("dashboard.moreInHistory", "And {{count}} more in your history! 📚", { count: completions.length - 5 })}</small>
                  </div>
                  
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {profile?.user?.team_id && teamMembers.length > 0 && (
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-header text-white position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <div className="d-flex justify-content-between align-items-center position-relative">
                <div className="d-flex align-items-center gap-3">
                  <span className="fs-2">🏆</span>
                  <div>
                    <h4 className="mb-1">{t("dashboard.teamChampions", "Team Champions")}</h4>
                    <p className="mb-0 opacity-90">{profile.user.team_name}</p>
                  </div>
                </div>
                <div className="text-end">
                  <span className="badge bg-white text-dark px-3 py-2 fs-6">
                    {teamMembers.length} {t("dashboard.heroes", "Heroes")}
                  </span>
                </div>
              </div>
            </div>
            <div className="card-body p-0">
              <div className="table-responsive">
                <table className="table table-hover mb-0">
                  <thead className="bg-light">
                    <tr>
                      <th className="py-3">{t("dashboard.rank", "Rank")}</th>
                      <th className="py-3">{t("dashboard.champion", "Name")}</th>
                      <th className="py-3 text-end">{t("dashboard.victories", "Completions")}</th>
                      <th className="py-3 text-end">{t("dashboard.glory", "Points")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamMembers.map((member) => (
                      <tr key={member.entity_id} className={`${member.entity_id === profile.user.id ? "table-primary" : ""} ${member.rank <= 3 ? "fw-bold" : ""}`}>
                        <td className="py-3">
                          <div className="d-flex align-items-center gap-2">
                            {member.rank === 1 && <span className="fs-4">🥇</span>}
                            {member.rank === 2 && <span className="fs-4">🥈</span>}
                            {member.rank === 3 && <span className="fs-4">🥉</span>}
                            <span className={`badge ${
                              member.rank === 1 ? "bg-warning text-dark" :
                              member.rank === 2 ? "bg-secondary" :
                              member.rank === 3 ? "bg-dark" :
                              "bg-light text-dark"
                            } px-3 py-2`}>
                              #{member.rank}
                            </span>
                          </div>
                        </td>
                        <td className="py-3">
                          <div className="d-flex align-items-center gap-2">
                            <button
                              type="button"
                              className="btn btn-link p-0 text-start fw-medium text-decoration-none"
                              onClick={() => handleShowDetails(member.entity_id, member.name)}
                              title={t("dashboard.seeDetails", "Click to see task breakdown")}
                            >
                              {member.name}
                            </button>
                            {member.entity_id === profile.user.id && (
                              <span className="badge bg-primary rounded-pill px-2 py-1">
                                {t("dashboard.you", "You")} 🌟
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 text-end">
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => handleShowDetails(member.entity_id, member.name)}
                            title={t("dashboard.viewTasks", "View completed tasks")}
                          >
                            {member.member_count || 0} 🎯
                          </button>
                        </td>
                        <td className="py-3 text-end">
                          <span className="fs-5 fw-bold text-success">
                            {member.score.toFixed(0)}
                            <small className="text-muted ms-1">{t("tasks.pts", "pts.")}</small>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="bg-light p-3 text-center">
                <small className="text-muted">
                  {t("dashboard.keepPushing", "Keep pushing forward, team! Every task completed makes us stronger!")} 💪
                </small>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Task Details Modal */}
      {showDetailsModal && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog modal-lg" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    Task Completion Details - {userTaskDetails?.username}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={handleCloseModal}
                  ></button>
                </div>
                <div className="modal-body">
                  {isLoadingDetails ? (
                    <div className="text-center py-4">
                      <div className="spinner-border" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {userTaskDetails?.task_completions?.length > 0 ? (
                        <div className="table-responsive">
                          <table className="table table-striped">
                            <thead>
                              <tr>
                                <th>Task</th>
                                <th className="text-end">Completions</th>
                                <th className="text-end">Points</th>
                              </tr>
                            </thead>
                            <tbody>
                              {userTaskDetails.task_completions
                                .sort((a, b) => b.total_points - a.total_points)
                                .map((task) => (
                                <tr key={task.task_id}>
                                  <td>{task.task_name}</td>
                                  <td className="text-end">{task.completion_count}</td>
                                  <td className="text-end fw-bold">{task.total_points.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                            <tfoot className="table-light">
                              <tr>
                                <th>Total</th>
                                <th className="text-end">
                                  {userTaskDetails.task_completions.reduce((sum, t) => sum + t.completion_count, 0)}
                                </th>
                                <th className="text-end">
                                  {userTaskDetails.task_completions.reduce((sum, t) => sum + t.total_points, 0).toFixed(2)}
                                </th>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <p className="text-muted text-center py-4">No completed tasks found.</p>
                      )}
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCloseModal}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}
