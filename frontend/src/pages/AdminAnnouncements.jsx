import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { formatDateToLocal } from "../utils/dateUtils";
import AdminPageHeader from "../modules/web/admin/AdminPageHeader";
import Alert from "../components/Alert";
import Modal from "../components/Modal";
import AdminPanel from "../components/AdminPanel";

const initialCreateScope = (isAdmin) => (isAdmin ? "global" : "team");

export default function AdminAnnouncements() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAdmin, managedTeamIds, canManageUsers } = useAuth();

  const [feedback, setFeedback] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
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
      const { data } = await api.get("/announcements/manage");
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
    mutationFn: async (payload) => api.post("/announcements", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "dashboard-messages"] });
      setCreateForm({
        title: "",
        body: "",
        scope: initialCreateScope(isAdmin),
        teamId: managedTeams.length > 0 ? String(managedTeams[0].id) : "",
      });
      setIsCreateOpen(false);
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
      api.patch(`/announcements/${messageId}`, payload),
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
    mutationFn: async (messageId) => api.delete(`/announcements/${messageId}`),
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
    <div className="admin-announcements-page">
      <AdminPageHeader
        title={t("adminAnnouncements.pageTitle")}
        description={t("adminAnnouncements.subtitle")}
        action={(
          <button type="button" className="btn btn-primary" onClick={() => setIsCreateOpen(true)}>
            <i className="fas fa-plus me-2" aria-hidden="true" />
            {t('adminAnnouncements.createAnnouncement')}
          </button>
        )}
      />

      {feedback && <Alert type={feedback.type} toast onDismiss={() => setFeedback(null)}>{feedback.message}</Alert>}

      <AdminPanel title={t('adminAnnouncements.announcements')} className="admin-announcements-table" bodyClassName="p-0">
          {messagesLoading ? (
            <div className="text-center text-muted py-3">{t('adminAnnouncements.loading')}</div>
          ) : dashboardMessages.length === 0 ? (
            <p className="text-muted px-3 py-2 mb-0">{t('adminAnnouncements.noAnnouncementsYet')}</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0 admin-announcements-table__table">
                <thead className="table-light">
                  <tr>
                    <th style={{ width: "6rem" }}>{t('adminAnnouncements.type')}</th>
                    <th>{t('adminAnnouncements.title')}</th>
                    <th>{t('adminAnnouncements.body')}</th>
                    <th>{t('adminAnnouncements.team')}</th>
                    <th>{t('adminAnnouncements.created')}</th>
                    <th><span className="visually-hidden">{t('common.actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {dashboardMessages.map((message) => (
                    <tr key={message.id}>
                      <td>{renderScopeBadge(message)}</td>
                      <td>{message.title || <span className="text-muted">—</span>}</td>
                      <td className="admin-announcements-table__body">{message.body}</td>
                      <td>{message.team_name || t('adminAnnouncements.all')}</td>
                      <td>{formatDateToLocal(message.created_at)}</td>
                      <td className="text-end">
                        <div className="btn-group btn-group-sm" role="group">
                          <button type="button" className="btn btn-outline-primary" onClick={() => handleStartEdit(message)} disabled={updateMessageMutation.isLoading}>{t('common.edit')}</button>
                          <button type="button" className="btn btn-outline-danger" onClick={() => handleDeleteMessage(message.id)} disabled={deleteMessageMutation.isLoading}>{t('common.delete')}</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </AdminPanel>

      <Modal
        isVisible={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title={t('adminAnnouncements.createAnnouncement')}
        icon={<i className="fas fa-bullhorn" />}
        size="lg"
        footer={<AnnouncementModalActions formId="create-announcement" cancelLabel={t('adminAnnouncements.clear')} submitLabel={t('adminAnnouncements.publish')} loading={createMessageMutation.isLoading} onCancel={() => setCreateForm({ title: "", body: "", scope: initialCreateScope(isAdmin), teamId: managedTeams.length > 0 ? String(managedTeams[0].id) : "" })} />}
      >
        <AnnouncementForm id="create-announcement" form={createForm} setForm={setCreateForm} isAdmin={isAdmin} teams={teamOptions} teamsLoading={teamsLoading} managedTeams={managedTeams} onSubmit={handleCreateSubmit} t={t} />
      </Modal>

      <Modal
        isVisible={Boolean(editingMessage)}
        onClose={handleCancelEdit}
        title={t('adminAnnouncements.editAnnouncement')}
        icon={<i className="fas fa-pen" />}
        size="lg"
        footer={<AnnouncementModalActions formId="edit-announcement" cancelLabel={t('adminAnnouncements.cancel')} submitLabel={t('adminAnnouncements.save')} loading={updateMessageMutation.isLoading} onCancel={handleCancelEdit} />}
      >
        <AnnouncementForm id="edit-announcement" form={editForm} setForm={setEditForm} isAdmin={isAdmin} teams={teamOptions} teamsLoading={teamsLoading} managedTeams={managedTeams} onSubmit={handleEditSubmit} t={t} />
      </Modal>
    </div>
  );
}

function AnnouncementModalActions({ formId, cancelLabel, submitLabel, loading, onCancel }) {
  return (
    <>
      <button type="button" className="btn btn-outline-secondary" onClick={onCancel} disabled={loading}>{cancelLabel}</button>
      <button type="submit" form={formId} className="btn btn-primary" disabled={loading}>{submitLabel}</button>
    </>
  );
}

function AnnouncementForm({ id, form, setForm, isAdmin, teams, teamsLoading, managedTeams, onSubmit, t }) {
  const requiresTeam = form.scope === "team" || !isAdmin;
  return (
    <form id={id} className="row g-3" onSubmit={onSubmit}>
      <div className="col-12">
        <label className="form-label" htmlFor={`${id}-title`}>{t('adminAnnouncements.title')}</label>
        <input id={`${id}-title`} className="form-control" value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} placeholder={t('adminAnnouncements.optionalHeadline')} />
      </div>
      <div className="col-12">
        <label className="form-label" htmlFor={`${id}-body`}>{t('adminAnnouncements.message')}</label>
        <textarea id={`${id}-body`} className="form-control" rows={5} value={form.body} onChange={(event) => setForm((prev) => ({ ...prev, body: event.target.value }))} required />
      </div>
      {isAdmin && (
        <fieldset className="col-12">
          <legend className="form-label">{t('adminAnnouncements.audience')}</legend>
          <div className="form-check"><input className="form-check-input" type="radio" id={`${id}-scope-global`} name={`${id}-scope`} checked={form.scope === "global"} onChange={() => setForm((prev) => ({ ...prev, scope: "global" }))} /><label className="form-check-label" htmlFor={`${id}-scope-global`}>{t('adminAnnouncements.globalAllTeams')}</label></div>
          <div className="form-check"><input className="form-check-input" type="radio" id={`${id}-scope-team`} name={`${id}-scope`} checked={form.scope === "team"} onChange={() => setForm((prev) => ({ ...prev, scope: "team" }))} /><label className="form-check-label" htmlFor={`${id}-scope-team`}>{t('adminAnnouncements.specificTeam')}</label></div>
        </fieldset>
      )}
      {requiresTeam && (
        <div className="col-12">
          <label className="form-label" htmlFor={`${id}-team`}>{t('adminAnnouncements.team')}</label>
          <select id={`${id}-team`} className="form-select" value={form.teamId} onChange={(event) => setForm((prev) => ({ ...prev, teamId: event.target.value }))} disabled={teamsLoading || managedTeams.length === 0}>
            <option value="" disabled>{managedTeams.length === 0 ? t('adminAnnouncements.noAvailableTeams') : t('adminAnnouncements.selectTeam')}</option>
            {teams.map((team) => <option key={team.value} value={team.value}>{team.label}</option>)}
          </select>
          {managedTeams.length === 0 && <div className="form-text text-danger">{t('adminAnnouncements.assignManagedTeam')}</div>}
        </div>
      )}
    </form>
  );
}

AnnouncementModalActions.propTypes = {
  formId: PropTypes.string.isRequired,
  cancelLabel: PropTypes.string.isRequired,
  submitLabel: PropTypes.string.isRequired,
  loading: PropTypes.bool,
  onCancel: PropTypes.func.isRequired,
};

AnnouncementForm.propTypes = {
  id: PropTypes.string.isRequired,
  form: PropTypes.shape({
    title: PropTypes.string.isRequired,
    body: PropTypes.string.isRequired,
    scope: PropTypes.string.isRequired,
    teamId: PropTypes.string.isRequired,
  }).isRequired,
  setForm: PropTypes.func.isRequired,
  isAdmin: PropTypes.bool.isRequired,
  teams: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })).isRequired,
  teamsLoading: PropTypes.bool,
  managedTeams: PropTypes.array.isRequired,
  onSubmit: PropTypes.func.isRequired,
  t: PropTypes.func.isRequired,
};
