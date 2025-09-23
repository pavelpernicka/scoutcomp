import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import { useConfig } from "../providers/ConfigProvider";

const formatScore = (score) => Number.parseFloat(score ?? 0).toFixed(2);

const isImageDataUrl = (value) => typeof value === "string" && value.startsWith("data:image/");

const renderStatIcon = (icon, size = 32) => {
  if (!icon) return null;
  if (isImageDataUrl(icon)) {
    return (
      <img
        src={icon}
        alt=""
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          borderRadius: "0.5rem",
          border: "1px solid rgba(15, 23, 42, 0.12)",
          backgroundColor: "#ffffff",
        }}
      />
    );
  }
  return (
    <span style={{ fontSize: `${Math.max(size * 0.6, 18)}px`, lineHeight: 1 }}>{icon}</span>
  );
};

export default function LeaderboardPage() {
  const { t } = useTranslation();
  const { config } = useConfig();

  // State for user details modal
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [showUserDetailsModal, setShowUserDetailsModal] = useState(false);

  // State for team breakdown modal
  const [selectedTeamId, setSelectedTeamId] = useState(null);
  const [showTeamBreakdownModal, setShowTeamBreakdownModal] = useState(false);

  const { data: memberBoard = [], isLoading: membersLoading } = useQuery({
    queryKey: ["leaderboard", "members"],
    queryFn: async () => {
      const { data } = await api.get("/leaderboard/members");
      return data;
    },
  });

  const [teamMode, setTeamMode] = useState("total");

  // Update team mode when config loads or changes
  useEffect(() => {
    if (config.leaderboard_default_view) {
      setTeamMode(config.leaderboard_default_view);
    }
  }, [config.leaderboard_default_view]);

  const { data: teamBoard = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["leaderboard", "teams", teamMode],
    queryFn: async () => {
      const { data } = await api.get("/leaderboard/teams", { params: { mode: teamMode } });
      return data;
    },
  });

  const { data: statCategories = [], isLoading: statsCategoriesLoading } = useQuery({
    queryKey: ["stats", "categories"],
    queryFn: async () => {
      const { data } = await api.get("/stats-categories");
      return data;
    },
    staleTime: 30_000,
  });

  // Query for team member breakdown
  const { data: teamMembersData = [], isLoading: teamMembersLoading } = useQuery({
    queryKey: ["leaderboard", "team", selectedTeamId, "members"],
    queryFn: async () => {
      const { data } = await api.get(`/leaderboard/team/${selectedTeamId}/members`);
      return data;
    },
    enabled: Boolean(selectedTeamId),
    staleTime: 30_000,
  });

  // Query for user task details
  const { data: userTaskDetails, isLoading: userDetailsLoading } = useQuery({
    queryKey: ["leaderboard", "user-task-details", selectedUserId],
    queryFn: async () => {
      const { data } = await api.get(`/leaderboard/user/${selectedUserId}/task-completions`);
      return data;
    },
    enabled: Boolean(selectedUserId),
    staleTime: 30_000,
  });

  const memberMax = useMemo(
    () => Math.max(...memberBoard.map((entry) => entry.score || 0), 1),
    [memberBoard]
  );
  const teamMax = useMemo(
    () => Math.max(...teamBoard.map((entry) => entry.score || 0), 1),
    [teamBoard]
  );
  const topMembers = useMemo(() => memberBoard.slice(0, 5), [memberBoard]);

  const [expandedBoard, setExpandedBoard] = useState(null);

  const openBoardModal = (config) => {
    setExpandedBoard(config);
  };

  const closeBoardModal = () => {
    setExpandedBoard(null);
  };

  // Handlers for user details modal
  const handleShowUserDetails = (userId) => {
    setSelectedUserId(userId);
    setShowUserDetailsModal(true);
  };

  const handleCloseUserDetailsModal = () => {
    setShowUserDetailsModal(false);
    setSelectedUserId(null);
  };

  // Handlers for team breakdown modal
  const handleShowTeamBreakdown = (teamId, teamName) => {
    setSelectedTeamId(teamId);
    setShowTeamBreakdownModal(true);
  };

  const handleCloseTeamBreakdownModal = () => {
    setShowTeamBreakdownModal(false);
    setSelectedTeamId(null);
  };

  useEffect(() => {
    if (expandedBoard) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [expandedBoard]);

  const renderEntryList = (entries, maxScore, getSubtitle, isUserList = false, isTeamList = false) => (
    <div className="d-flex flex-column gap-3">
      {entries.map((entry, index) => {
        const percentage = Math.max(0, Math.min(100, (entry.score / maxScore) * 100));
        const subtitle = getSubtitle ? getSubtitle(entry) : null;

        // Determine rank styling and colors
        const isTopThree = entry.rank <= 3;
        const rankIcon = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : '🏅';
        const progressColor = entry.rank === 1 ? '#ffd700' : entry.rank === 2 ? '#c0c0c0' : entry.rank === 3 ? '#cd7f32' : '#28a745';

        return (
          <div key={entry.entity_id} className={`p-3 rounded-3 border ${isTopThree ? 'bg-light shadow-sm' : 'bg-white'}`}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="d-flex align-items-center gap-2">
                <span className="fs-5">{rankIcon}</span>
                <div>
                  <div className="fw-bold">
                    {isUserList ? (
                      <button
                        type="button"
                        className="btn btn-link p-0 fw-bold text-start text-decoration-none"
                        onClick={() => handleShowUserDetails(entry.entity_id)}
                        title={t("leaderboard.clickForDetails", "Click to see task breakdown")}
                        style={{ color: isTopThree ? '#6f42c1' : '#0d6efd' }}
                      >
                        {entry.name}
                      </button>
                    ) : isTeamList ? (
                      <button
                        type="button"
                        className="btn btn-link p-0 fw-bold text-start text-decoration-none"
                        onClick={() => handleShowTeamBreakdown(entry.entity_id, entry.name)}
                        title={t("leaderboard.clickForTeamDetails", "Click to see team members")}
                        style={{ color: isTopThree ? '#6f42c1' : '#0d6efd' }}
                      >
                        {entry.name}
                      </button>
                    ) : (
                      <span style={{ color: isTopThree ? '#6f42c1' : '#495057' }}>{entry.name}</span>
                    )}
                  </div>
                  {subtitle && <div className="text-muted small">{subtitle}</div>}
                </div>
              </div>
              <div className="text-end">
                <div className="fw-bold fs-6" style={{ color: progressColor }}>{formatScore(entry.score)}</div>
                <small className="text-muted">#{entry.rank}</small>
              </div>
            </div>
            <div className="progress rounded-pill shadow-sm" style={{ height: "8px" }}>
              <div
                className="progress-bar rounded-pill"
                role="progressbar"
                style={{
                  width: `${percentage}%`,
                  background: `linear-gradient(90deg, ${progressColor}, ${progressColor}dd)`
                }}
                aria-valuenow={percentage}
                aria-valuemin="0"
                aria-valuemax="100"
              ></div>
            </div>
          </div>
        );
      })}
    </div>
  );

  function StatsCategoryCard({ category }) {
    const { data: categoryBoard = [], isLoading } = useQuery({
      queryKey: ["leaderboard", "stats", category.id],
      queryFn: async () => {
        const { data } = await api.get(`/leaderboard/stats/${category.id}`, { params: { limit: 200 } });
        return data;
      },
      enabled: Boolean(category?.id),
      staleTime: 30_000,
    });

    const maxScore = useMemo(
      () => Math.max(...categoryBoard.map((entry) => entry.score || 0), 1),
      [categoryBoard]
    );
    const topEntries = useMemo(() => categoryBoard.slice(0, 5), [categoryBoard]);
    const iconPreview = renderStatIcon(category.icon, 64);

    return (
      <div className="card shadow-lg border-0 h-100" style={{ borderTop: '4px solid #6f42c1' }}>
        <div className="card-header bg-light border-0">
          <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
            <div className="d-flex align-items-center gap-3">
              <div className="d-flex align-items-center justify-content-center">
                {iconPreview || <span style={{ fontSize: '4rem' }}>📊</span>}
              </div>
              <div className="flex-grow-1">
                <h6 className="mb-0 fw-bold text-primary">{category.name}</h6>
                {category.description && (
                  <small className="text-muted">{category.description}</small>
                )}
              </div>
            </div>
            {categoryBoard.length > 5 && (
              <button
                type="button"
                className="btn btn-primary btn-sm px-3 py-2"
                onClick={() =>
                  openBoardModal({
                    title: category.name,
                    description: category.description,
                    icon: category.icon,
                    data: categoryBoard,
                    maxScore,
                    getSubtitle: null,
                    isUserList: true,
                  })
                }
              >
                <span className="me-1">📈</span>
                {t("leaderboard.showAll", "Show all")}
              </button>
            )}
          </div>
        </div>
        <div className="card-body p-4">
          {isLoading ? (
            <div className="text-center text-muted py-3">
              <div className="spinner-border spinner-border-sm text-primary" role="status">
                <span className="visually-hidden">{t("tasks.loading", "Loading…")}</span>
              </div>
              <div className="mt-2">{t("tasks.loading", "Loading…")}</div>
            </div>
          ) : topEntries.length === 0 ? (
            <div className="text-center py-4">
              <div className="display-4 mb-2">📊</div>
              <p className="text-muted mb-0">{t("leaderboard.empty", "No entries yet.")}</p>
              <small className="text-muted">{t("leaderboard.beTheFirst", "Be the first to earn points here!")}</small>
            </div>
          ) : (
            renderEntryList(topEntries, maxScore, null, true)
          )}
        </div>
      </div>
    );
  }

  StatsCategoryCard.propTypes = {
    category: PropTypes.shape({
      id: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
      description: PropTypes.string,
      icon: PropTypes.string,
      component_count: PropTypes.number,
      components: PropTypes.arrayOf(
        PropTypes.shape({
          id: PropTypes.number.isRequired,
          task_id: PropTypes.number.isRequired,
          metric: PropTypes.string.isRequired,
          weight: PropTypes.number.isRequired,
          position: PropTypes.number.isRequired,
        })
      ),
    }).isRequired,
  };

  const expandedBoardIcon = expandedBoard ? renderStatIcon(expandedBoard.icon, 36) : null;

  return (
    <>
      {/* Enthusiastic Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-body text-white position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
              <div className="row align-items-center">
                <div className="col-md-8">
                  <div className="d-flex align-items-center mb-2">
                    <span className="fs-1 me-3">🏆</span>
                    <div>
                      <h1 className="mb-1">{t("leaderboard.heroTitle", "Hall of Champions!")}</h1>
                      <p className="mb-0 opacity-90 fs-5">
                        {t("leaderboard.heroSubtitle", "Celebrating our amazing quest heroes and their incredible achievements!")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              <div className="position-absolute top-0 end-0 opacity-10" style={{ fontSize: '8rem', lineHeight: 1, marginTop: '-2rem', marginRight: '-2rem' }}>
                🎖️
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Members Leaderboard */}
        <div className="col-12 col-xl-6">
          <div className="card shadow-lg border-0 h-100" style={{ borderTop: '4px solid #28a745' }}>
            <div className="card-header bg-light border-0">
              <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                <div className="d-flex align-items-center gap-2">
                  <span className="fs-4">🥇</span>
                  <div>
                    <h5 className="mb-0 fw-bold text-success">{t("leaderboard.members")}</h5>
                    <small className="text-muted">{t("leaderboard.topPerformers", "Top Performers")}</small>
                  </div>
                  <span className="badge bg-success text-white px-3 py-2">{memberBoard.length}</span>
                </div>
                {memberBoard.length > 5 && (
                  <button
                    type="button"
                    className="btn btn-success btn-sm px-3 py-2"
                    onClick={() =>
                      openBoardModal({
                        title: t("leaderboard.members"),
                        description: t(
                          "leaderboard.membersDescription",
                          "Total approved points per member"
                        ),
                        data: memberBoard,
                        maxScore: memberMax,
                        getSubtitle: null,
                        isUserList: true,
                      })
                    }
                  >
                    <span className="me-1">📊</span>
                    {t("leaderboard.showAll", "Show all")}
                  </button>
                )}
              </div>
            </div>
            <div className="card-body p-4">
              {membersLoading ? (
                <div className="text-center text-muted py-3">
                  <div className="spinner-border spinner-border-sm text-success" role="status">
                    <span className="visually-hidden">{t("tasks.loading", "Loading…")}</span>
                  </div>
                  <div className="mt-2">{t("tasks.loading", "Loading…")}</div>
                </div>
              ) : topMembers.length === 0 ? (
                <div className="text-center py-4">
                  <div className="display-3 mb-3">🥇</div>
                  <h6 className="text-muted mb-1">{t("leaderboard.noChampionsYet", "No champions yet!")}</h6>
                  <small className="text-muted">{t("leaderboard.startQuesting", "Complete tasks to appear on the leaderboard")}</small>
                </div>
              ) : (
                renderEntryList(topMembers, memberMax, null, true)
              )}
            </div>
          </div>
        </div>

        {/* Teams Leaderboard */}
        <div className="col-12 col-xl-6">
          <div className="card shadow-lg border-0 h-100" style={{ borderTop: '4px solid #fd7e14' }}>
            <div className="card-header bg-light border-0">
              <div className="d-flex justify-content-between align-items-center gap-2 flex-wrap">
                <div className="d-flex align-items-center gap-2">
                  <span className="fs-4">🏅</span>
                  <div>
                    <h5 className="mb-0 fw-bold text-warning">{t("leaderboard.teams")}</h5>
                    <small className="text-muted">{t("leaderboard.teamRankings", "Team Rankings")}</small>
                  </div>
                  <span className="badge text-white px-3 py-2" style={{ backgroundColor: '#fd7e14' }}>{teamBoard.length}</span>
                </div>
                <div className="btn-group btn-group-sm" role="group" aria-label="Team leaderboard mode">
                  <button
                    type="button"
                    className={`btn ${teamMode === "total" ? "btn-warning" : "btn-outline-warning"}`}
                    onClick={() => setTeamMode("total")}
                  >
                    <span className="me-1">📈</span>
                    {t("leaderboard.totalBtn", "Total")}
                  </button>
                  <button
                    type="button"
                    className={`btn ${teamMode === "average" ? "btn-warning" : "btn-outline-warning"}`}
                    onClick={() => setTeamMode("average")}
                  >
                    <span className="me-1">⚖️</span>
                    {t("leaderboard.averageBtn", "Average")}
                  </button>
                </div>
              </div>
            </div>
            <div className="card-body p-4">
              {teamsLoading ? (
                <div className="text-center text-muted py-3">
                  <div className="spinner-border spinner-border-sm" style={{ color: '#fd7e14' }} role="status">
                    <span className="visually-hidden">{t("tasks.loading", "Loading…")}</span>
                  </div>
                  <div className="mt-2">{t("tasks.loading", "Loading…")}</div>
                </div>
              ) : teamBoard.length === 0 ? (
                <div className="text-center py-4">
                  <div className="display-3 mb-3">🏅</div>
                  <h6 className="text-muted mb-1">{t("leaderboard.noTeamsYet", "No team rankings yet!")}</h6>
                  <small className="text-muted">{t("leaderboard.teamsWillAppear", "Team standings will appear as members complete tasks")}</small>
                </div>
              ) : (
                renderEntryList(teamBoard, teamMax, (entry) => {
                  const totalPoints = entry.total_points ?? entry.score;
                  const memberCount = entry.member_count ?? 0;
                  return teamMode === "average"
                    ? t("leaderboard.averageLine", {
                        defaultValue: "Total {{total}} • Members {{count}}",
                        total: formatScore(totalPoints),
                        count: memberCount,
                      })
                    : t("leaderboard.membersLine", {
                        defaultValue: "Members {{count}}",
                        count: memberCount,
                      });
                }, false, true)
              )}
            </div>
          </div>
        </div>

        {/* Loading state for stats */}
        {statsCategoriesLoading && statCategories.length === 0 && (
          <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-body text-center text-muted py-3">
                {t("tasks.loading", "Loading…")}
              </div>
            </div>
          </div>
        )}

        {/* Custom Statistics */}
        {!statsCategoriesLoading && statCategories.length > 0 && (
          <div className="col-12">
            <div className="d-flex align-items-center gap-3 mb-4">
              <span className="fs-1">📈</span>
              <div>
                <h2 className="h4 mb-0 fw-bold text-primary">{t("leaderboard.statsHeading", "Custom Statistics")}</h2>
                <small className="text-muted">{t("leaderboard.specialAchievements", "Special achievement categories")}</small>
              </div>
            </div>
            <div className="row g-4">
              {statCategories.map((category) => (
                <div className="col-12 col-xl-6" key={category.id}>
                  <StatsCategoryCard category={category} />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No stats message */}
        {!statsCategoriesLoading && statCategories.length === 0 && (
          <div className="col-12">
            <div className="card shadow-sm">
              <div className="card-body text-muted">
                {t("leaderboard.noStats", "No custom statistics configured yet.")}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Task Details Modal */}
      {showUserDetailsModal && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog modal-lg" role="document">
              <div className="modal-content border-0 shadow-lg">
                <div className="modal-header text-white" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                  <div className="d-flex align-items-center gap-2">
                    <span className="fs-3">📊</span>
                    <div>
                      <h5 className="modal-title mb-0">{t("leaderboard.taskDetails", "Task Completion Details")}</h5>
                      <small className="opacity-90">{userTaskDetails?.username}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    aria-label="Close"
                    onClick={handleCloseUserDetailsModal}
                  ></button>
                </div>
                <div className="modal-body p-4">
                  {userDetailsLoading ? (
                    <div className="text-center py-4">
                      <div className="spinner-border" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {userTaskDetails?.task_completions?.length > 0 ? (
                        <div className="table-responsive">
                          <table className="table table-hover border rounded">
                            <thead className="table-light">
                              <tr>
                                <th className="border-0">
                                  <span className="me-2">🎯</span>
                                  {t("leaderboard.taskColumn", "Task")}
                                </th>
                                <th className="text-end border-0">
                                  <span className="me-2">📊</span>
                                  {t("leaderboard.completionsColumn", "Completions")}
                                </th>
                                <th className="text-end border-0">
                                  <span className="me-2">🏆</span>
                                  {t("leaderboard.pointsColumn", "Points")}
                                </th>
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
                    onClick={handleCloseUserDetailsModal}
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

      {/* Team Members Breakdown Modal */}
      {showTeamBreakdownModal && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog modal-lg" role="document">
              <div className="modal-content border-0 shadow-lg">
                <div className="modal-header text-white" style={{ background: 'linear-gradient(135deg, #fd7e14 0%, #f093fb 100%)' }}>
                  <div className="d-flex align-items-center gap-2">
                    <span className="fs-3">👥</span>
                    <div>
                      <h5 className="modal-title mb-0">{t("leaderboard.teamMembers", "Team Members")}</h5>
                      <small className="opacity-90">{teamBoard.find(t => t.entity_id === selectedTeamId)?.name}</small>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-close btn-close-white"
                    aria-label="Close"
                    onClick={handleCloseTeamBreakdownModal}
                  ></button>
                </div>
                <div className="modal-body p-4">
                  {teamMembersLoading ? (
                    <div className="text-center py-4">
                      <div className="spinner-border" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : (
                    <>
                      {teamMembersData.length > 0 ? (
                        <div className="table-responsive">
                          <table className="table table-hover border rounded">
                            <thead className="table-light">
                              <tr>
                                <th className="border-0">
                                  <span className="me-2">🏅</span>
                                  {t("leaderboard.rankColumn", "Rank")}
                                </th>
                                <th className="border-0">
                                  <span className="me-2">👤</span>
                                  {t("leaderboard.memberColumn", "Member")}
                                </th>
                                <th className="text-end border-0">
                                  <span className="me-2">📊</span>
                                  {t("leaderboard.completionsColumn", "Completions")}
                                </th>
                                <th className="text-end border-0">
                                  <span className="me-2">💰</span>
                                  {t("leaderboard.totalPointsColumn", "Total Points")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {teamMembersData.map((member) => (
                                <tr key={member.entity_id}>
                                  <td>
                                    <span className={`badge ${member.rank === 1 ? "bg-warning text-dark" : member.rank === 2 ? "bg-secondary" : member.rank === 3 ? "bg-dark" : "bg-light text-dark"}`}>
                                      #{member.rank}
                                    </span>
                                  </td>
                                  <td>
                                    <button
                                      type="button"
                                      className="btn btn-link p-0 text-start"
                                      onClick={() => {
                                        handleCloseTeamBreakdownModal();
                                        handleShowUserDetails(member.entity_id);
                                      }}
                                      title="Click to see task breakdown"
                                    >
                                      {member.name}
                                    </button>
                                  </td>
                                  <td className="text-end">{member.member_count || 0}</td>
                                  <td className="text-end fw-bold">{member.score.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <p className="text-muted text-center py-4">No members found in this team.</p>
                      )}
                    </>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCloseTeamBreakdownModal}
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

      {/* Expanded Board Modal */}
      {expandedBoard && (
        <>
          <div
            className="modal fade show"
            style={{ display: "block" }}
            role="dialog"
            tabIndex="-1"
            onClick={closeBoardModal}
          >
            <div
              className="modal-dialog modal-lg"
              role="document"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title d-flex align-items-center gap-2">
                    {expandedBoardIcon ? (
                      <span className="d-inline-flex align-items-center justify-content-center me-1">
                        {expandedBoardIcon}
                      </span>
                    ) : null}
                    <span>{expandedBoard.title}</span>
                  </h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeBoardModal}></button>
                </div>
                <div className="modal-body">
                  {expandedBoard.description ? (
                    <p className="text-muted small">{expandedBoard.description}</p>
                  ) : null}
                  {expandedBoard.data.length === 0 ? (
                    <p className="text-muted mb-0">{t("leaderboard.empty", "No entries yet.")}</p>
                  ) : (
                    renderEntryList(
                      expandedBoard.data,
                      expandedBoard.maxScore,
                      expandedBoard.getSubtitle,
                      expandedBoard.isUserList || false,
                      expandedBoard.isTeamList || false
                    )
                  )}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-secondary" onClick={closeBoardModal}>
                    {t("common.close", "Close")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </>
  );
}
