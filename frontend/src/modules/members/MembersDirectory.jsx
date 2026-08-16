import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../../services/api";
import LoadingSpinner from "../../components/LoadingSpinner";
import UserAvatar from "../../components/UserAvatar";
import Modal from "../../components/Modal";
import { useAuth } from "../../providers/AuthProvider";

const PAGE_SIZE = 50;

const STATUS_BADGE = {
  active: "bg-success",
  inactive: "bg-secondary",
  alumni: "bg-info",
};

const emptyCreateForm = {
  realName: "",
  username: "",
  email: "",
  password: "",
  preferredLanguage: "cs",
  teamId: "",
};

export default function MembersDirectory() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState("");
  const [tag, setTag] = useState("");
  const [page, setPage] = useState(0);
  const [feedback, setFeedback] = useState(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [createError, setCreateError] = useState(null);

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkForm, setBulkForm] = useState({ names: "", teamId: "", preferredLanguage: "cs" });
  const [bulkResults, setBulkResults] = useState(null);
  const [bulkError, setBulkError] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

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

  const params = useMemo(() => {
    const p = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (query) p.set("search", query);
    if (teamId) p.set("team_id", teamId);
    if (status) p.set("status", status);
    if (tag) p.set("tag", tag);
    return p.toString();
  }, [query, teamId, status, tag, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["members", "directory", params],
    queryFn: async () => {
      const { data } = await api.get(`/members?${params}`);
      return data;
    },
    staleTime: 10_000,
  });

  const { data: stats } = useQuery({
    queryKey: ["members", "stats"],
    queryFn: async () => {
      const { data } = await api.get("/members/stats");
      return data;
    },
    staleTime: 30_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post("/users", payload);
      return data;
    },
    onSuccess: () => {
      invalidateMembers();
      setShowCreateModal(false);
      setCreateForm(emptyCreateForm);
      setFeedback({ type: "success", message: t("members.createSuccess") });
    },
    onError: (error) => {
      setCreateError(error?.response?.data?.detail || t("members.createFailed"));
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post("/users/bulk-register", payload);
      return data;
    },
    onSuccess: (data) => {
      invalidateMembers();
      setShowBulkModal(false);
      setBulkForm({ names: "", teamId: "", preferredLanguage: "cs" });
      setBulkResults(data);
    },
    onError: (error) => {
      setBulkError(error?.response?.data?.detail || t("members.bulkFailed"));
    },
  });

  const invalidateMembers = () => {
    queryClient.invalidateQueries({ queryKey: ["members"] });
  };

  const items = data?.items || [];
  const total = data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const filterTeams = useMemo(() => {
    const map = new Map();
    items.forEach((member) => {
      if (member.team_id) map.set(member.team_id, member.team_name || "");
    });
    return [...map.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [items]);

  const submitFilters = () => {
    setQuery(search.trim());
    setPage(0);
  };

  const resetFilters = () => {
    setSearch("");
    setQuery("");
    setTeamId("");
    setStatus("");
    setTag("");
    setPage(0);
  };

  const handleCreate = (e) => {
    e.preventDefault();
    const payload = {
      username: createForm.username.trim(),
      real_name: createForm.realName.trim(),
      email: createForm.email.trim() || null,
      password: createForm.password,
      preferred_language: createForm.preferredLanguage || "cs",
      team_id: createForm.teamId ? Number(createForm.teamId) : null,
    };
    createMutation.mutate(payload);
  };

  const handleBulkSubmit = (e) => {
    e.preventDefault();
    const names = bulkForm.names
      .split("\n")
      .map((name) => name.trim())
      .filter(Boolean);
    if (names.length === 0) {
      setBulkError(t("members.bulkNoNames"));
      return;
    }
    bulkMutation.mutate({
      names,
      team_id: bulkForm.teamId ? Number(bulkForm.teamId) : null,
      preferred_language: bulkForm.preferredLanguage || "cs",
    });
  };

  const exportCsv = async () => {
    try {
      const filterParams = new URLSearchParams();
      if (query) filterParams.set("search", query);
      if (teamId) filterParams.set("team_id", teamId);
      if (status) filterParams.set("status", status);
      if (tag) filterParams.set("tag", tag);
      const { data: blob } = await api.get(`/members/export.csv?${filterParams.toString()}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "clenove.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setFeedback({ type: "danger", message: t("members.exportFailed") });
    }
  };

  const statsCards = [
    { key: "total", icon: "fa-users", label: t("members.total"), value: stats?.total ?? 0, badge: "bg-primary" },
    { key: "active", icon: "fa-user-check", label: t("members.statusActive"), value: stats?.by_status?.active ?? 0, badge: "bg-success" },
    { key: "inactive", icon: "fa-user-slash", label: t("members.statusInactive"), value: stats?.by_status?.inactive ?? 0, badge: "bg-secondary" },
    { key: "alumni", icon: "fa-user-graduate", label: t("members.statusAlumni"), value: stats?.by_status?.alumni ?? 0, badge: "bg-info" },
  ];

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div>
          <h1 className="h3 mb-0">
            <i className="fas fa-address-book me-2 text-primary"></i>
            {t("members.title")}
          </h1>
          <p className="text-muted mb-0 small">{t("members.subtitle")}</p>
        </div>
        <div className="d-flex flex-wrap gap-2">
          {can("core.users.create") && (
            <>
              <button type="button" className="btn btn-outline-primary" onClick={() => setShowBulkModal(true)}>
                <i className="fas fa-list-check me-2"></i>
                {t("members.bulkRegisterTitle")}
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
                <i className="fas fa-user-plus me-2"></i>
                {t("members.newMember")}
              </button>
            </>
          )}
          <button type="button" className="btn btn-outline-secondary" onClick={exportCsv}>
            <i className="fas fa-file-csv me-2"></i>
            {t("members.export")}
          </button>
        </div>
      </div>

      {feedback && <div className={`alert alert-${feedback.type} py-2`}>{feedback.message}</div>}

      <div className="row g-3 mb-4">
        {statsCards.map((card) => (
          <div className="col-6 col-xl-3" key={card.key}>
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

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-2 align-items-end">
            <div className="col-12 col-md-4">
              <label className="form-label small mb-1">{t("members.search")}</label>
              <div className="input-group">
                <input
                  type="text"
                  className="form-control"
                  placeholder={t("members.searchPlaceholder")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitFilters()}
                />
                <button type="button" className="btn btn-primary" onClick={submitFilters}>
                  <i className="fas fa-magnifying-glass"></i>
                </button>
              </div>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1">{t("members.team")}</label>
              <select className="form-select" value={teamId} onChange={(e) => { setTeamId(e.target.value); setPage(0); }}>
                <option value="">{t("members.allTeams")}</option>
                {filterTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div className="col-6 col-md-3">
              <label className="form-label small mb-1">{t("members.status")}</label>
              <select className="form-select" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
                <option value="">{t("members.allStatuses")}</option>
                <option value="active">{t("members.statusActive")}</option>
                <option value="inactive">{t("members.statusInactive")}</option>
                <option value="alumni">{t("members.statusAlumni")}</option>
              </select>
            </div>
            <div className="col-6 col-md-2">
              <label className="form-label small mb-1">{t("members.tags")}</label>
              <input
                type="text"
                className="form-control"
                placeholder={t("members.tagPlaceholder")}
                value={tag}
                onChange={(e) => { setTag(e.target.value); setPage(0); }}
              />
            </div>
            {(query || teamId || status || tag) && (
              <div className="col-12 d-flex justify-content-end">
                <button type="button" className="btn btn-link btn-sm text-muted" onClick={resetFilters}>
                  <i className="fas fa-rotate-left me-1"></i>
                  {t("members.resetFilters")}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="d-flex justify-content-between align-items-center mb-2">
        <small className="text-muted">
          {t("members.showing", { count: Math.min(total, PAGE_SIZE), total })}
        </small>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : items.length === 0 ? (
        <div className="text-center text-muted py-5">
          <i className="fas fa-users-slash fs-1 mb-3 d-block opacity-25"></i>
          {t("members.noMembers")}
        </div>
      ) : (
        <div className="card shadow-sm">
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead>
                <tr>
                  <th>{t("members.name")}</th>
                  <th>{t("members.team")}</th>
                  <th>{t("members.status")}</th>
                  <th>{t("members.email")}</th>
                  <th>{t("members.phone")}</th>
                  <th>{t("members.age")}</th>
                  <th>{t("members.memberSince")}</th>
                  <th>{t("members.tags")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((member) => (
                  <tr key={member.id}>
                    <td>
                      <Link
                        to={`/admin/core/users/${member.id}`}
                        className="text-decoration-none d-flex align-items-center gap-2"
                      >
                        <UserAvatar
                          user={member}
                          size={34}
                          fallbackClass="bg-primary"
                        />
                        <span className="fw-semibold text-body">{member.real_name}</span>
                      </Link>
                    </td>
                    <td>{member.team_name || <span className="text-muted">—</span>}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[member.member_status] || "bg-secondary"}`}>
                        {t(`members.status${member.member_status === "alumni" ? "Alumni" : member.member_status === "inactive" ? "Inactive" : "Active"}`)}
                      </span>
                    </td>
                    <td>{member.email ? <a className="text-decoration-none" href={`mailto:${member.email}`}>{member.email}</a> : <span className="text-muted">—</span>}</td>
                    <td>{member.phone || <span className="text-muted">—</span>}</td>
                    <td>{member.age != null ? member.age : <span className="text-muted">—</span>}</td>
                    <td>{member.joined_at || <span className="text-muted">—</span>}</td>
                    <td>
                      {member.tags?.length ? (
                        <div className="d-flex flex-wrap gap-1">
                          {member.tags.slice(0, 3).map((tagValue) => (
                            <span key={tagValue} className="badge text-bg-light border">{tagValue}</span>
                          ))}
                          {member.tags.length > 3 && (
                            <span className="badge text-bg-secondary">+{member.tags.length - 3}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="card-footer d-flex justify-content-between align-items-center">
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={page === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <i className="fas fa-chevron-left me-1"></i>
              {t("members.prev")}
            </button>
            <span className="text-muted small">{t("members.page", { page: page + 1, pages: totalPages })}</span>
            <button
              type="button"
              className="btn btn-outline-secondary btn-sm"
              disabled={page + 1 >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t("members.next")}
              <i className="fas fa-chevron-right ms-1"></i>
            </button>
          </div>
        </div>
      )}

      <Modal
        isVisible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={t("members.createMemberTitle")}
        icon="➕"
        size="lg"
      >
        <form onSubmit={handleCreate}>
          {createError && <div className="alert alert-danger py-2">{createError}</div>}
          <div className="row g-3">
            <div className="col-md-6">
              <label className="form-label small fw-semibold mb-1">{t("members.parentName")}</label>
              <input
                type="text"
                className="form-control"
                value={createForm.realName}
                onChange={(e) => setCreateForm((f) => ({ ...f, realName: e.target.value }))}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold mb-1">{t("members.username")}</label>
              <input
                type="text"
                className="form-control"
                value={createForm.username}
                onChange={(e) => setCreateForm((f) => ({ ...f, username: e.target.value }))}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold mb-1">{t("members.email")}</label>
              <input
                type="email"
                className="form-control"
                value={createForm.email}
                onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold mb-1">{t("members.password")}</label>
              <input
                type="password"
                className="form-control"
                value={createForm.password}
                onChange={(e) => setCreateForm((f) => ({ ...f, password: e.target.value }))}
                minLength={8}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold mb-1">{t("members.team")}</label>
              <select
                className="form-select"
                value={createForm.teamId}
                onChange={(e) => setCreateForm((f) => ({ ...f, teamId: e.target.value }))}
              >
                <option value="">—</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold mb-1">{t("members.language")}</label>
              <select
                className="form-select"
                value={createForm.preferredLanguage}
                onChange={(e) => setCreateForm((f) => ({ ...f, preferredLanguage: e.target.value }))}
              >
                <option value="cs">Čeština</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-4">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setShowCreateModal(false)}>
              {t("members.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
              {createMutation.isPending ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
              {t("members.createMember")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isVisible={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        title={t("members.bulkRegisterTitle")}
        subtitle={t("members.bulkRegisterHint")}
        icon="📋"
        size="lg"
      >
        <form onSubmit={handleBulkSubmit}>
          {bulkError && <div className="alert alert-danger py-2">{bulkError}</div>}
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small fw-semibold mb-1">{t("members.bulkNames")}</label>
              <textarea
                className="form-control"
                rows="6"
                value={bulkForm.names}
                onChange={(e) => setBulkForm((f) => ({ ...f, names: e.target.value }))}
                placeholder={t("members.bulkNamesPlaceholder")}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold mb-1">{t("members.team")}</label>
              <select
                className="form-select"
                value={bulkForm.teamId}
                onChange={(e) => setBulkForm((f) => ({ ...f, teamId: e.target.value }))}
              >
                <option value="">—</option>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold mb-1">{t("members.language")}</label>
              <select
                className="form-select"
                value={bulkForm.preferredLanguage}
                onChange={(e) => setBulkForm((f) => ({ ...f, preferredLanguage: e.target.value }))}
              >
                <option value="cs">Čeština</option>
                <option value="en">English</option>
              </select>
            </div>
          </div>
          <div className="d-flex justify-content-end gap-2 mt-4">
            <button type="button" className="btn btn-outline-secondary" onClick={() => setShowBulkModal(false)}>
              {t("members.cancel")}
            </button>
            <button type="submit" className="btn btn-primary" disabled={bulkMutation.isPending}>
              {bulkMutation.isPending ? <span className="spinner-border spinner-border-sm me-2"></span> : null}
              {t("members.bulkRegister")}
            </button>
          </div>
        </form>
      </Modal>

      <Modal
        isVisible={bulkResults !== null}
        onClose={() => setBulkResults(null)}
        title={t("members.bulkResultsTitle")}
        icon="✅"
        size="lg"
      >
        {bulkResults && (
          <>
            <p>
              {t("members.bulkSuccess", {
                created: bulkResults.success_count,
                failed: bulkResults.failed_count,
              })}
            </p>
            {bulkResults.created_users?.length > 0 && (
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>{t("members.parentName")}</th>
                      <th>{t("members.username")}</th>
                      <th>{t("members.password")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bulkResults.created_users.map((user) => (
                      <tr key={user.id}>
                        <td>{user.real_name}</td>
                        <td className="font-monospace text-muted">{user.username}</td>
                        <td><code>{user.password}</code></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {bulkResults.errors?.length > 0 && (
              <ul className="text-danger small mt-2 mb-0">
                {bulkResults.errors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            )}
            <div className="d-flex justify-content-end mt-3">
              <button type="button" className="btn btn-primary" onClick={() => setBulkResults(null)}>
                {t("members.close")}
              </button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
