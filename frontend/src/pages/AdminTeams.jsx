import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import Button from "../components/Button";
import MemberSearchPicker from "../components/MemberSearchPicker";
import AdminPageHeader from "../modules/web/admin/AdminPageHeader";

const LOGO_SIZE = 256;

const processLogoFile = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        try {
          const side = Math.min(image.width, image.height);
          const sx = (image.width - side) / 2;
          const sy = (image.height - side) / 2;
          const canvas = document.createElement("canvas");
          canvas.width = LOGO_SIZE;
          canvas.height = LOGO_SIZE;
          const ctx = canvas.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(image, sx, sy, side, side, 0, 0, LOGO_SIZE, LOGO_SIZE);
          resolve(canvas.toDataURL("image/png"));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error("image-load-failed"));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("file-read-failed"));
    reader.readAsDataURL(file);
  });

const teamInitials = (name) =>
  (name || "?")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();

function TeamLogo({ team, size = 56, className = "" }) {
  const style = {
    width: size,
    height: size,
    fontSize: Math.max(12, Math.round(size * 0.34)),
    backgroundColor: "#0f766e",
  };
  if (team.logo) {
    return (
      <img
        src={team.logo}
        alt={team.name}
        className={`rounded-circle object-fit-cover flex-shrink-0 ${className}`}
        style={style}
      />
    );
  }
  return (
    <span
      className={`rounded-circle d-flex align-items-center justify-content-center flex-shrink-0 text-white ${className}`}
      style={style}
    >
      {teamInitials(team.name)}
    </span>
  );
}
TeamLogo.propTypes = {
  team: PropTypes.object,
  size: PropTypes.number,
  className: PropTypes.string,
};

const emptyTeamForm = { name: "", description: "", logo: null };

export default function AdminTeams() {
  const { t } = useTranslation();
  const { isAdmin, managedTeamIds, userId, can } = useAuth();
  const canManageTeams = can("core.teams.manage");
  const queryClient = useQueryClient();
  const [teamForm, setTeamForm] = useState(emptyTeamForm);
  const [membersModalTeamId, setMembersModalTeamId] = useState(null);
  const [editingTeam, setEditingTeam] = useState(null);
  const [editTeamForm, setEditTeamForm] = useState({ name: "", description: "", logo: null });
  const [selectedMemberId, setSelectedMemberId] = useState("");
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const [logoError, setLogoError] = useState(null);
  const createLogoInputRef = useRef(null);
  const editLogoInputRef = useRef(null);

  const { data: teams = [], isLoading: teamsLoading, isError: teamsError, error: teamsErr } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: async () => {
      const { data } = await api.get("/teams");
      return data;
    },
    enabled: canManageTeams,
    staleTime: 30_000,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data } = await api.get("/users");
      return data;
    },
    enabled: canManageTeams,
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



  const unassignedUsers = users.filter((user) => user.team_id == null);
  const activeTeam = membersModalTeamId ? teams.find((team) => team.id === membersModalTeamId) : null;

  useEffect(() => {
    if (!activeTeam) {
      setSelectedMemberId("");
      setMemberSearch("");
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
        if (!normalizedSearch) return true;
        return (
          (user.real_name || user.username).toLowerCase().includes(normalizedSearch) ||
          (user.email && user.email.toLowerCase().includes(normalizedSearch))
        );
      })
      .sort((a, b) => (a.real_name || a.username).localeCompare(b.real_name || b.username));
  }, [activeTeam, isAdmin, managedTeamIds, memberSearch, users]);

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
    setEditTeamForm({ name: team.name, description: team.description ?? "", logo: team.logo ?? null });
    setLogoError(null);
  };

  const handleCloseEditTeam = () => {
    setEditingTeam(null);
    setEditTeamForm({ name: "", description: "", logo: null });
    setLogoError(null);
  };

  const handleLogoFile = (event, target) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setLogoError(t("adminTeams.logoTooLarge"));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setLogoError(t("adminTeams.logoInvalid"));
      return;
    }
    processLogoFile(file)
      .then((dataUrl) => {
        if (target === "create") {
          setTeamForm((prev) => ({ ...prev, logo: dataUrl }));
        } else {
          setEditTeamForm((prev) => ({ ...prev, logo: dataUrl }));
        }
        setLogoError(null);
      })
      .catch(() => setLogoError(t("adminTeams.logoInvalid")));
  };

  const handleSubmitTeamEdit = (event) => {
    event.preventDefault();
    if (!editingTeam) return;
    updateTeamMutation.mutate({
      id: editingTeam.id,
      payload: {
        name: editTeamForm.name,
        description: editTeamForm.description,
        logo: editTeamForm.logo ?? null,
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
  };

  const roleLabel = (role) => {
    if (role === "admin") return t('adminTeams.roleAdmin');
    if (role === "group_admin") return t('adminTeams.roleGroupAdmin');
    return t('adminTeams.roleMember');
  };

  const openCreateTeamModal = () => {
    setTeamForm(emptyTeamForm);
    createTeamMutation.reset();
    setLogoError(null);
    setShowCreateTeamModal(true);
  };

  const closeCreateTeamModal = () => {
    setTeamForm(emptyTeamForm);
    createTeamMutation.reset();
    setLogoError(null);
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
    <div className="admin-teams-page">
      <AdminPageHeader
        title={t("adminTeams.title")}
        description={t("adminTeams.subtitle")}
        action={isAdmin && (
          <Button variant="primary" icon="fas fa-plus" onClick={openCreateTeamModal}>
            {t("adminTeams.addTeam")}
          </Button>
        )}
      />

      <section className="admin-teams-overview" aria-label={t("adminTeams.title")}>
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
                    <article className="card admin-team-card h-100">
                      <div className="card-body">
                        <div className="admin-team-card__header">
                          <div className="d-flex align-items-center gap-2 min-w-0">
                              <TeamLogo team={team} size={48} />
                              <h2 className="admin-team-card__title">{team.name}</h2>
                          </div>
                          <span className="admin-team-card__count">{t('adminTeams.memberCount', { count: members.length })}</span>
                        </div>
                        {team.description && <p className="admin-team-card__description">{team.description}</p>}
                        <div className="admin-team-card__code">
                          <span>{t('adminTeams.joinCode')}</span>
                          <div>
                            <code>{team.join_code}</code>
                            {isAdmin && (
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => handleRotateCode(team)}
                                disabled={rotateCodeMutation.isLoading}
                              >
                                <i className="fas fa-rotate" aria-hidden="true"></i>
                                <span>{t('adminTeams.rotate')}</span>
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="admin-team-card__actions">
                          <button
                            type="button"
                            className="btn btn-outline-primary"
                            onClick={() => setMembersModalTeamId(team.id)}
                          >
                            <i className="fas fa-users" aria-hidden="true"></i>
                            {t('adminTeams.editMembers')}
                          </button>
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn btn-outline-secondary admin-team-card__icon-action"
                              title={t('adminTeams.editDetails')}
                              aria-label={`${t('adminTeams.editDetails')}: ${team.name}`}
                              onClick={() => handleOpenEditTeam(team)}
                            >
                              <i className="fas fa-pen" aria-hidden="true"></i>
                            </button>
                          )}
                          {isAdmin && (
                            <button
                              type="button"
                              className="btn btn-outline-danger admin-team-card__icon-action"
                              title={t('adminTeams.delete')}
                              aria-label={`${t('adminTeams.delete')}: ${team.name}`}
                              onClick={() => handleDeleteTeam(team)}
                              disabled={deleteTeamMutation.isLoading}
                            >
                              <i className="fas fa-trash" aria-hidden="true"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  </div>
                );
              })}
            </div>
          )}
      </section>

      {unassignedUsers.length > 0 && (
        <section className="card admin-unassigned-users mt-4" aria-labelledby="unassigned-users-heading">
          <div className="card-header" id="unassigned-users-heading">{t('adminTeams.unassignedUsers')}</div>
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
        </section>
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
                      <MemberSearchPicker
                        value={memberSearch}
                        onChange={setMemberSearch}
                        users={availableUsersForActiveTeam}
                        selectedId={selectedMemberId}
                        onSelect={(user) => {
                          setSelectedMemberId(String(user.id));
                          setMemberSearch(user.real_name || user.username || "");
                        }}
                        disabled={updateUserMutation.isLoading}
                        placeholder="Pište jméno nebo e-mail člena…"
                      />
                    </div>
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
                    <div className="d-flex align-items-center gap-3 mb-3">
                      <TeamLogo team={{ name: editTeamForm.name, logo: editTeamForm.logo }} size={72} />
                      <div>
                        <input
                          ref={editLogoInputRef}
                          type="file"
                          accept="image/*"
                          className="d-none"
                          onChange={(event) => handleLogoFile(event, "edit")}
                        />
                        <Button
                          type="button"
                          variant="outline-success"
                          size="sm"
                          icon="fas fa-upload"
                          onClick={() => editLogoInputRef.current?.click()}
                        >
                          {t("adminTeams.uploadLogo")}
                        </Button>
                        {editTeamForm.logo && (
                          <Button
                            type="button"
                            variant="outline-danger"
                            size="sm"
                            icon="fas fa-trash"
                            className="ms-2"
                            onClick={() => setEditTeamForm((prev) => ({ ...prev, logo: null }))}
                          >
                            {t("adminTeams.removeLogo")}
                          </Button>
                        )}
                        <div className="form-text">{t("adminTeams.logoHint")}</div>
                        {logoError && <div className="alert alert-danger py-2 mt-2 mb-0">{logoError}</div>}
                      </div>
                    </div>
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
                    <div className="d-flex align-items-center gap-3 mb-3">
                      <TeamLogo team={{ name: teamForm.name, logo: teamForm.logo }} size={72} />
                      <div>
                        <input
                          ref={createLogoInputRef}
                          type="file"
                          accept="image/*"
                          className="d-none"
                          onChange={(event) => handleLogoFile(event, "create")}
                        />
                        <Button
                          type="button"
                          variant="outline-success"
                          size="sm"
                          icon="fas fa-upload"
                          onClick={() => createLogoInputRef.current?.click()}
                        >
                          {t("adminTeams.uploadLogo")}
                        </Button>
                        {teamForm.logo && (
                          <Button
                            type="button"
                            variant="outline-danger"
                            size="sm"
                            icon="fas fa-trash"
                            className="ms-2"
                            onClick={() => setTeamForm((prev) => ({ ...prev, logo: null }))}
                          >
                            {t("adminTeams.removeLogo")}
                          </Button>
                        )}
                        <div className="form-text">{t("adminTeams.logoHint")}</div>
                        {logoError && <div className="alert alert-danger py-2 mt-2 mb-0">{logoError}</div>}
                      </div>
                    </div>
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
