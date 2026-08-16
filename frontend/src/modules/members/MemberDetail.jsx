import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import api from "../../services/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import UserAvatar from "../../components/UserAvatar";
import { useAuth } from "../../providers/AuthProvider";

const STATUS_BADGE = {
  active: "bg-success",
  inactive: "bg-secondary",
  alumni: "bg-info",
};

const RELATIONSHIP_TYPE_LABEL = {
  parent: "members.relParent",
  guardian: "members.relGuardian",
  sibling: "members.relSibling",
  other: "members.relOther",
};

const emptyProfile = {
  phone: "",
  birth_date: "",
  gender: "",
  address: "",
  city: "",
  zip: "",
  parent_name: "",
  parent_phone: "",
  parent_email: "",
  emergency_name: "",
  emergency_phone: "",
  joined_at: "",
  member_status: "active",
  medical_note: "",
  uniform_size: "",
  scout_number: "",
  data_consent_at: "",
  photo_consent_at: "",
  notes: "",
};

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

  const { data: directory = { items: [] } } = useQuery({
    queryKey: ["members", "options"],
    queryFn: async () => {
      const { data } = await api.get("/members?limit=1000");
      return data;
    },
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

  const member = data;
  const [form, setForm] = useState(emptyProfile);
  const [newTag, setNewTag] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [relMemberId, setRelMemberId] = useState("");
  const [relType, setRelType] = useState("parent");
  const [relNote, setRelNote] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [accountForm, setAccountForm] = useState(null);
  const [generatedPassword, setGeneratedPassword] = useState(null);

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
    });
  }, [account]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["members"] });
  };

  const setField = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.put(`/members/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setFeedback({ type: "success", message: t("members.saveSuccess") });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: error?.response?.data?.detail || t("members.saveFailed") });
    },
  });

  const accountMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.patch(`/users/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["members", "account", id] });
      invalidate();
      setFeedback({ type: "success", message: t("members.accountSaved") });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: error?.response?.data?.detail || t("members.accountSaveFailed") });
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

  const handleSaveAccount = (e) => {
    e.preventDefault();
    if (!account) return;
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
    if (Object.keys(payload).length === 0) {
      setFeedback({ type: "info", message: t("members.nothingToUpdate") });
      return;
    }
    accountMutation.mutate(payload);
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

  const relMutation = useMutation({
    mutationFn: async (action) => {
      if (action.type === "add") {
        const { data } = await api.post(`/members/${id}/relationships`, {
          related_user_id: Number(relMemberId),
          type: relType,
          note: relNote || null,
        });
        return data;
      }
      const { data } = await api.delete(`/members/${id}/relationships/${action.relId}`);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setRelMemberId("");
      setRelNote("");
    },
  });

  const noteMutation = useMutation({
    mutationFn: async (action) => {
      if (action.type === "add") {
        const { data } = await api.post(`/members/${id}/notes`, { content: noteContent });
        return data;
      }
      const { data } = await api.delete(`/members/${id}/notes/${action.noteId}`);
      return data;
    },
    onSuccess: () => {
      invalidate();
      setNoteContent("");
    },
  });

  const handleSave = (e) => {
    e.preventDefault();
    const payload = {};
    Object.entries(form).forEach(([key, value]) => {
      if (value === "") {
        payload[key] = null;
      } else {
        payload[key] = value;
      }
    });
    if (!payload.gender) payload.gender = null;
    saveMutation.mutate(payload);
  };

  const candidateOptions = useMemo(
    () =>
      directory.items
        .filter((item) => item.id !== Number(id))
        .map((item) => ({ id: item.id, name: item.real_name, team: item.team_name || "" })),
    [directory.items, id]
  );

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

  const activity = member.activity || {};
  const activityCards = [
    { icon: "fa-calendar-check", label: t("members.attendanceCount"), value: activity.attendance_count ?? 0, badge: "bg-primary" },
    { icon: "fa-list-check", label: t("members.completionCount"), value: activity.completion_count ?? 0, badge: "bg-success" },
    { icon: "fa-trophy", label: t("members.totalPoints"), value: activity.total_points ?? 0, badge: "bg-warning" },
  ];

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <Link to="/admin/core/users" className="btn btn-sm btn-outline-secondary">
          <i className="fas fa-arrow-left me-1"></i>
          {t("members.backToDirectory")}
        </Link>
        <div className="d-flex align-items-center gap-2">
          <UserAvatar user={member} size={42} fallbackClass="bg-primary" />
          <div>
            <h1 className="h4 mb-0">{member.real_name}</h1>
            <div className="text-muted small">
              {member.team_name || t("members.noTeam")} · @{member.username}
            </div>
          </div>
        </div>
        <span className={`badge ${STATUS_BADGE[member.profile?.member_status || "active"] || "bg-secondary"} fs-6 px-3 py-2`}>
          {t(`members.status${member.profile?.member_status === "alumni" ? "Alumni" : member.profile?.member_status === "inactive" ? "Inactive" : "Active"}`)}
        </span>
      </div>

      {feedback && <div className={`alert alert-${feedback.type} py-2`}>{feedback.message}</div>}

      <div className="row g-3 mb-4">
        {activityCards.map((card) => (
          <div className="col-4" key={card.label}>
            <div className="card shadow-sm h-100">
              <div className="card-body d-flex align-items-center gap-3">
                <span className={`${card.badge} badge rounded-pill p-3`}>
                  <i className={`fas ${card.icon} fs-5`}></i>
                </span>
                <div>
                  <div className="fs-4 fw-bold">{card.value}</div>
                  <div className="text-muted small">{card.label}</div>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        <div className="col-lg-7">
          {can("core.users.edit") && (
            <form onSubmit={handleSaveAccount}>
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
                              <input type="text" className="form-control" value={accountForm.username} onChange={(e) => setAccountForm((f) => ({ ...f, username: e.target.value }))} />
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
                            <input type="text" className="form-control" value={account.role.replace("_", " ")} disabled />
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
                  <button type="submit" className="btn btn-primary btn-sm" disabled={accountMutation.isPending}>
                    {accountMutation.isPending ? <span className="spinner-border spinner-border-sm me-1"></span> : null}
                    {t("members.saveAccount")}
                  </button>
                </div>
              </div>
            </form>
          )}
          <form onSubmit={handleSave}>
            <div className="card shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">
                <i className="fas fa-id-card me-2 text-primary"></i>
                {t("members.memberProfile")}
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <Field label={t("members.phone")}>
                      <input type="tel" className="form-control" value={form.phone} onChange={setField("phone")} />
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field label={t("members.birthDate")}>
                      <input type="date" className="form-control" value={form.birth_date} onChange={setField("birth_date")} />
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field label={t("members.gender")}>
                      <select className="form-select" value={form.gender} onChange={setField("gender")}>
                        <option value="">—</option>
                        <option value="male">{t("members.genderMale")}</option>
                        <option value="female">{t("members.genderFemale")}</option>
                        <option value="other">{t("members.genderOther")}</option>
                      </select>
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field label={t("members.uniformSize")}>
                      <input type="text" className="form-control" value={form.uniform_size} onChange={setField("uniform_size")} />
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field label={t("members.scoutNumber")}>
                      <input type="text" className="form-control" value={form.scout_number} onChange={setField("scout_number")} />
                    </Field>
                  </div>
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
                  <div className="col-12">
                    <Field label={t("members.address")}>
                      <input type="text" className="form-control" value={form.address} onChange={setField("address")} />
                    </Field>
                  </div>
                  <div className="col-md-8">
                    <Field label={t("members.city")}>
                      <input type="text" className="form-control" value={form.city} onChange={setField("city")} />
                    </Field>
                  </div>
                  <div className="col-md-4">
                    <Field label={t("members.zip")}>
                      <input type="text" className="form-control" value={form.zip} onChange={setField("zip")} />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">
                <i className="fas fa-people-roof me-2 text-primary"></i>
                {t("members.parent")}
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <Field label={t("members.parentName")}>
                      <input type="text" className="form-control" value={form.parent_name} onChange={setField("parent_name")} />
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field label={t("members.parentPhone")}>
                      <input type="tel" className="form-control" value={form.parent_phone} onChange={setField("parent_phone")} />
                    </Field>
                  </div>
                  <div className="col-12">
                    <Field label={t("members.parentEmail")}>
                      <input type="email" className="form-control" value={form.parent_email} onChange={setField("parent_email")} />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">
                <i className="fas fa-briefcase-medical me-2 text-primary"></i>
                {t("members.emergency")}
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <Field label={t("members.emergencyName")}>
                      <input type="text" className="form-control" value={form.emergency_name} onChange={setField("emergency_name")} />
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field label={t("members.emergencyPhone")}>
                      <input type="tel" className="form-control" value={form.emergency_phone} onChange={setField("emergency_phone")} />
                    </Field>
                  </div>
                  <div className="col-12">
                    <Field label={t("members.medicalNote")}>
                      <textarea className="form-control" rows="2" value={form.medical_note} onChange={setField("medical_note")} />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">
                <i className="fas fa-file-shield me-2 text-primary"></i>
                {t("members.consents")}
              </div>
              <div className="card-body">
                <div className="row g-3">
                  <div className="col-md-6">
                    <Field label={t("members.dataConsentAt")}>
                      <input type="date" className="form-control" value={form.data_consent_at} onChange={setField("data_consent_at")} />
                    </Field>
                  </div>
                  <div className="col-md-6">
                    <Field label={t("members.photoConsentAt")}>
                      <input type="date" className="form-control" value={form.photo_consent_at} onChange={setField("photo_consent_at")} />
                    </Field>
                  </div>
                </div>
              </div>
            </div>

            <div className="card shadow-sm mb-4">
              <div className="card-header bg-white fw-semibold">
                <i className="fas fa-note-sticky me-2 text-primary"></i>
                {t("members.notes")}
              </div>
              <div className="card-body">
                <textarea className="form-control" rows="3" value={form.notes} onChange={setField("notes")} />
              </div>
            </div>

            <div className="d-flex justify-content-end mb-4">
              <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <span className="spinner-border spinner-border-sm me-2"></span>
                ) : (
                  <i className="fas fa-save me-2"></i>
                )}
                {t("members.save")}
              </button>
            </div>
          </form>

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

          <div className="card shadow-sm mb-4">
            <div className="card-header bg-white fw-semibold">
              <i className="fas fa-people-arrows me-2 text-primary"></i>
              {t("members.relationships")}
            </div>
            <div className="card-body">
              {member.relationships?.length ? (
                <ul className="list-unstyled mb-3 d-flex flex-column gap-2">
                  {member.relationships.map((rel) => (
                    <li key={rel.id} className="d-flex justify-content-between align-items-center border rounded p-2">
                      <div>
                        <div className="fw-semibold">{rel.related_user.real_name}</div>
                        <div className="text-muted small">
                          {t(RELATIONSHIP_TYPE_LABEL[rel.type] || "members.relOther")}
                          {rel.related_user.team_name ? ` · ${rel.related_user.team_name}` : ""}
                          {rel.note ? ` — ${rel.note}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-danger border-0"
                        onClick={() => {
                          if (window.confirm(t("members.deleteRelationshipConfirm"))) {
                            relMutation.mutate({ type: "remove", relId: rel.id });
                          }
                        }}
                      >
                        <i className="fas fa-trash"></i>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted small">{t("members.noRelationships")}</p>
              )}
              <div className="border-top pt-3">
                <select className="form-select mb-2" value={relMemberId} onChange={(e) => setRelMemberId(e.target.value)}>
                  <option value="">{t("members.selectMember")}</option>
                  {candidateOptions.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                      {option.team ? ` (${option.team})` : ""}
                    </option>
                  ))}
                </select>
                <div className="row g-2">
                  <div className="col-6">
                    <select className="form-select" value={relType} onChange={(e) => setRelType(e.target.value)}>
                      <option value="parent">{t("members.relParent")}</option>
                      <option value="guardian">{t("members.relGuardian")}</option>
                      <option value="sibling">{t("members.relSibling")}</option>
                      <option value="other">{t("members.relOther")}</option>
                    </select>
                  </div>
                  <div className="col-6">
                    <input
                      type="text"
                      className="form-control"
                      placeholder={t("members.relationshipNote")}
                      value={relNote}
                      onChange={(e) => setRelNote(e.target.value)}
                    />
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-primary w-100 mt-2"
                  disabled={!relMemberId || relMutation.isPending}
                  onClick={() => relMutation.mutate({ type: "add" })}
                >
                  <i className="fas fa-plus me-2"></i>
                  {t("members.addRelationship")}
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
