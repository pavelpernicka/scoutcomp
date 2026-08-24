import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import Button from "../components/Button";
import Alert from "../components/Alert";
import LoadingSpinner from "../components/LoadingSpinner";
import Select from "../components/Select";
import Input from "../components/Input";
import { parseServerDate } from "../utils/dateUtils";
import AdminPageHeader from "../modules/web/admin/AdminPageHeader";

const KIND_STYLES = {
  meeting: { badge: "text-bg-primary", icon: "fa-people-group", label: "calendar.kindMeeting" },
  trip: { badge: "text-bg-success", icon: "fa-tent", label: "calendar.kindTrip" },
  other: { badge: "text-bg-info", icon: "fa-flag", label: "calendar.kindOther" },
};

const REAL_STATUS_META = {
  present: { badge: "bg-success", icon: "fa-check", color: "text-success", label: "calendar.present" },
  absent: { badge: "bg-danger", icon: "fa-xmark", color: "text-danger", label: "calendar.absent" },
  excused: { badge: "bg-warning text-dark", icon: "fa-umbrella-beach", color: "text-warning", label: "calendar.excused" },
};

const PLANNED_STATUS_META = {
  attending: { badge: "bg-success", icon: "fa-check", label: "calendar.attending" },
  not_attending: { badge: "bg-warning text-dark", icon: "fa-umbrella-beach", label: "calendar.not_attending" },
  unknown: { badge: "bg-secondary", icon: "fa-question", label: "calendar.unknown" },
};

const CYCLE_ORDER = ["present", "excused", "absent"];
const MATRIX_EVENT_LIMIT = 40;

const schoolYearStart = () => {
  const now = new Date();
  const year = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-09-01`;
};

const updateMatrixCell = (data, groupKey, memberId, eventId, status) => {
  if (!data) return data;
  const key = String(eventId);
  return {
    ...data,
    groups: data.groups.map((group) => {
      if ((group.team_id ?? "none") !== groupKey) return group;
      return {
        ...group,
        members: group.members.map((member) => {
          if (member.id !== memberId) return member;
          const attendance = { ...(member.attendance || {}) };
          if (status) attendance[key] = status;
          else delete attendance[key];
          return { ...member, attendance };
        }),
      };
    }),
  };
};

const getErrorMessage = (error) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join("; ");
  }
  return error?.message || "Export failed";
};

export default function AdminAttendance() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();

  const [activeTab, setActiveTab] = useState("matrix");

  const [filters, setFilters] = useState({
    dateFrom: schoolYearStart(),
    dateTo: "",
    kind: "",
  });
  const [eventOffset, setEventOffset] = useState(0);
  const [feedback, setFeedback] = useState(null);

  const [matrixData, setMatrixData] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [editingEnabled, setEditingEnabled] = useState(false);
  const [savingCells, setSavingCells] = useState(() => new Set());

  const [memberQuery, setMemberQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [memberRange, setMemberRange] = useState({
    dateFrom: "",
    dateTo: "",
  });
  const [selectedMember, setSelectedMember] = useState(null);
  const [overviewRequest, setOverviewRequest] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedQuery(memberQuery.trim()), 300);
    return () => clearTimeout(timeout);
  }, [memberQuery]);

  const matrixQuery = useQuery({
    queryKey: ["admin-attendance-matrix", filters, eventOffset],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.append("date_from", filters.dateFrom);
      if (filters.dateTo) params.append("date_to", filters.dateTo);
      if (filters.kind) params.append("kind", filters.kind);
      params.append("offset", String(eventOffset));
      params.append("limit", String(MATRIX_EVENT_LIMIT));
      const { data } = await api.get(`/admin/core/attendance/matrix?${params}`);
      return data;
    },
    enabled: can("core.attendance.manage") && activeTab === "matrix",
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (matrixQuery.data) {
      setMatrixData(matrixQuery.data);
    }
  }, [matrixQuery.data]);

  useEffect(() => {
    if (matrixQuery.isError && matrixQuery.error?.response?.status !== 403) {
      setFeedback({ type: "danger", message: getErrorMessage(matrixQuery.error) });
    }
  }, [matrixQuery.error, matrixQuery.isError]);

  const events = useMemo(() => {
    const list = matrixData?.events || [];
    return [...list].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  }, [matrixData]);

  const eventCounts = useMemo(() => {
    const counts = {};
    for (const group of matrixData?.groups || []) {
      for (const member of group.members || []) {
        for (const [eventId, status] of Object.entries(member.attendance || {})) {
          if (!counts[eventId]) counts[eventId] = { present: 0, total: 0 };
          counts[eventId].total++;
          if (status === "present") counts[eventId].present++;
        }
      }
    }
    return counts;
  }, [matrixData]);
  const mobileEvents = events.slice(0, 5);

  const { data: memberResults = [] } = useQuery({
    queryKey: ["admin-attendance-member-search", debouncedQuery],
    queryFn: async () => {
      const { data } = await api.get(`/admin/core/attendance/members/search?q=${encodeURIComponent(debouncedQuery)}`);
      return data;
    },
    enabled: can("core.attendance.manage") && debouncedQuery.length >= 2,
  });

  const memberOverviewQuery = useQuery({
    queryKey: ["admin-attendance-member", overviewRequest],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (overviewRequest.dateFrom) params.append("date_from", overviewRequest.dateFrom);
      if (overviewRequest.dateTo) params.append("date_to", overviewRequest.dateTo);
      const { data } = await api.get(`/admin/core/attendance/members/${overviewRequest.id}?${params}`);
      return data;
    },
    enabled: can("core.attendance.manage") && !!overviewRequest,
  });

  const selectMember = (member) => {
    setSelectedMember(member);
    setOverviewRequest({ id: member.id, dateFrom: memberRange.dateFrom, dateTo: memberRange.dateTo });
    setMemberQuery("");
    setDebouncedQuery("");
  };

  const loadMemberOverview = () => {
    if (!selectedMember) return;
    setOverviewRequest({ id: selectedMember.id, dateFrom: memberRange.dateFrom, dateTo: memberRange.dateTo });
  };

  const handleFilterChange = (key, value) => {
    setEventOffset(0);
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const toggleGroup = (key) => {
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (filters.dateFrom) params.append("date_from", filters.dateFrom);
      if (filters.dateTo) params.append("date_to", filters.dateTo);
      if (filters.kind) params.append("kind", filters.kind);
      params.append("export", "csv");
      const { data } = await api.get(`/admin/core/attendance/events?${params}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `attendance-${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      setFeedback({ type: "success", message: t("admin.attendance.exportSuccess") });
    } catch (error) {
      setFeedback({ type: "danger", message: getErrorMessage(error) });
    }
  };

  const cycleCell = (groupKey, member, event) => {
    if (!editingEnabled) return;
    const key = String(event.id);
    const cellKey = `${groupKey}:${member.id}:${key}`;
    if (savingCells.has(cellKey)) return;

    const current = member.attendance?.[key] || null;
    const currentIndex = CYCLE_ORDER.indexOf(current);
    const next = CYCLE_ORDER[(currentIndex + 1) % CYCLE_ORDER.length];

    setMatrixData((data) => updateMatrixCell(data, groupKey, member.id, event.id, next));
    setSavingCells((cells) => new Set(cells).add(cellKey));

    api
      .post(`/activity/events/${event.id}/attendance`, {
        user_id: member.id,
        mode: "real",
        status: next,
      })
      // The optimistic matrix already contains the saved state. Refetching the
      // complete matrix after every cell made editing increasingly sluggish.
      .catch((error) => {
        setMatrixData((data) => updateMatrixCell(data, groupKey, member.id, event.id, current));
        if (error.response?.status !== 403) {
          setFeedback({ type: "danger", message: getErrorMessage(error) });
        }
      })
      .finally(() => {
        setSavingCells((cells) => {
          const nextCells = new Set(cells);
          nextCells.delete(cellKey);
          return nextCells;
        });
      });
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return "—";
    return parseServerDate(dateStr).toLocaleDateString(i18n.language === "cs" ? "cs-CZ" : "en-US");
  };

  const formatDateTime = (dateStr) => {
    if (!dateStr) return "—";
    return parseServerDate(dateStr).toLocaleString(i18n.language === "cs" ? "cs-CZ" : "en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderStatusBadge = (status, meta) => {
    if (!status || !meta[status]) return <span className="text-muted">—</span>;
    const m = meta[status];
    return (
      <span className={`badge ${m.badge}`}>
        <i className={`fas ${m.icon} me-1`}></i>
        {t(m.label)}
      </span>
    );
  };

  const memberPercent = (member) => {
    if (events.length === 0) return 0;
    let present = 0;
    for (const event of events) {
      if (member.attendance?.[String(event.id)] === "present") present++;
    }
    return Math.round((present / events.length) * 100);
  };

  const groupPercent = (members) => {
    if (events.length === 0 || members.length === 0) return 0;
    const total = members.reduce((sum, m) => {
      let present = 0;
      for (const event of events) {
        if (m.attendance?.[String(event.id)] === "present") present++;
      }
      return sum + present;
    }, 0);
    return Math.round((total / (events.length * members.length)) * 100);
  };

  const renderMatrixCell = (groupKey, member, event) => {
    const status = member.attendance?.[String(event.id)] || null;
    const meta = status ? REAL_STATUS_META[status] : null;
    const cellKey = `${groupKey}:${member.id}:${event.id}`;
    const isSaving = savingCells.has(cellKey);
    return (
      <td className="text-center px-1" key={event.id}>
        <button
          type="button"
          className={`btn btn-sm btn-outline-secondary border-0 ${meta ? meta.color : "text-muted"} p-1`}
          title={t("admin.attendance.clickToChange")}
          onClick={() => cycleCell(groupKey, member, event)}
          disabled={!editingEnabled || isSaving}
        >
          <i className={`fas ${isSaving ? "fa-spinner fa-spin" : meta ? meta.icon : "fa-minus"}`}></i>
        </button>
      </td>
    );
  };

  const renderMobileMatrixCell = (groupKey, member, event) => {
    const status = member.attendance?.[String(event.id)] || null;
    const meta = status ? REAL_STATUS_META[status] : null;
    const cellKey = `${groupKey}:${member.id}:${event.id}`;
    const isSaving = savingCells.has(cellKey);
    return (
      <button
        key={event.id}
        type="button"
        className={`admin-attendance-mobile-cell ${meta ? meta.color : "text-muted"}`}
        title={`${event.title}: ${meta ? t(meta.label) : t("admin.attendance.notRecorded")}`}
        aria-label={`${event.title}: ${meta ? t(meta.label) : t("admin.attendance.notRecorded")}`}
        onClick={() => cycleCell(groupKey, member, event)}
        disabled={!editingEnabled || isSaving}
      >
        <i className={`fas ${isSaving ? "fa-spinner fa-spin" : meta ? meta.icon : "fa-minus"}`} aria-hidden="true" />
      </button>
    );
  };

  return (
    <div className="admin-attendance-page">
      <AdminPageHeader
        title={t("admin.attendance.title")}
        description={t("admin.attendance.subtitle")}
        action={(
        <Button variant="primary" icon="fas fa-download" onClick={handleExport}>
          {t("admin.export")}
        </Button>
        )}
      />

      {feedback && (
        <Alert type={feedback.type} toast onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      <ul className="nav nav-tabs mb-4">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === "matrix" ? "active" : ""}`}
            onClick={() => setActiveTab("matrix")}
          >
            <i className="fas fa-table-cells me-2"></i>
            {t("admin.attendance.tabByEvent")}
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link ${activeTab === "people" ? "active" : ""}`}
            onClick={() => setActiveTab("people")}
          >
            <i className="fas fa-user me-2"></i>
            {t("admin.attendance.tabByPeople")}
          </button>
        </li>
      </ul>

      {activeTab === "matrix" && (
        <>
          {/* Filters */}
          <section className="card admin-attendance-filters mb-4" aria-labelledby="attendance-filters-heading">
            <div className="card-header">
              <h2 id="attendance-filters-heading" className="h6 mb-0">{t("admin.attendance.filters")}</h2>
            </div>
            <div className="card-body">
              <div className="row g-3 align-items-end">
                <div className="col-md-3 col-sm-6">
                  <label className="form-label small fw-semibold">{t("admin.attendance.dateFrom")}</label>
                  <Input
                    type="date"
                    value={filters.dateFrom}
                    onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                  />
                </div>
                <div className="col-md-3 col-sm-6">
                  <label className="form-label small fw-semibold">{t("admin.attendance.dateTo")}</label>
                  <Input
                    type="date"
                    value={filters.dateTo}
                    onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                  />
                </div>
                <div className="col-md-3 col-sm-6">
                  <label className="form-label small fw-semibold">{t("admin.attendance.kind")}</label>
                  <Select
                    value={filters.kind}
                    onChange={(e) => handleFilterChange("kind", e.target.value)}
                    options={[
                      { value: "meeting", label: t("calendar.kindMeeting") },
                      { value: "trip", label: t("calendar.kindTrip") },
                      { value: "other", label: t("calendar.kindOther") },
                    ]}
                    placeholder={t("calendar.allKinds")}
                  />
                </div>
                <div className="col-md-3 col-sm-6 d-flex gap-2">
                  {filters.dateFrom !== schoolYearStart() || filters.dateTo || filters.kind ? (
                    <Button variant="outline-secondary" size="sm" onClick={() => { setEventOffset(0); setFilters({ dateFrom: schoolYearStart(), dateTo: "", kind: "" }); }}>
                      <i className="fas fa-times me-1"></i>{t("admin.attendance.clearFilters")}
                    </Button>
                  ) : null}
                </div>
              </div>
            </div>
          </section>

          {/* Legend */}
          <div className="d-flex flex-wrap align-items-center gap-3 mb-2 small text-muted">
            {Object.entries(REAL_STATUS_META).map(([status, meta]) => (
              <span key={status}>
                <i className={`fas ${meta.icon} ${meta.color} me-1`}></i>
                {t(meta.label)}
              </span>
            ))}
            <span><i className="fas fa-minus text-muted me-1"></i>{t("admin.attendance.notRecorded")}</span>
            <span className="ms-auto">{editingEnabled ? t("admin.attendance.editEnabled") : t("admin.attendance.editDisabled")}</span>
          </div>

          {/* Matrix */}
          <section className="card admin-attendance-matrix mb-4" aria-labelledby="attendance-matrix-heading">
              <div className="card-header d-flex flex-wrap align-items-center justify-content-between gap-2">
                <h2 id="attendance-matrix-heading" className="h6 mb-0">{t("admin.attendance.matrixTitle")}</h2>
                <div className="d-flex align-items-center gap-2">
                  <span className="text-muted small">{events.length} {t("calendar.events").toLowerCase()}</span>
                  {(eventOffset > 0 || matrixData?.has_more) && (
                    <div className="btn-group" role="group" aria-label={t("admin.attendance.matrixTitle")}>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={eventOffset === 0 || matrixQuery.isFetching} onClick={() => setEventOffset((value) => Math.max(0, value - MATRIX_EVENT_LIMIT))}>
                        <i className="fas fa-chevron-left" aria-hidden="true" />
                        <span className="visually-hidden">{t("members.prev")}</span>
                      </button>
                      <button type="button" className="btn btn-sm btn-outline-secondary" disabled={!matrixData?.has_more || matrixQuery.isFetching} onClick={() => setEventOffset((value) => value + MATRIX_EVENT_LIMIT)}>
                        <i className="fas fa-chevron-right" aria-hidden="true" />
                        <span className="visually-hidden">{t("members.next")}</span>
                      </button>
                    </div>
                  )}
                  <Button variant={editingEnabled ? "primary" : "outline-secondary"} size="sm" onClick={() => setEditingEnabled((value) => !value)}>
                  <i className={`fas fa-${editingEnabled ? "lock-open" : "pen"} me-1`} />
                  {editingEnabled ? t("admin.attendance.finishEditing") : t("admin.attendance.enableEditing")}
                </Button>
              </div>
            </div>
            <div className="card-body p-0">
              {matrixQuery.isLoading ? (
                <div className="d-flex justify-content-center py-5">
                  <LoadingSpinner text={t("calendar.loading")} />
                </div>
              ) : events.length === 0 ? (
                <div className="text-center text-muted py-5">
                  <i className="fas fa-calendar-check fs-1 opacity-25 mb-3"></i>
                  <p className="mb-0">{t("calendar.noEventsInMonth")}</p>
                </div>
              ) : (
                <>
                  <div className="admin-attendance-mobile-matrix d-md-none">
                    <div className="admin-attendance-mobile-events" style={{ gridTemplateColumns: `minmax(7.5rem, 1fr) repeat(${mobileEvents.length}, minmax(2rem, .55fr))` }}>
                      <span>{t("calendar.member")}</span>
                      {mobileEvents.map((event) => (
                        <span key={event.id} className="admin-attendance-mobile-event" title={event.title}>
                          <span className="admin-attendance-mobile-event__date">{formatDate(event.starts_at).replace(/\s.*$/, "")}</span>
                          <span className="admin-attendance-mobile-event__title">{event.title}</span>
                        </span>
                      ))}
                    </div>
                    {(matrixData?.groups || []).map((group) => {
                      const groupKey = group.team_id ?? "none";
                      const isCollapsed = !!collapsed[groupKey];
                      return (
                        <section key={groupKey} className="admin-attendance-mobile-group">
                          <button type="button" className="admin-attendance-mobile-group__heading" onClick={() => toggleGroup(groupKey)} aria-expanded={!isCollapsed}>
                            <span><i className={`fas fa-chevron-${isCollapsed ? "right" : "down"}`} aria-hidden="true" /> {group.team_name || t("adminUsers.noTeam")}</span>
                            <span className="badge bg-secondary">{group.members.length}</span>
                          </button>
                          {!isCollapsed && group.members.map((member) => (
                            <div key={member.id} className="admin-attendance-mobile-member" style={{ gridTemplateColumns: `minmax(7.5rem, 1fr) repeat(${mobileEvents.length}, minmax(2rem, .55fr))` }}>
                              <div><strong>{member.real_name}</strong><small>{memberPercent(member)} %</small></div>
                              {mobileEvents.map((event) => renderMobileMatrixCell(groupKey, member, event))}
                            </div>
                          ))}
                        </section>
                      );
                    })}
                  </div>
                  <div className="table-responsive d-none d-md-block" style={{ overflowX: "auto", overscrollBehaviorInline: "contain" }}>
                  <table className="table table-sm table-bordered align-middle mb-0" style={{ minWidth: `${events.length * 90 + 220}px` }}>
                    <thead className="table-light" style={{ position: "sticky", top: 0, zIndex: 2 }}>
                      <tr>
                        <th className="sticky-col" style={{ minWidth: "180px" }}>{t("calendar.member")}</th>
                        {events.map(event => {
                          const counts = eventCounts[String(event.id)] || { present: 0, total: 0 };
                          const pct = counts.total ? Math.round((counts.present / counts.total) * 100) : 0;
                          return (
                            <th key={event.id} className="text-center align-middle" style={{ minWidth: "118px", maxWidth: "144px" }}>
                              <div className="d-flex flex-column align-items-center gap-1">
                                <span className="badge small fw-normal">
                                  <KindBadge kind={event.kind} t={t} compact />
                                </span>
                                <span className="text-truncate fw-semibold w-100" title={event.title} style={{ fontSize: "0.88rem" }}>
                                  {event.title}
                                </span>
                                <span className="small text-muted">{formatDate(event.starts_at)}</span>
                                <span className={`small fw-semibold ${counts.present > 0 ? "text-success" : "text-muted"}`}>
                                  <i className="fas fa-check me-1"></i>
                                  {counts.present}/{counts.total}
                                  <span className="text-muted ms-1">({pct}%)</span>
                                </span>
                              </div>
                            </th>
                          );
                        })}
                        <th className="text-center align-middle sticky-right" style={{ minWidth: "90px" }}>
                          {t("admin.attendance.percentCol")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(matrixData?.groups || []).map(group => {
                        const groupKey = group.team_id ?? "none";
                        const isCollapsed = !!collapsed[groupKey];
                        return (
                          <FragmentGroup
                            key={groupKey}
                            groupKey={groupKey}
                            group={group}
                            isCollapsed={isCollapsed}
                            onToggle={toggleGroup}
                            colSpan={events.length + 2}
                            percent={groupPercent(group.members)}
                            t={t}
                          >
                            {!isCollapsed && group.members.map(member => (
                              <tr key={member.id}>
                                <td className="sticky-col">
                                  <span className="fw-medium">{member.real_name}</span>
                                </td>
                                {events.map(event => renderMatrixCell(groupKey, member, event))}
                                <td className="text-center sticky-right">
                                  <span className={`badge ${memberPercent(member) >= 75 ? "bg-success" : memberPercent(member) >= 50 ? "bg-warning text-dark" : "bg-danger"}`}>
                                    {memberPercent(member)}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </FragmentGroup>
                        );
                      })}
                    </tbody>
                  </table>
                  </div>
                </>
              )}
            </div>
          </section>
        </>
      )}

      {activeTab === "people" && (
        /* Member Overview */
        <section className="card admin-attendance-member-overview mb-4" aria-labelledby="attendance-member-overview-heading">
          <div className="card-header">
            <h2 id="attendance-member-overview-heading" className="h6 mb-0">{t("admin.attendance.memberOverview")}</h2>
          </div>
          <div className="card-body">
            <div className="row g-3 align-items-end">
              <div className="col-md-4">
                <label className="form-label small fw-semibold">{t("admin.attendance.memberSearch")}</label>
                <div className="position-relative">
                  <Input
                    type="search"
                    value={memberQuery}
                    onChange={(e) => setMemberQuery(e.target.value)}
                    placeholder={t("admin.attendance.memberSearchPlaceholder")}
                  />
                  {memberResults.length > 0 && (
                    <ul className="dropdown-menu show w-100">
                      {memberResults.map((m) => (
                        <li key={m.id}>
                          <button className="dropdown-item" type="button" onClick={() => selectMember(m)}>
                            <span className="fw-semibold">{m.real_name}</span>
                            {m.team_name && <small className="text-muted ms-2">{m.team_name}</small>}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                {selectedMember && (
                  <small className="text-muted">
                    <i className="fas fa-user-check me-1"></i>
                    {selectedMember.real_name}
                    {selectedMember.team_name ? ` (${selectedMember.team_name})` : ""}
                  </small>
                )}
              </div>
              <div className="col-md-3 col-sm-6">
                <label className="form-label small fw-semibold">{t("admin.attendance.dateFrom")}</label>
                <Input
                  type="date"
                  value={memberRange.dateFrom}
                  onChange={(e) => setMemberRange(prev => ({ ...prev, dateFrom: e.target.value }))}
                />
              </div>
              <div className="col-md-3 col-sm-6">
                <label className="form-label small fw-semibold">{t("admin.attendance.dateTo")}</label>
                <Input
                  type="date"
                  value={memberRange.dateTo}
                  onChange={(e) => setMemberRange(prev => ({ ...prev, dateTo: e.target.value }))}
                />
              </div>
              <div className="col-md-2">
                <Button variant="primary" icon="fas fa-user-clock" onClick={loadMemberOverview} disabled={!selectedMember}>
                  {t("admin.attendance.show")}
                </Button>
              </div>
            </div>

            {!selectedMember && !memberOverviewQuery.isLoading && (
              <div className="text-center text-muted py-4">
                <i className="fas fa-user-magnifying-glass fs-1 opacity-25 mb-2"></i>
                <p className="mb-0">{t("admin.attendance.selectMemberHint")}</p>
              </div>
            )}

            {memberOverviewQuery.isLoading && (
              <div className="d-flex justify-content-center py-4">
                <LoadingSpinner text={t("calendar.loading")} />
              </div>
            )}

            {memberOverviewQuery.isError && (
              <Alert type="danger" className="mt-3" onClose={() => memberOverviewQuery.remove()}>
                {getErrorMessage(memberOverviewQuery.error)}
              </Alert>
            )}

            {memberOverviewQuery.data && !memberOverviewQuery.isLoading && (
              <>
                <div className="mt-4 border-top pt-4">
                  <h6 className="fw-semibold mb-3">
                    {t("admin.attendance.memberStats")}
                    <span className="text-muted fw-normal ms-2">
                      — {memberOverviewQuery.data.member.real_name}
                      {memberOverviewQuery.data.member.team_name ? ` (${memberOverviewQuery.data.member.team_name})` : ""}
                    </span>
                  </h6>
                  <div className="row g-3">
                    {(["meeting", "trip", "other"]).map((kind) => {
                      const s = memberOverviewQuery.data.summary[kind] || {};
                      return (
                        <div className="col-md-4" key={kind}>
                          <div className="card h-100 border-0 shadow-sm">
                            <div className="card-body py-3">
                              <div className="d-flex align-items-center justify-content-between mb-3">
                                <KindBadge kind={kind} t={t} />
                                <span className="text-muted small">{s.events || 0} {t("admin.attendance.statEvents")}</span>
                              </div>
                              <div className="d-flex gap-4">
                                <div>
                                  <div className="fs-5 fw-bold text-success">{s.present || 0}</div>
                                  <small className="text-muted">{t("admin.attendance.statPresent")}</small>
                                </div>
                                <div>
                                  <div className="fs-5 fw-bold text-info">{s.attending || 0}</div>
                                  <small className="text-muted">{t("admin.attendance.statAttending")}</small>
                                </div>
                                <div>
                                  <div className="fs-5 fw-bold text-danger">{s.absent || 0}</div>
                                  <small className="text-muted">{t("calendar.absent")}</small>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="table-responsive mt-4">
                  <table className="table table-sm table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t("calendar.title")}</th>
                        <th style={{ width: "100px" }}>{t("calendar.kind")}</th>
                        <th style={{ width: "160px" }}>{t("calendar.startsAt")}</th>
                        <th style={{ width: "130px" }} className="text-center">{t("calendar.realAttendance")}</th>
                        <th style={{ width: "150px" }} className="text-center">{t("calendar.plannedAttendance")}</th>
                        <th style={{ width: "130px" }} className="text-center">{t("calendar.registeredOn")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberOverviewQuery.data.events.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="text-center text-muted py-4">{t("admin.attendance.noMemberEvents")}</td>
                        </tr>
                      ) : (
                        memberOverviewQuery.data.events.map((ev) => (
                          <tr key={ev.event_id}>
                            <td className="fw-medium">{ev.title}</td>
                            <td><KindBadge kind={ev.kind} t={t} /></td>
                            <td className="small">{formatDateTime(ev.starts_at)}</td>
                            <td className="text-center">{renderStatusBadge(ev.real_status, REAL_STATUS_META)}</td>
                            <td className="text-center">{renderStatusBadge(ev.planned_status, PLANNED_STATUS_META)}</td>
                            <td className="text-center small text-muted">{formatDate(ev.registered_on)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function FragmentGroup({ groupKey, group, isCollapsed, onToggle, colSpan, percent, t, children }) {
  return (
    <>
      <tr className="table-light">
        <td colSpan={colSpan} className="p-0">
          <button
            type="button"
            className="btn btn-light w-100 text-start d-flex align-items-center gap-2 py-2 px-3 rounded-0"
            onClick={() => onToggle(groupKey)}
          >
            <i className={`fas fa-chevron-${isCollapsed ? "right" : "down"} small`}></i>
            <span className="fw-semibold">{group.name || t("calendar.noGroup")}</span>
            <span className="badge bg-secondary">{group.members.length} {t("calendar.members")}</span>
            <span className="ms-auto">
              <span className={`badge ${percent >= 75 ? "bg-success" : percent >= 50 ? "bg-warning text-dark" : "bg-danger"}`}>
                {percent}%
              </span>
            </span>
          </button>
        </td>
      </tr>
      {children}
    </>
  );
}

function KindBadge({ kind, t, compact }) {
  const style = KIND_STYLES[kind] || KIND_STYLES.other;
  return (
    <span className={`badge ${style.badge} ${compact ? "" : ""}`}>
      {!compact && <i className={`fas ${style.icon} me-1`}></i>}
      {t(style.label)}
    </span>
  );
}
KindBadge.propTypes = { kind: PropTypes.string, t: PropTypes.func, compact: PropTypes.bool };

FragmentGroup.propTypes = {
  groupKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
  group: PropTypes.object.isRequired,
  isCollapsed: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  colSpan: PropTypes.number.isRequired,
  percent: PropTypes.number.isRequired,
  t: PropTypes.func.isRequired,
  children: PropTypes.node,
};
