import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import api from "../../services/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import UserAvatar from "../../components/UserAvatar";
import Alert from "../../components/Alert";
import { useAuth } from "../../providers/AuthProvider";
import { processAvatarFile } from "../../utils/avatar";
import { normalizeUsernameInput, USERNAME_PATTERN } from "../../utils/username";

const STATUS_BADGE = {
  active: "bg-success",
  inactive: "bg-secondary",
  alumni: "bg-info",
};


const emptyProfile = { joined_at: "", member_status: "active" };

function Field({ label, children }) {
  return (
    <div className="mb-3">
      <label className="form-label small fw-semibold mb-1">{label}</label>
      {children}
    </div>
  );
}

Field.propTypes = {
  label: PropTypes.node.isRequired,
  children: PropTypes.node,
};

export default function MemberDetail() {
  const { id } = useParams();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { can, userId } = useAuth();
  const avatarInputRef = useRef(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["members", "detail", id],
    queryFn: async () => {
      const { data } = await api.get(`/members/${id}`);
      return data;
    },
  });

  const { data: account, isError: accountError } = useQuery({
    queryKey: ["members", "account", id],
    queryFn: async () => {
      const { data } = await api.get(`/users/${id}`);
      return data;
    },
    enabled: can("core.users.edit"),
    staleTime: 30_000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["members", "teams"],
    queryFn: async () => {
      try {
        const { data } = await api.get("/teams");
        return data;
      } catch {
        return [];
      }
    },
    staleTime: 60_000,
  });
  const [attendanceOffset, setAttendanceOffset] = useState(0);
  const attendanceQuery = useQuery({
    queryKey: ["members", "attendance", id, attendanceOffset],
    queryFn: async () => (await api.get(`/members/${id}/attendance?limit=10&offset=${attendanceOffset}`)).data,
    enabled: Boolean(id),
    staleTime: 15_000,
  });

  const member = data;
  const [form, setForm] = useState(emptyProfile);
  const [newTag, setNewTag] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [accountForm, setAccountForm] = useState(null);
  const [generatedPassword, setGeneratedPassword] = useState(null);
  const [avatarError, setAvatarError] = useState(null);

  useEffect(() => {
    if (!data) return;
    const profile = data.profile || {};
    setForm({
      ...emptyProfile,
      ...Object.fromEntries(
        Object.entries(emptyProfile).map(([key]) => [key, profile[key] != null ? String(profile[key]) : ""])
      ),
      member_status: profile.member_status || "active",
    });
  }, [data]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    if (!account) return;
    setAccountForm({
      real_name: account.real_name || "",
      username: account.username || "",
      email: account.email || "",
      preferred_language: account.preferred_language || "cs",
      team_id: account.team_id != null ? String(account.team_id) : "",
      is_active: account.is_active !== false,
      role: account.role || "member",
    });
  }, [account]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["members"] });
  };

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const saveMutation = useMutation({
    mutationFn: async ({ profilePayload, accountPayload }) => {
      const requests = [api.put(`/members/${id}`, profilePayload)];
      if (Object.keys(accountPayload).length > 0) {
        requests.push(api.patch(`/users/${id}`, accountPayload));
      }
      await Promise.all(requests);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", "account", id] });
      invalidate();
      setFeedback({ type: "success", message: t("members.saveSuccess") });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: error?.response?.data?.detail || t("members.saveFailed") });
    },
  });

  const passwordMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/users/${id}/generate-password`);
      return data;
    },
    onSuccess: (data) => {
      setGeneratedPassword(data.password);
      setFeedback({ type: "success", message: t("members.passwordGenerated") });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: error?.response?.data?.detail || t("members.passwordGenerateFailed") });
    },
  });

  const deleteAccountMutation = useMutation({
    mutationFn: async () => {
      await api.delete(`/users/${id}`);
    },
    onSuccess: () => {
      invalidate();
      navigate("/admin/core/users");
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: error?.response?.data?.detail || t("members.deleteFailed") });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (avatar) => (await api.patch(`/users/${id}`, { avatar })).data,
    onSuccess: () => {
      setAvatarError(null);
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["members", "account", id] });
      setFeedback({ type: "success", message: t("members.saveSuccess") });
    },
    onError: (error) => setAvatarError(error?.response?.data?.detail || t("members.saveFailed")),
  });

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024 || !file.type.startsWith("image/")) {
      setAvatarError(t("userSettings.photoInvalid"));
      return;
    }
    try {
      avatarMutation.mutate(await processAvatarFile(file));
      setAvatarError(null);
    } catch {
      setAvatarError(t("userSettings.photoInvalid"));
    }
  };

  const accountPayload = () => {
    if (!account || !accountForm) return {};
    const payload = {};
    if (accountForm.real_name.trim() !== (account.real_name || "")) {
      payload.real_name = accountForm.real_name.trim();
    }
    if (accountForm.preferred_language !== (account.preferred_language || "cs")) {
      payload.preferred_language = accountForm.preferred_language || "cs";
    }
    if (accountForm.team_id !== (account.team_id != null ? String(account.team_id) : "")) {
      payload.team_id = accountForm.team_id ? Number(accountForm.team_id) : null;
    }
    if (can("core.users.credentials.manage")) {
      if (accountForm.username.trim() !== (account.username || "")) {
        payload.username = accountForm.username.trim();
      }
      if ((accountForm.email || "").trim() !== (account.email || "")) {
        payload.email = accountForm.email.trim() || null;
      }
      if (accountForm.is_active !== (account.is_active !== false)) {
        payload.is_active = accountForm.is_active;
      }
    }
    if (can("core.access.manage") && accountForm.role !== (account.role || "member")) {
      payload.role = accountForm.role;
    }
    return payload;
  };

  const handleDeleteAccount = () => {
    if (Number(id) === Number(userId)) {
      setFeedback({ type: "warning", message: t("members.cannotDeleteOwn") });
      return;
    }
    if (window.confirm(t("members.deleteAccountConfirm", { name: member.real_name }))) {
      deleteAccountMutation.mutate();
    }
  };

  const tagMutation = useMutation({
    mutationFn: async (action) => {
      if (action.type === "add") {
        const { data } = await api.post(`/members/${id}/tags`, { tag: newTag });
        return data;
      }
      const { data } = await api.delete(`/members/${id}/tags/${encodeURIComponent(action.tag)}`);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setNewTag("");
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (action) => {
      if (action.type === "add") return (await api.post(`/members/${id}/notes`, { content: noteContent })).data;
      return (await api.delete(`/members/${id}/notes/${action.noteId}`)).data;
    },
    onSuccess: () => { invalidate(); setNoteContent(""); },
  });


  const handleSave = () => {
    const profilePayload = {};
    Object.entries(form).forEach(([key, value]) => {
      if (value === "") {
        profilePayload[key] = null;
      } else {
        profilePayload[key] = value;
      }
    });
    const nextAccountPayload = accountPayload();
    if (Object.keys(nextAccountPayload).length === 0 && !can("core.users.edit")) {
      const unchangedProfile = Object.entries(profilePayload).every(([key, value]) => value === (member.profile?.[key] ?? null));
      if (unchangedProfile) {
        setFeedback({ type: "info", message: t("members.nothingToUpdate") });
        return;
      }
    }
    saveMutation.mutate({ profilePayload, accountPayload: nextAccountPayload });
  };


  if (isLoading) {
    return (
      <div className="container py-4">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !member) {
    return (
      <div className="container py-5 text-center text-muted">
        <i className="fas fa-ghost fs-2 mb-3 d-block opacity-50"></i>
        {t("members.notFound")}
      </div>
    );
  }

  const canEditAvatar = Number(id) === Number(userId) || can("core.avatar.manage");

  return (
    <>
      <div className="member-detail-header d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <Link to="/admin/core/users" className="btn btn-sm btn-outline-secondary">
          <i className="fas fa-arrow-left me-1"></i>
          {t("members.backToDirectory")}
        </Link>
        <div className="member-detail-identity d-flex align-items-center gap-2">
          <div className="member-detail-avatar position-relative">
            <UserAvatar user={member} size={112} fallbackClass="bg-primary" className="member-detail-avatar__image" />
            {canEditAvatar && <><input ref={avatarInputRef} type="file" accept="image/*" className="d-none" onChange={handleAvatarFile} /><button type="button" className="member-avatar-upload-button position-absolute bottom-0 end-0" title={t("userSettings.uploadPhoto")} aria-label={t("userSettings.uploadPhoto")} onClick={() => avatarInputRef.current?.click()}><i className="fas fa-camera" /></button></>}
          </div>
          <div>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <h1 className="h4 mb-0">{member.real_name}</h1>
              <span className={`badge ${STATUS_BADGE[member.profile?.member_status || "active"] || "bg-secondary"}`}>
                {t(`members.status${member.profile?.member_status === "alumni" ? "Alumni" : member.profile?.member_status === "inactive" ? "Inactive" : "Active"}`)}
              </span>
            </div>
            <div className="text-muted small">
              {member.team_name || t("members.noTeam")} · @{member.username}
            </div>
          </div>
        </div>
        <div className="member-detail-save d-flex align-items-start">
          <button type="button" className="btn btn-primary" disabled={saveMutation.isPending} onClick={handleSave}>
            {saveMutation.isPending ? <span className="spinner-border spinner-border-sm me-1"></span> : <i className="fas fa-save me-1"></i>}
            {t("members.save")}
          </button>
        </div>
      </div>

      {feedback && <Alert type={feedback.type} toast onDismiss={() => setFeedback(null)}>{feedback.message}</Alert>}
      {avatarError && <div className="alert alert-danger py-2">{avatarError}</div>}

      <div className="row g-4">
        <div className="col-lg-7">
          {can("core.users.edit") && (
            <div>
              <div className="card shadow-sm mb-4">
                <div className="card-header bg-white fw-semibold">
                  <i className="fas fa-user-gear me-2 text-primary"></i>
                  {t("members.account")}
                </div>
                <div className="card-body">
                  {accountError ? (
                    <div className="alert alert-danger py-2 mb-0">{t("members.accountLoadFailed")}</div>
                  ) : accountForm && (
                    <div className="row g-3">
                      <div className="col-md-6">
                        <Field label={t("members.parentName")}>
                          <input type="text" className="form-control" value={accountForm.real_name} onChange={(e) => setAccountForm((f) => ({ ...f, real_name: e.target.value }))} />
                        </Field>
                      </div>
                      {can("core.users.credentials.manage") ? (
                        <>
                          <div className="col-md-6">
                            <Field label={t("members.username")}>
                              <input type="text" className="form-control" value={accountForm.username} pattern={USERNAME_PATTERN} title={t("userSettings.usernameHelp")} onChange={(e) => setAccountForm((f) => ({ ...f, username: normalizeUsernameInput(e.target.value) }))} />
                              <div className="form-text">{t("userSettings.usernameHelp")}</div>
                            </Field>
                          </div>
                          <div className="col-md-6">
                            <Field label={t("members.email")}>
                              <input type="email" className="form-control" value={accountForm.email} onChange={(e) => setAccountForm((f) => ({ ...f, email: e.target.value }))} />
                            </Field>
                          </div>
                          <div className="col-md-6 d-flex align-items-end">
                            <div className="form-check form-switch mb-3">
                              <input
                                type="checkbox"
                                className="form-check-input"
                                id="account-active"
                                checked={accountForm.is_active}
                                onChange={(e) => setAccountForm((f) => ({ ...f, is_active: e.target.checked }))}
                              />
                              <label className="form-check-label" htmlFor="account-active">{t("members.isActive")}</label>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="col-md-6 d-flex align-items-center">
                          <div className="text-muted small">
                            <i className="fas fa-lock me-1"></i>
                            {t("members.credentialsRestricted")}
                          </div>
                        </div>
                      )}
                      <div className="col-md-6">
                        <Field label={t("members.team")}>
                          <select className="form-select" value={accountForm.team_id} onChange={(e) => setAccountForm((f) => ({ ...f, team_id: e.target.value }))}>
                            <option value="">—</option>
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>{team.name}</option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <div className="col-md-6">
                        <Field label={t("members.language")}>
                          <select className="form-select" value={accountForm.preferred_language} onChange={(e) => setAccountForm((f) => ({ ...f, preferred_language: e.target.value }))}>
                            <option value="cs">Čeština</option>
                            <option value="en">English</option>
                          </select>
                        </Field>
                      </div>
                      {account.role && (
                        <div className="col-md-6">
                          <Field label={t("members.role")}>
                            {can("core.access.manage") ? <select className="form-select" value={accountForm.role} onChange={(e) => setAccountForm((f) => ({ ...f, role: e.target.value }))}>
                      <option value="member">{t("adminUsers.roleMember")}</option>
                      <option value="group_admin">{t("adminUsers.roleGroupAdmin")}</option>
                      <option value="admin">{t("adminUsers.roleAdmin")}</option>
                            </select> : <input type="text" className="form-control" value={account.role.replace("_", " ")} disabled />}
                          </Field>
                        </div>
                      )}
                      {account.managed_team_ids?.length > 0 && (
                        <div className="col-12">
                          <Field label={t("members.managedTeams")}>
                            <div className="d-flex flex-wrap gap-1">
                              {account.managed_team_ids.map((teamIdValue) => (
                                <span key={teamIdValue} className="badge text-bg-light border">
                                  {teams.find((team) => team.id === teamIdValue)?.name || teamIdValue}
                                </span>
                              ))}
                            </div>
                          </Field>
                        </div>
                      )}
                      {account.needs_password_change && (
                        <div className="col-12">
                          <div className="alert alert-warning py-2 mb-0">
                            <i className="fas fa-key me-1"></i>
                            {t("members.needsPasswordChange")}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="card-footer bg-white d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <button
                    type="button"
                    className="btn btn-outline-primary btn-sm"
                    disabled={Number(id) === Number(userId) || passwordMutation.isPending}
                    onClick={() => passwordMutation.mutate()}
                  >
                    <i className="fas fa-key me-1"></i>
                    {t("members.generatePassword")}
                  </button>
                  {generatedPassword && (
                    <code className="text-success">
                      <i className="fas fa-lock-open me-1"></i>
                      {t("members.generatedPassword")}: {generatedPassword}
                    </code>
                  )}
                </div>
              </div>
            </div>
          )}
          <div>
            <div className="card shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold d-flex justify-content-between align-items-center gap-2">
                <span><i className="fas fa-id-card me-2 text-primary"></i>{t("members.memberProfile")}</span>
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <Field label={t("members.memberStatus")}>
                      <select className="form-select" value={form.member_status} onChange={setField("member_status")}>
                        <option value="active">{t("members.statusActive")}</option>
                        <option value="inactive">{t("members.statusInactive")}</option>
                        <option value="alumni">{t("members.statusAlumni")}</option>
                      </select>
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field label={t("members.joinedAt")}>
                      <input type="date" className="form-control" value={form.joined_at} onChange={setField("joined_at")} />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {can("core.users.delete") && (
            <div className="card shadow-sm mb-4 border-danger-subtle">
              <div className="card-header bg-white fw-semibold text-danger">
                <i className="fas fa-user-minus me-2"></i>
                {t("members.dangerZone")}
              </div>
              <div className="card-body d-flex justify-content-between align-items-center gap-2">
                <span className="text-muted small">{t("members.deleteAccountHint")}</span>
                <button
                  type="button"
                  className="btn btn-outline-danger"
                  disabled={deleteAccountMutation.isPending}
                  onClick={handleDeleteAccount}
                >
                  {deleteAccountMutation.isPending ? <span className="spinner-border spinner-border-sm me-2"></span> : <i className="fas fa-trash me-2"></i>}
                  {t("members.deleteAccount")}
                </button>
              </div>
            </div>
          )}

          <section className="card shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold"><i className="fas fa-calendar-check me-2 text-primary" />{t("members.attendance")}</div>
            {attendanceQuery.isLoading ? <div className="card-body"><LoadingSpinner /></div> : <>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0"><thead><tr><th>{t("calendar.title")}</th><th>{t("calendar.startsAt")}</th><th>{t("calendar.status")}</th></tr></thead><tbody>
                  {(attendanceQuery.data?.items || []).map((entry) => <tr key={entry.event_id}><td>{entry.title}<div className="small text-muted">{entry.kind === "meeting" ? t("members.meeting") : t("members.event")}</div></td><td className="text-muted small">{entry.starts_at ? new Date(entry.starts_at).toLocaleDateString() : "—"}</td><td><span className={`badge ${entry.status === "present" ? "bg-success" : entry.status === "excused" ? "bg-warning text-dark" : entry.status === "not_recorded" ? "bg-light text-dark border" : "bg-secondary"}`}>{entry.status === "not_recorded" ? t("members.notRecorded") : t(`calendar.${entry.status}`, entry.status)}</span></td></tr>)}
                  {!attendanceQuery.data?.items?.length && <tr><td colSpan="3" className="text-muted text-center py-3">{t("members.noAttendance")}</td></tr>}
                </tbody></table>
              </div>
              {(attendanceQuery.data?.total || 0) > 10 && <div className="card-footer d-flex justify-content-between"><button type="button" className="btn btn-sm btn-outline-secondary" disabled={attendanceOffset === 0} onClick={() => setAttendanceOffset((value) => Math.max(0, value - 10))}>{t("members.prev")}</button><button type="button" className="btn btn-sm btn-outline-secondary" disabled={attendanceOffset + 10 >= attendanceQuery.data.total} onClick={() => setAttendanceOffset((value) => value + 10)}>{t("members.next")}</button></div>}
            </>}
          </section>
        </div>

        <div className="col-lg-5">
          <div className="card shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">
              <i className="fas fa-tags me-2 text-primary"></i>
              {t("members.tags")}
            </div>
            <div className="card-body">
              {member.tags?.length ? (
                <div className="d-flex flex-wrap gap-2 mb-3">
                  {member.tags.map((tag) => (
                    <span key={tag} className="badge text-bg-light border d-inline-flex align-items-center gap-2">
                      {tag}
                      <button
                        type="button"
                        className="btn btn-sm btn-link text-danger p-0 border-0 lh-1"
                        onClick={() => tagMutation.mutate({ type: "remove", tag })}
                        aria-label={t("members.deleteTag")}
                      >
                        <i className="fas fa-xmark"></i>
                      </button>
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-muted small">{t("members.noTags")}</p>
              )}
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder={t("members.tagPlaceholder")}
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && newTag.trim() && tagMutation.mutate({ type: "add" })}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!newTag.trim() || tagMutation.isPending}
                  onClick={() => tagMutation.mutate({ type: "add" })}
                >
                  <i className="fas fa-plus"></i>
                </button>
              </div>
            </div>
          </div>

          <div className="card shadow-sm">
            <div className="card-header bg-white fw-semibold">
              <i className="fas fa-message me-2 text-primary"></i>
              {t("members.memberNotes")}
            </div>
            <div className="card-body">
              {member.notes?.length ? (
                <ul className="list-unstyled mb-3 d-flex flex-column gap-2">
                  {member.notes.map((note) => (
                    <li key={note.id} className="border rounded p-2">
                      <div className="d-flex justify-content-between align-items-start gap-2">
                        <div className="small">{note.content}</div>
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger border-0 flex-shrink-0"
                          onClick={() => {
                            if (window.confirm(t("members.deleteNoteConfirm"))) {
                              noteMutation.mutate({ type: "remove", noteId: note.id });
                            }
                          }}
                        >
                          <i className="fas fa-trash"></i>
                        </button>
                      </div>
                      <div className="text-muted" style={{ fontSize: "0.75rem" }}>
                        {note.author_name || "—"}
                        {note.created_at ? ` · ${new Date(note.created_at).toLocaleDateString()}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted small">{t("members.noNotes")}</p>
              )}
              <div className="input-group">
                <textarea
                  className="form-control"
                  rows="2"
                  placeholder={t("members.notePlaceholder")}
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                />
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!noteContent.trim() || noteMutation.isPending}
                  onClick={() => noteMutation.mutate({ type: "add" })}
                >
                  <i className="fas fa-plus"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
