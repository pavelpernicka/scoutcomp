import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

const emptyTeamForm = { name: "", description: "" };

export default function AdminTeams() {
  const { t } = useTranslation();
  const { isAdmin, canManageUsers, managedTeamIds, userId } = useAuth();
  const queryClient = useQueryClient();
  const [teamForm, setTeamForm] = useState(emptyTeamForm);
  const [membersModalTeamId, setMembersModalTeamId] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editTeamForm, setEditTeamForm] = useState({ name: "", description: "" });
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberFilter, setMemberFilter] = useState("all");

  const { data: teams = [], isLoading: teamsLoading, isError: teamsError, error: teamsErr } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: async () => {
      const { data } = await api.get("/teams");
      return data;
    },
    enabled: canManageUsers,
    staleTime: 30_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data } = await api.get("/users");
      return data;
    },
    enabled: canManageUsers,
    staleTime: 15_000,
  });

  const createTeamMutation = useMutation({
    mutationFn: async () => api.post("/teams", teamForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      setTeamForm(emptyTeamForm);
      setShowCreateTeamModal(false);
    },
  });

  const rotateCodeMutation = useMutation({
    mutationFn: async (teamId) => api.post(`/teams/${teamId}/invite`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
    },
  });

  const deleteTeamMutation = useMutation({
    mutationFn: async (teamId) => api.delete(`/teams/${teamId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
  });

  const updateTeamMutation = useMutation({
    mutationFn: async ({ id, payload }) => api.patch(`/teams/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      setEditingTeam(null);
    },
  });

  const [memberActionError, setMemberActionError] = useState(null);
  const [memberActionFeedback, setMemberActionFeedback] = useState(null);
  const [activeTeamMembersLocal, setActiveTeamMembersLocal] = useState([]);

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      const { data } = await api.patch(`/users/${id}`, payload);
      return data;
    },
    onSuccess: (updatedUser, variables) => {
      setMemberActionError(null);
      if (variables?.meta?.action === "add") {
        setMemberActionFeedback(t('adminTeams.memberAdded'));
      } else if (variables?.meta?.action === "remove") {
        setMemberActionFeedback(t('adminTeams.memberRemoved'));
      }
      queryClient.setQueryData(["admin", "users"], (previous) => {
        if (!previous) return previous;
        return previous.map((user) =>
          user.id === updatedUser.id ? { ...user, ...updatedUser } : user
        );
      });
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      queryClient.invalidateQueries({ queryKey: ["admin", "teams"] });
      if (variables?.meta?.action === "add") {
        const currentUsers = queryClient.getQueryData(["admin", "users"]) ?? [];
        const addedUser = currentUsers.find((user) => user.id === updatedUser.id) || updatedUser;
        if (addedUser) {
          setActiveTeamMembersLocal((prev) => {
            if (prev.some((member) => member.id === addedUser.id)) {
              return prev;
            }
            return [...prev, { ...addedUser, team_id: updatedUser.team_id }];
          });
        }
      } else if (variables?.meta?.action === "remove") {
        setActiveTeamMembersLocal((prev) => prev.filter((member) => member.id !== updatedUser.id));
      }
    },
    onError: (error) => {
      setMemberActionFeedback(null);
      setMemberActionError(
        error?.response?.data?.detail || t('adminTeams.unableToUpdateMember')
      );
    },
  });

  const groupedUsers = useMemo(() => {
    const map = {};
    teams.forEach((team) => {
      map[team.id] = users.filter((user) => user.team_id === team.id);
    });
    return map;
  }, [teams, users]);

  const teamNameById = useMemo(() => {
    const map = {};
    teams.forEach((team) => {
      map[team.id] = team.name;
    });
    return map;
  }, [teams]);

  const unassignedUsers = users.filter((user) => user.team_id == null);
  const activeTeam = membersModalTeamId ? teams.find((team) => team.id === membersModalTeamId) : null;

  useEffect(() => {
    if (!activeTeam) {
      setSelectedMemberId("");
      setMemberSearch("");
      setMemberFilter("all");
      setActiveTeamMembersLocal([]);
    }
  }, [activeTeam]);

  useEffect(() => {
    if (!activeTeam) return;
    setActiveTeamMembersLocal(groupedUsers[activeTeam.id] ?? []);
  }, [activeTeam, groupedUsers]);

  useEffect(() => {
    const anyModalOpen = Boolean(showCreateTeamModal || membersModalTeamId || editingTeam);
    if (anyModalOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [showCreateTeamModal, membersModalTeamId, editingTeam]);

  useEffect(() => {
    if (!memberActionFeedback) return undefined;
    const timer = setTimeout(() => setMemberActionFeedback(null), 3000);
    return () => clearTimeout(timer);
  }, [memberActionFeedback]);

  const availableUsersForActiveTeam = useMemo(() => {
    if (!activeTeam) {
      return [];
    }
    const normalizedSearch = memberSearch.trim().toLowerCase();
    return users
      .filter((user) => user.team_id !== activeTeam.id)
      .filter((user) => {
        if (isAdmin) return true;
        if (user.team_id == null) return true;
        return managedTeamIds.includes(user.team_id);
      })
      .filter((user) => {
        if (memberFilter === "unassigned") {
          return user.team_id == null;
        }
        if (memberFilter === "other-teams") {
          return user.team_id != null;
        }
        return true;
      })
      .filter((user) => {
        if (!normalizedSearch) return true;
        return (
          (user.real_name || user.username).toLowerCase().includes(normalizedSearch) ||
          (user.email && user.email.toLowerCase().includes(normalizedSearch))
        );
      })
      .sort((a, b) => (a.real_name || a.username).localeCompare(b.real_name || b.username));
  }, [activeTeam, isAdmin, managedTeamIds, memberFilter, memberSearch, users]);

  const handleDeleteTeam = (team) => {
    if (!isAdmin) return;
    const confirmed = window.confirm(
      t('adminTeams.confirmDeleteTeam', { teamName: team.name })
    );
    if (!confirmed) return;
    if (membersModalTeamId === team.id) {
      setMembersModalTeamId(null);
      setSelectedMemberId("");
    }
    deleteTeamMutation.mutate(team.id);
  };

  const handleRotateCode = (team) => {
    if (!isAdmin) return;
    if (!window.confirm(t('adminTeams.confirmRotateCode', { teamName: team.name }))) {
      return;
    }
    rotateCodeMutation.mutate(team.id);
  };

  const handleOpenEditTeam = (team) => {
    if (!isAdmin) return;
    setEditingTeam(team);
    setEditTeamForm({ name: team.name, description: team.description ?? "" });
  };

  const handleCloseEditTeam = () => {
    setEditingTeam(null);
    setEditTeamForm({ name: "", description: "" });
  };

  const handleSubmitTeamEdit = (event) => {
    event.preventDefault();
    if (!editingTeam) return;
    updateTeamMutation.mutate({
      id: editingTeam.id,
      payload: {
        name: editTeamForm.name,
        description: editTeamForm.description,
      },
    });
  };

  const handleAddMemberToTeam = () => {
    if (!activeTeam || !selectedMemberId) return;
    setMemberActionError(null);
    setMemberActionFeedback(null);
    updateUserMutation.mutate({
      id: Number(selectedMemberId),
      payload: { team_id: activeTeam.id },
      meta: { action: "add", teamId: activeTeam.id },
    });
    setSelectedMemberId("");
  };

  const handleRemoveMember = (userId) => {
    if (!window.confirm(t('adminTeams.confirmRemoveMember'))) {
      return;
    }
    setMemberActionError(null);
    setMemberActionFeedback(null);
    updateUserMutation.mutate({
      id: userId,
      payload: { team_id: null },
      meta: { action: "remove", teamId: activeTeam.id },
    });
  };

  const closeMembersModal = () => {
    setMembersModalTeamId(null);
    setSelectedMemberId("");
    setMemberActionError(null);
    setMemberActionFeedback(null);
    setMemberSearch("");
    setMemberFilter("all");
  };

  const roleLabel = (role) => {
    if (role === "admin") return t('adminTeams.roleAdmin');
    if (role === "group_admin") return t('adminTeams.roleGroupAdmin');
    return t('adminTeams.roleMember');
  };

  const openCreateTeamModal = () => {
    setTeamForm(emptyTeamForm);
    createTeamMutation.reset();
    setShowCreateTeamModal(true);
  };

  const closeCreateTeamModal = () => {
    setTeamForm(emptyTeamForm);
    createTeamMutation.reset();
    setShowCreateTeamModal(false);
  };

  const handleRoleChange = (user, nextRole) => {
    if (!isAdmin) return;
    if (user.id === userId && user.role === "admin" && nextRole !== "admin") {
      window.alert(t('adminTeams.cannotRemoveOwnAdminRole'));
      return;
    }

    const payload = { role: nextRole };
    if (nextRole === "group_admin" && activeTeam) {
      const existing = Array.isArray(user.managed_team_ids)
        ? user.managed_team_ids.map((value) => Number(value))
        : [];
      const nextManaged = new Set(existing);
      nextManaged.add(activeTeam.id);
      payload.managed_team_ids = Array.from(nextManaged);
    }

    updateUserMutation.mutate({ id: user.id, payload });
  };

  return (
    <div className="container px-0">
      <div className="card shadow-sm mt-4">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span>{t('adminTeams.teams')}</span>
          {isAdmin && (
            <button type="button" className="btn btn-primary btn-sm" onClick={openCreateTeamModal}>
              {t('adminTeams.addTeam')}
            </button>
          )}
        </div>
        <div className="card-body">
          {teamsLoading ? (
            <div className="text-center text-muted py-4">{t('adminTeams.loading')}</div>
          ) : teamsError ? (
            <div className="alert alert-danger" role="alert">
              {teamsErr?.response?.data?.detail || t('adminTeams.unableToLoadTeams')}
            </div>
          ) : teams.length === 0 ? (
            <p className="text-muted mb-0">
              {isAdmin ? t('adminTeams.noTeamsYet') : t('adminTeams.noTeamsAssigned')}
            </p>
          ) : (
            <div className="row g-3">
              {teams.map((team) => {
                const members = groupedUsers[team.id] ?? [];
                return (
                  <div key={team.id} className="col-12 col-md-6 col-xl-4">
                    <div className="card h-100 border border-light-subtle">
                      <div className="card-body d-flex flex-column gap-3">
                        <div>
                          <div className="d-flex justify-content-between align-items-start">
                            <h5 className="card-title mb-0">{team.name}</h5>
                            <span className="badge bg-secondary">{t('adminTeams.memberCount', { count: members.length })}</span>
                          </div>
                          {team.description && (
                            <p className="text-muted small mt-2 mb-0">{team.description}</p>
                          )}
                        </div>
                        <div>
                          <span className="fw-semibold">{t('adminTeams.joinCode')}</span>
                          <div className="d-flex align-items-center gap-2 mt-1">
                            <code className="bg-dark text-light px-2 py-1 rounded">{team.join_code}</code>
                            {isAdmin && (
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => handleRotateCode(team)}
                                disabled={rotateCodeMutation.isLoading}
                              >
                                {t('adminTeams.rotate')}
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="mt-auto d-flex gap-2">
                          <button
                            type="button"
                            className="btn btn-outline-primary btn-sm w-100"
                            onClick={() => setMembersModalTeamId(team.id)}
                          >
                            {t('adminTeams.editMembers')}
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn btn-outline-secondary btn-sm"
                              onClick={() => handleOpenEditTeam(team)}
                            >
                              {t('adminTeams.editDetails')}
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn btn-outline-danger btn-sm"
                              onClick={() => handleDeleteTeam(team)}
                              disabled={deleteTeamMutation.isLoading}
                            >
                              {t('adminTeams.delete')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {unassignedUsers.length > 0 && (
        <div className="card shadow-sm mt-4">
          <div className="card-header">{t('adminTeams.unassignedUsers')}</div>
          <div className="card-body">
            <ul className="list-group list-group-flush">
              {unassignedUsers.map((user) => (
                <li key={user.id} className="list-group-item d-flex justify-content-between align-items-center gap-3">
                  <div>
                    <div className="fw-semibold">{user.real_name || user.username}</div>
                    <div className="text-muted small">{user.email}</div>
                  </div>
                  <select
                    className="form-select form-select-sm w-auto"
                    value={user.team_id || ""}
                    onChange={(event) =>
                      updateUserMutation.mutate({
                        id: user.id,
                        payload: {
                          team_id: event.target.value ? Number(event.target.value) : null,
                        },
                      })
                    }
                  >
                    <option value="">{t('adminTeams.noTeam')}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {activeTeam && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog modal-lg" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{t('adminTeams.manageMembers', { teamName: activeTeam.name })}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={closeMembersModal}
                  ></button>
                </div>
                <div className="modal-body">
                  <div className="d-flex flex-wrap gap-2 align-items-center mb-3">
                    <div className="flex-grow-1">
                      <div className="input-group input-group-sm mb-2">
                        <span className="input-group-text">{t('adminTeams.search')}</span>
                        <input
                          type="text"
                          className="form-control"
                          value={memberSearch}
                          onChange={(event) => setMemberSearch(event.target.value)}
                          placeholder={t('adminTeams.usernameOrEmail')}
                        />
                      </div>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text">{t('adminTeams.filter')}</span>
                        <select
                          className="form-select"
                          value={memberFilter}
                          onChange={(event) => setMemberFilter(event.target.value)}
                        >
                          <option value="all">{t('adminTeams.allUsers')}</option>
                          <option value="unassigned">{t('adminTeams.withoutTeam')}</option>
                          <option value="other-teams">{t('adminTeams.otherTeams')}</option>
                        </select>
                      </div>
                    </div>
                    <select
                      className="form-select form-select-sm"
                      style={{ minWidth: "14rem" }}
                      value={selectedMemberId}
                      onChange={(event) => setSelectedMemberId(event.target.value)}
                      disabled={availableUsersForActiveTeam.length === 0}
                    >
                      <option value="">
                        {availableUsersForActiveTeam.length === 0
                          ? t('adminTeams.noUsersAvailable')
                          : t('adminTeams.selectUser')}
                      </option>
                      {availableUsersForActiveTeam.map((user) => (
                        <option key={user.id} value={user.id}>
                          {user.real_name || user.username}
                          {user.team_id
                            ? ` – ${teamNameById[user.team_id] || t('adminTeams.otherTeam')}`
                            : ` – ${t('adminTeams.noTeam')}`}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={!selectedMemberId || updateUserMutation.isLoading}
                      onClick={handleAddMemberToTeam}
                    >
                      {t('adminTeams.add')}
                    </button>
                  </div>
                  {memberActionFeedback && (
                    <div className="alert alert-success" role="alert">
                      {memberActionFeedback}
                    </div>
                  )}
                  {memberActionError && (
                    <div className="alert alert-danger" role="alert">
                      {memberActionError}
                    </div>
                  )}

                  {activeTeamMembersLocal.length === 0 ? (
                    <p className="text-muted mb-0">{t('adminTeams.noMembersYet')}</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm align-middle">
                        <thead className="table-light">
                          <tr>
                            <th>{t('adminTeams.member')}</th>
                            <th>{t('adminTeams.email')}</th>
                            <th>{t('adminTeams.role')}</th>
                            <th className="text-end">{t('adminTeams.actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {activeTeamMembersLocal.map((user) => (
                            <tr key={user.id}>
                              <td>{user.real_name || user.username}</td>
                              <td>{user.email}</td>
                              <td>
                                {isAdmin ? (
                                  (() => {
                                    const isSelfAdmin = user.id === userId && user.role === "admin";
                                    if (isSelfAdmin) {
                                      return (
                                        <span className="badge bg-light text-dark">
                                          {roleLabel(user.role)}
                                        </span>
                                      );
                                    }
                                    return (
                                      <select
                                        className="form-select form-select-sm"
                                        value={user.role}
                                        disabled={updateUserMutation.isLoading}
                                        onChange={(event) =>
                                          handleRoleChange(user, event.target.value)
                                        }
                                      >
                                        <option value="member">{t('adminTeams.roleMember')}</option>
                                        <option value="group_admin">{t('adminTeams.roleGroupAdmin')}</option>
                                        <option value="admin">{t('adminTeams.roleAdmin')}</option>
                                      </select>
                                    );
                                  })()
                                ) : (
                                  <span className="badge bg-light text-dark">
                                    {roleLabel(user.role)}
                                  </span>
                                )}
                              </td>
                              <td className="text-end">
                                <button
                                  type="button"
                                  className="btn btn-outline-secondary btn-sm"
                                  disabled={updateUserMutation.isLoading}
                                  onClick={() => handleRemoveMember(user.id)}
                                >
                                  {t('adminTeams.removeFromTeam')}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={closeMembersModal}
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {editingTeam && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{t('adminTeams.editTeam', { teamName: editingTeam.name })}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={handleCloseEditTeam}
                  ></button>
                </div>
                <form onSubmit={handleSubmitTeamEdit}>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label" htmlFor="edit-team-name">
                        {t('adminTeams.name')}
                      </label>
                      <input
                        id="edit-team-name"
                        className="form-control"
                        value={editTeamForm.name}
                        onChange={(event) =>
                          setEditTeamForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="edit-team-description">
                        {t('adminTeams.description')}
                      </label>
                      <textarea
                        id="edit-team-description"
                        className="form-control"
                        rows={3}
                        value={editTeamForm.description}
                        onChange={(event) =>
                          setEditTeamForm((prev) => ({
                            ...prev,
                            description: event.target.value,
                          }))
                        }
                      ></textarea>
                    </div>
                    {updateTeamMutation.isError && (
                      <div className="alert alert-danger" role="alert">
                        {updateTeamMutation.error?.response?.data?.detail ||
                          t('adminTeams.failedToUpdateTeam')}
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCloseEditTeam}
                      disabled={updateTeamMutation.isLoading}
                    >
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updateTeamMutation.isLoading}
                    >
                      {t('common.save')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {isAdmin && showCreateTeamModal && (
        <>
          <div
            className="modal fade show d-block"
            role="dialog"
            tabIndex="-1"
            onClick={closeCreateTeamModal}
          >
            <div className="modal-dialog" role="document" onClick={(event) => event.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{t('adminTeams.addTeam')}</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeCreateTeamModal}></button>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    createTeamMutation.mutate();
                  }}
                >
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label" htmlFor="create-team-name">
                        {t('adminTeams.name')}
                      </label>
                      <input
                        id="create-team-name"
                        className="form-control"
                        value={teamForm.name}
                        onChange={(event) =>
                          setTeamForm((prev) => ({ ...prev, name: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label" htmlFor="create-team-description">
                        {t('adminTeams.description')}
                      </label>
                      <textarea
                        id="create-team-description"
                        className="form-control"
                        rows={3}
                        value={teamForm.description}
                        onChange={(event) =>
                          setTeamForm((prev) => ({ ...prev, description: event.target.value }))
                        }
                      ></textarea>
                    </div>
                    {createTeamMutation.isError && (
                      <div className="alert alert-danger" role="alert">
                        {createTeamMutation.error?.response?.data?.detail || t('adminTeams.failedToCreateTeam')}
                      </div>
                    )}
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={closeCreateTeamModal}
                      disabled={createTeamMutation.isLoading}
                    >
                      {t('adminTeams.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={createTeamMutation.isLoading}
                    >
                      {t('adminTeams.createTeam')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}
