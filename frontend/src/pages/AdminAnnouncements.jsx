import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

const initialCreateScope = (isAdmin) => (isAdmin ? "global" : "team");

export default function AdminAnnouncements() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAdmin, managedTeamIds, canManageUsers } = useAuth();

  const [feedback, setFeedback] = useState(null);
  const [createForm, setCreateForm] = useState(() => ({
    title: "",
    body: "",
    scope: initialCreateScope(isAdmin),
    teamId: "",
  }));
  const [editingMessage, setEditingMessage] = useState(null);
  const [editForm, setEditForm] = useState({
    title: "",
    body: "",
    scope: initialCreateScope(isAdmin),
    teamId: "",
  });

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const { data: teams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ["admin", "teams", "for-announcements"],
    queryFn: async () => {
      const { data } = await api.get("/teams");
      return data;
    },
    enabled: canManageUsers,
    staleTime: 30_000,
  });

  const { data: dashboardMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["admin", "dashboard-messages"],
    queryFn: async () => {
      const { data } = await api.get("/dashboard-messages/manage");
      return data;
    },
    enabled: canManageUsers,
  });

  const managedTeams = useMemo(() => {
    if (isAdmin) return teams;
    return teams.filter((team) => managedTeamIds.includes(team.id));
  }, [isAdmin, managedTeamIds, teams]);

  useEffect(() => {
    setCreateForm((prev) => ({
      ...prev,
      scope: initialCreateScope(isAdmin),
    }));
  }, [isAdmin]);

  useEffect(() => {
    if (createForm.scope === "team" && !createForm.teamId && managedTeams.length > 0) {
      setCreateForm((prev) => ({ ...prev, teamId: String(managedTeams[0].id) }));
    }
  }, [createForm.scope, managedTeams]);

  useEffect(() => {
    if (!editingMessage) {
      setEditForm({
        title: "",
        body: "",
        scope: initialCreateScope(isAdmin),
        teamId: "",
      });
      return;
    }

    setEditForm({
      title: editingMessage.title || "",
      body: editingMessage.body || "",
      scope: editingMessage.team_id ? "team" : initialCreateScope(isAdmin),
      teamId: editingMessage.team_id ? String(editingMessage.team_id) : "",
    });
  }, [editingMessage, isAdmin]);

  const teamOptions = managedTeams.map((team) => ({
    value: String(team.id),
    label: team.name,
  }));

  const createMessageMutation = useMutation({
    mutationFn: async (payload) => api.post("/dashboard-messages", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-messages"] });
      setCreateForm({
        title: "",
        body: "",
        scope: initialCreateScope(isAdmin),
        teamId: managedTeams.length > 0 ? String(managedTeams[0].id) : "",
      });
      setFeedback({ type: "success", message: t('adminAnnouncements.announcementPublished') });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t('adminAnnouncements.failedToPublish'),
      });
    },
  });

  const updateMessageMutation = useMutation({
    mutationFn: async ({ messageId, payload }) =>
      api.patch(`/dashboard-messages/${messageId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-messages"] });
      setEditingMessage(null);
      setFeedback({ type: "success", message: t('adminAnnouncements.announcementUpdated') });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t('adminAnnouncements.failedToUpdate'),
      });
    },
  });

  const deleteMessageMutation = useMutation({
    mutationFn: async (messageId) => api.delete(`/dashboard-messages/${messageId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-messages"] });
      setFeedback({ type: "success", message: t('adminAnnouncements.announcementRemoved') });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t('adminAnnouncements.failedToRemove'),
      });
    },
  });

  if (!canManageUsers) {
    return <div className="alert alert-danger">{t('adminAnnouncements.noAccess')}</div>;
  }

  const handleCreateSubmit = (event) => {
    event.preventDefault();
    const trimmedBody = createForm.body.trim();
    const trimmedTitle = createForm.title.trim();

    if (!trimmedBody) {
      setFeedback({ type: "warning", message: t('adminAnnouncements.messageBodyRequired') });
      return;
    }

    let teamId = null;
    if (createForm.scope === "team") {
      if (!createForm.teamId) {
        setFeedback({ type: "warning", message: t('adminAnnouncements.selectTeam') });
        return;
      }
      teamId = Number(createForm.teamId);
    }

    const payload = {
      title: trimmedTitle || null,
      body: trimmedBody,
      team_id: teamId,
    };

    createMessageMutation.mutate(payload);
  };

  const handleEditSubmit = (event) => {
    event.preventDefault();
    if (!editingMessage) return;

    const trimmedBody = editForm.body.trim();
    const trimmedTitle = editForm.title.trim();
    const payload = {};

    if (!trimmedBody) {
      setFeedback({ type: "warning", message: t('adminAnnouncements.messageBodyRequired') });
      return;
    }

    if (trimmedBody !== (editingMessage.body || "")) {
      payload.body = trimmedBody;
    }

    if (trimmedTitle !== (editingMessage.title || "")) {
      payload.title = trimmedTitle || null;
    }

    if (isAdmin) {
      if (editForm.scope === "global" && editingMessage.team_id !== null) {
        payload.team_id = null;
      } else if (editForm.scope === "team") {
        if (!editForm.teamId) {
          setFeedback({ type: "warning", message: t('adminAnnouncements.selectTeam') });
          return;
        }
        const nextTeamId = Number(editForm.teamId);
        if (editingMessage.team_id !== nextTeamId) {
          payload.team_id = nextTeamId;
        }
      }
    } else if (editForm.teamId) {
      const nextTeamId = Number(editForm.teamId);
      if (editingMessage.team_id !== nextTeamId) {
        payload.team_id = nextTeamId;
      }
    }

    if (Object.keys(payload).length === 0) {
      setFeedback({ type: "info", message: t('adminAnnouncements.nothingToUpdate') });
      return;
    }

    updateMessageMutation.mutate({ messageId: editingMessage.id, payload });
  };

  const handleDeleteMessage = (messageId) => {
    if (!window.confirm(t('adminAnnouncements.confirmDelete'))) {
      return;
    }
    deleteMessageMutation.mutate(messageId);
  };

  const handleStartEdit = (message) => {
    setEditingMessage(message);
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
  };

  const renderScopeBadge = (message) => {
    if (!message.team_id) {
      return <span className="badge bg-primary">{t('adminAnnouncements.global')}</span>;
    }
    return <span className="badge bg-secondary">{t('adminAnnouncements.team')}</span>;
  };

  return (
    <div className="container px-0">
      {feedback && (
        <div className={`alert alert-${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <div className="row g-4">
        <div className="col-12 col-xl-5">
          <div className="card shadow-sm h-100">
            <div className="card-header">{t('adminAnnouncements.createAnnouncement')}</div>
            <div className="card-body">
              <form className="row g-3" onSubmit={handleCreateSubmit}>
                <div className="col-12">
                  <label className="form-label">{t('adminAnnouncements.title')}</label>
                  <input
                    className="form-control"
                    value={createForm.title}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, title: event.target.value }))
                    }
                    placeholder={t('adminAnnouncements.optionalHeadline')}
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">{t('adminAnnouncements.message')}</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={createForm.body}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, body: event.target.value }))
                    }
                    required
                  />
                </div>
                {isAdmin && (
                  <div className="col-12">
                    <label className="form-label">{t('adminAnnouncements.audience')}</label>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        id="create-scope-global"
                        name="create-scope"
                        checked={createForm.scope === "global"}
                        onChange={() => setCreateForm((prev) => ({ ...prev, scope: "global" }))}
                      />
                      <label className="form-check-label" htmlFor="create-scope-global">
                        {t('adminAnnouncements.globalAllTeams')}
                      </label>
                    </div>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="radio"
                        id="create-scope-team"
                        name="create-scope"
                        checked={createForm.scope === "team"}
                        onChange={() => setCreateForm((prev) => ({ ...prev, scope: "team" }))}
                      />
                      <label className="form-check-label" htmlFor="create-scope-team">
                        {t('adminAnnouncements.specificTeam')}
                      </label>
                    </div>
                  </div>
                )}
                {createForm.scope === "team" && (
                  <div className="col-12">
                    <label className="form-label">{t('adminAnnouncements.team')}</label>
                    <select
                      className="form-select"
                      value={createForm.teamId}
                      onChange={(event) =>
                        setCreateForm((prev) => ({ ...prev, teamId: event.target.value }))
                      }
                      disabled={teamsLoading || managedTeams.length === 0}
                    >
                      <option value="" disabled>
                        {managedTeams.length === 0 ? t('adminAnnouncements.noAvailableTeams') : t('adminAnnouncements.selectTeam')}
                      </option>
                      {teamOptions.map((team) => (
                        <option key={team.value} value={team.value}>
                          {team.label}
                        </option>
                      ))}
                    </select>
                    {managedTeams.length === 0 && (
                      <div className="form-text text-danger">
                        {t('adminAnnouncements.assignManagedTeam')}
                      </div>
                    )}
                  </div>
                )}
                <div className="col-12 d-flex justify-content-end gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-secondary"
                    onClick={() =>
                      setCreateForm({
                        title: "",
                        body: "",
                        scope: initialCreateScope(isAdmin),
                        teamId: managedTeams.length > 0 ? String(managedTeams[0].id) : "",
                      })
                    }
                    disabled={createMessageMutation.isLoading}
                  >
                    {t('adminAnnouncements.clear')}
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createMessageMutation.isLoading}
                  >
                    {t('adminAnnouncements.publish')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {editingMessage && (
          <div className="col-12 col-xl-5">
            <div className="card shadow-sm h-100">
              <div className="card-header d-flex justify-content-between align-items-center">
                <span>{t('adminAnnouncements.editAnnouncement')}</span>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={handleCancelEdit}>
                  {t('adminAnnouncements.cancel')}
                </button>
              </div>
              <div className="card-body">
                <form className="row g-3" onSubmit={handleEditSubmit}>
                  <div className="col-12">
                    <label className="form-label">{t('adminAnnouncements.title')}</label>
                    <input
                      className="form-control"
                      value={editForm.title}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, title: event.target.value }))
                      }
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">{t('adminAnnouncements.message')}</label>
                    <textarea
                      className="form-control"
                      rows={4}
                      value={editForm.body}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, body: event.target.value }))
                      }
                      required
                    />
                  </div>
                  {isAdmin && (
                    <div className="col-12">
                      <label className="form-label">{t('adminAnnouncements.audience')}</label>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          id="edit-scope-global"
                          name="edit-scope"
                          checked={editForm.scope === "global"}
                          onChange={() => setEditForm((prev) => ({ ...prev, scope: "global" }))}
                        />
                        <label className="form-check-label" htmlFor="edit-scope-global">
                          {t('adminAnnouncements.globalAllTeams')}
                        </label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="radio"
                          id="edit-scope-team"
                          name="edit-scope"
                          checked={editForm.scope === "team"}
                          onChange={() => setEditForm((prev) => ({ ...prev, scope: "team" }))}
                        />
                        <label className="form-check-label" htmlFor="edit-scope-team">
                          {t('adminAnnouncements.specificTeam')}
                        </label>
                      </div>
                    </div>
                  )}
                  {(editForm.scope === "team" || !isAdmin) && (
                    <div className="col-12">
                      <label className="form-label">{t('adminAnnouncements.team')}</label>
                      <select
                        className="form-select"
                        value={editForm.teamId}
                        onChange={(event) =>
                          setEditForm((prev) => ({ ...prev, teamId: event.target.value }))
                        }
                        disabled={teamsLoading || managedTeams.length === 0}
                      >
                        <option value="" disabled>
                          {managedTeams.length === 0 ? t('adminAnnouncements.noAvailableTeams') : t('adminAnnouncements.selectTeam')}
                        </option>
                        {teamOptions.map((team) => (
                          <option key={team.value} value={team.value}>
                            {team.label}
                          </option>
                        ))}
                      </select>
                      {managedTeams.length === 0 && (
                        <div className="form-text text-danger">
                          Assign a managed team before editing team announcements.
                        </div>
                      )}
                    </div>
                  )}
                  <div className="col-12 d-flex justify-content-end gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={handleCancelEdit}
                      disabled={updateMessageMutation.isLoading}
                    >
                      {t('adminAnnouncements.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updateMessageMutation.isLoading}
                    >
                      {t('adminAnnouncements.save')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        <div className="col-12">
          <div className="card shadow-sm">
            <div className="card-header">{t('adminAnnouncements.announcements')}</div>
            <div className="card-body p-0">
              {messagesLoading ? (
                <div className="text-center text-muted py-3">{t('adminAnnouncements.loading')}</div>
              ) : dashboardMessages.length === 0 ? (
                <p className="text-muted px-3 py-2 mb-0">{t('adminAnnouncements.noAnnouncementsYet')}</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-sm align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th style={{ width: "6rem" }}>{t('adminAnnouncements.type')}</th>
                        <th>{t('adminAnnouncements.title')}</th>
                        <th>{t('adminAnnouncements.body')}</th>
                        <th>{t('adminAnnouncements.team')}</th>
                        <th>{t('adminAnnouncements.created')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardMessages.map((message) => (
                        <tr key={message.id}>
                          <td>{renderScopeBadge(message)}</td>
                          <td>{message.title || <span className="text-muted">—</span>}</td>
                          <td>{message.body}</td>
                          <td>{message.team_name || t('adminAnnouncements.all')}</td>
                          <td>{new Date(message.created_at).toLocaleString()}</td>
                          <td className="text-end">
                            <div className="btn-group btn-group-sm" role="group">
                              <button
                                type="button"
                                className="btn btn-outline-primary"
                                onClick={() => handleStartEdit(message)}
                                disabled={updateMessageMutation.isLoading}
                              >
                                {t('common.edit')}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-danger"
                                onClick={() => handleDeleteMessage(message.id)}
                                disabled={deleteMessageMutation.isLoading}
                              >
                                {t('common.delete')}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
