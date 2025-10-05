import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import { useConfig } from "../providers/ConfigProvider";
import TaskCompletionDetailsModal from "../components/TaskCompletionDetailsModal";
import HeroHeader from "../components/HeroHeader";
import LoadingSpinner from "../components/LoadingSpinner";
import Button from "../components/Button";
import Modal from "../components/Modal";
import DecoratedCard from "../components/DecoratedCard";

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
  const handleShowTeamBreakdown = (teamId) => {
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
      {entries.map((entry) => {
        const percentage = Math.max(0, Math.min(100, (entry.score / maxScore) * 100));
        const subtitle = getSubtitle ? getSubtitle(entry) : null;

        // Determine rank styling and colors
        const isTopThree = entry.rank <= 3;
        const rankIcon = entry.rank === 1 ? <i className="fas fa-trophy text-warning"></i> : entry.rank === 2 ? <i className="fas fa-medal text-secondary"></i> : entry.rank === 3 ? <i className="fas fa-medal" style={{color: '#cd7f32'}}></i> : <i className="fas fa-award text-success"></i>;
        const progressColor = entry.rank === 1 ? '#ffd700' : entry.rank === 2 ? '#c0c0c0' : entry.rank === 3 ? '#cd7f32' : '#28a745';

        return (
          <div key={entry.entity_id} className={`p-3 rounded-3 border ${isTopThree ? 'bg-light shadow-sm' : 'bg-white'}`}>
            <div className="d-flex justify-content-between align-items-center mb-2">
              <div className="d-flex align-items-center gap-2">
                <span className="fs-5">{rankIcon}</span>
                <div>
                  <div className="fw-bold">
                    {isUserList ? (
                      <Button
                        variant="link"
                        className="p-0 fw-bold text-start text-decoration-none"
                        onClick={() => handleShowUserDetails(entry.entity_id)}
                        title={t("leaderboard.clickForDetails", "Click to see task breakdown")}
                        style={{ color: isTopThree ? '#6f42c1' : '#0d6efd' }}
                      >
                        {entry.name}
                      </Button>
                    ) : isTeamList ? (
                      <Button
                        variant="link"
                        className="p-0 fw-bold text-start text-decoration-none"
                        onClick={() => handleShowTeamBreakdown(entry.entity_id, entry.name)}
                        title={t("leaderboard.clickForTeamDetails", "Click to see team members")}
                        style={{ color: isTopThree ? '#6f42c1' : '#0d6efd' }}
                      >
                        {entry.name}
                      </Button>
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
      <DecoratedCard
        title={category.name}
        subtitle={category.description}
        icon={iconPreview || "📊"}
        headerGradient="linear-gradient(135deg, #6f42c1 0%, #764ba2 100%)"
        shadow={true}
        className="h-100"
        rightContent={categoryBoard.length > 5 && (
          <Button
            variant="primary"
            size="sm"
            className="px-3 py-2"
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
            icon="fas fa-eye"
            iconPosition="left"
          >
            {t("leaderboard.showAll", "Show all")}
          </Button>
        )}
      >
        {isLoading ? (
          <LoadingSpinner size="sm" color="primary" text={t("tasks.loading", "Loading…")} />
        ) : topEntries.length === 0 ? (
          <div className="text-center py-4">
            <div className="display-4 mb-2">📊</div>
            <p className="text-muted mb-0">{t("leaderboard.empty", "No entries yet.")}</p>
            <small className="text-muted">{t("leaderboard.beTheFirst", "Be the first to earn points here!")}</small>
          </div>
        ) : (
          renderEntryList(topEntries, maxScore, null, true)
        )}
      </DecoratedCard>
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
      <HeroHeader
        title={t("leaderboard.heroTitle", "Hall of Champions!")}
        subtitle={t("leaderboard.heroSubtitle", "Celebrating our amazing quest heroes and their incredible achievements!")}
        icon="🏆"
        gradient="linear-gradient(350deg, #f093fb 0%, #f5576c 100%)"
      />

      <div className="row g-4">
        {/* Members Leaderboard */}
        <div className="col-12 col-xl-6">
          <DecoratedCard
            title={t("leaderboard.members")}
            subtitle={t("leaderboard.topPerformers", "Top Performers")}
            icon="🏆"
            headerGradient="linear-gradient(135deg, #28a745 0%, #20c997 100%)"
            shadow={true}
            className="h-100"
            rightBadge={memberBoard.length}
            rightContent={memberBoard.length > 5 && (
              <Button
                variant="success"
                size="sm"
                className="px-3 py-2 ms-2"
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
                icon="fas fa-eye"
                iconPosition="left"
              >
                {t("leaderboard.showAll", "Show all")}
              </Button>
            )}
          >
            {membersLoading ? (
              <LoadingSpinner size="sm" color="success" text={t("tasks.loading", "Loading…")} />
            ) : topMembers.length === 0 ? (
              <div className="text-center py-4">
                <div className="display-3 mb-3"><i className="fas fa-trophy text-warning"></i></div>
                <h6 className="text-muted mb-1">{t("leaderboard.noChampionsYet", "No champions yet!")}</h6>
                <small className="text-muted">{t("leaderboard.startQuesting", "Complete tasks to appear on the leaderboard")}</small>
              </div>
            ) : (
              renderEntryList(topMembers, memberMax, null, true)
            )}
          </DecoratedCard>
        </div>

        {/* Teams Leaderboard */}
        <div className="col-12 col-xl-6">
          <DecoratedCard
            title={t("leaderboard.teams", "Teams")}
            subtitle={t("leaderboard.teamRankings", "Team Rankings")}
            icon="🏅"
            headerGradient="linear-gradient(45deg, rgb(233, 30, 99), rgb(255, 127, 39))"
            shadow={true}
            className="h-100"
            rightBadge={teamBoard.length}
            rightContent={
              <div className="btn-group btn-group-sm ms-2 bg-light" role="group" aria-label="Team leaderboard mode">
                <Button
                  variant={teamMode === "total" ? "warning" : ""}
                  size="sm"
                  onClick={() => setTeamMode("total")}
                  icon="fas fa-calculator"
                  iconPosition="left"
                >
                  {t("leaderboard.totalBtn", "Total")}
                </Button>
                <Button
                  variant={teamMode === "average" ? "warning" : ""}
                  size="sm"
                  onClick={() => setTeamMode("average")}
                  icon="fas fa-chart-bar"
                  iconPosition="left"
                >
                  {t("leaderboard.averageBtn", "Average")}
                </Button>
              </div>
            }
          >
            {teamsLoading ? (
              <LoadingSpinner size="sm" color="warning" text={t("tasks.loading", "Loading…")} />
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
          </DecoratedCard>
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
      <TaskCompletionDetailsModal
        isVisible={showUserDetailsModal}
        onClose={handleCloseUserDetailsModal}
        userTaskDetails={userTaskDetails}
        isLoading={userDetailsLoading}
        title={t("leaderboard.taskDetails", "Task Completion Details")}
      />

      {/* Team Members Breakdown Modal */}
      <Modal
        isVisible={showTeamBreakdownModal}
        onClose={handleCloseTeamBreakdownModal}
        title={t("leaderboard.teamMembers", "Team Members")}
        subtitle={teamBoard.find(t => t.entity_id === selectedTeamId)?.name}
        icon={<i className="fas fa-users fs-3 text-info"></i>}
        size="lg"
        headerGradient="linear-gradient(135deg, #fd7e14 0%, #f093fb 100%)"
        footer={
          <Button
            variant="secondary"
            onClick={handleCloseTeamBreakdownModal}
          >
            Close
          </Button>
        }
      >
        {teamMembersLoading ? (
          <LoadingSpinner text="Loading..." />
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
                        <i className="fas fa-user me-2 text-secondary"></i>
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
                          <Button
                            variant="link"
                            className="p-0 text-start"
                            onClick={() => {
                              handleCloseTeamBreakdownModal();
                              handleShowUserDetails(member.entity_id);
                            }}
                            title="Click to see task breakdown"
                          >
                            {member.name}
                          </Button>
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
      </Modal>

      {/* Expanded Board Modal */}
      <Modal
        isVisible={Boolean(expandedBoard)}
        onClose={closeBoardModal}
        title={expandedBoard?.title}
        icon={expandedBoardIcon}
        size="lg"
        footer={
          <Button variant="secondary" onClick={closeBoardModal}>
            {t("common.close", "Close")}
          </Button>
        }
      >
        {expandedBoard?.description ? (
          <p className="text-muted small">{expandedBoard.description}</p>
        ) : null}
        {expandedBoard?.data.length === 0 ? (
          <p className="text-muted mb-0">{t("leaderboard.empty", "No entries yet.")}</p>
        ) : (
          renderEntryList(
            expandedBoard?.data || [],
            expandedBoard?.maxScore || 1,
            expandedBoard?.getSubtitle,
            expandedBoard?.isUserList || false,
            expandedBoard?.isTeamList || false
          )
        )}
      </Modal>
    </>
  );
}
