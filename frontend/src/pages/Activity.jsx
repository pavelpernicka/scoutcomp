import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { convertLocalToUTC, parseServerDate, formatServerDateToInputValue } from "../utils/dateUtils";
import RichTextContent from "../components/RichTextContent";
import HeroHeader from "../components/HeroHeader";
import Button from "../components/Button";
import Alert from "../components/Alert";
import Modal from "../components/Modal";
import Input from "../components/Input";
import Select from "../components/Select";
import LoadingSpinner from "../components/LoadingSpinner";
import AttendanceDialog from "../components/AttendanceDialog";
import EventMonthCalendar from "../components/calendar/EventMonthCalendar";
import ArticleEditBox from "../modules/web/admin/ArticleEditBox";

const KIND_STYLES = {
  meeting: { badge: "text-bg-primary", chip: "bg-primary", icon: "fa-people-group" },
  trip: { badge: "text-bg-success", chip: "bg-success", icon: "fa-tent" },
  other: { badge: "text-bg-info", chip: "bg-info", icon: "fa-flag" },
};

const KIND_CHIP_HEX = { meeting: "#0d6efd", trip: "#198754", other: "#0dcaf0" };
const ACTIVITY_VIEW_STORAGE_KEY = "scoutcomp.activity.view";

const loadPreferredActivityView = () => {
  if (typeof window === "undefined") return "month";
  try {
    const stored = window.localStorage.getItem(ACTIVITY_VIEW_STORAGE_KEY);
    return stored === "list" || stored === "month" ? stored : "month";
  } catch {
    return "month";
  }
};

const PLANNED_STATUS_META = {
  attending: { badge: "bg-success", icon: "fa-check", label: "calendar.attending" },
  not_attending: { badge: "bg-warning text-dark", icon: "fa-xmark", label: "calendar.not_attending" },
  unknown: { badge: "bg-secondary", icon: "fa-question", label: "calendar.unknown" },
};

const REAL_STATUS_META = {
  present: { badge: "bg-success", icon: "fa-check", label: "calendar.present" },
  absent: { badge: "bg-danger", icon: "fa-xmark", label: "calendar.absent" },
  excused: { badge: "bg-warning text-dark", icon: "fa-umbrella-beach", label: "calendar.excused" },
};

const isDeadlinePassed = (event) => {
  const deadline = parseServerDate(event?.planned_deadline);
  return Boolean(event?.requires_planned && deadline && deadline < new Date());
};

const eventColor = (event) => event.color || KIND_CHIP_HEX[event.kind] || KIND_CHIP_HEX.other;

const isSameDay = (a, b) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const formatEventTime = (value, language) =>
  parseServerDate(value)?.toLocaleTimeString(language === "cs" ? "cs-CZ" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
  }) ?? "";

const formatEventDate = (value, language) =>
  parseServerDate(value)?.toLocaleDateString(language === "cs" ? "cs-CZ" : "en-US", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }) ?? "";

const formatMonthTitle = (value, language) =>
  value.toLocaleDateString(language === "cs" ? "cs-CZ" : "en-US", {
    month: "long",
    year: "numeric",
  });

const extractError = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
};

const emptyForm = () => ({
  title: "",
  kind: "meeting",
  starts_at: "",
  ends_at: "",
  location: "",
  description: "",
  color: "",
  team_id: "",
  audience: "members",
  requires_planned: false,
  planned_deadline: "",
  is_public: true,
});

const mapEventToForm = (event) => ({
  title: event.title || "",
  kind: event.kind || "meeting",
  starts_at: formatServerDateToInputValue(event.starts_at),
  ends_at: formatServerDateToInputValue(event.ends_at),
  location: event.location || "",
  description: event.description || "",
  color: event.color || "",
  team_id: event.team_id ? String(event.team_id) : "",
  audience: event.audience || "members",
  requires_planned: Boolean(event.requires_planned),
  planned_deadline: formatServerDateToInputValue(event.planned_deadline),
  is_public: Boolean(event.is_public),
});

const validateEventForm = (form) => {
  if (!form.title.trim()) return "validationTitle";
  const startsAt = new Date(form.starts_at);
  if (!form.starts_at || Number.isNaN(startsAt.getTime())) return "validationStart";
  if (form.ends_at) {
    const endsAt = new Date(form.ends_at);
    if (Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) return "validationEnd";
  }
  if (form.requires_planned) {
    const deadline = new Date(form.planned_deadline);
    if (!form.planned_deadline || Number.isNaN(deadline.getTime()) || deadline > startsAt) return "validationDeadline";
  }
  return null;
};

function KindBadge({ kind, t }) {
  const style = KIND_STYLES[kind] || KIND_STYLES.other;
  const label = t(`calendar.kind${kind === "meeting" ? "Meeting" : kind === "trip" ? "Trip" : "Other"}`);
  return (
    <span className={`badge ${style.badge}`}>
      <i className={`fas ${style.icon} me-1`}></i>
      {label}
    </span>
  );
}
KindBadge.propTypes = { kind: PropTypes.string, t: PropTypes.func };

export default function Activity() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { can, profile, userId } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [view, setView] = useState(loadPreferredActivityView);
  const [viewDate, setViewDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm());
  const [formError, setFormError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [selectedTeamIds, setSelectedTeamIds] = useState([]);
  const [councilOnly, setCouncilOnly] = useState(false);
  const [teamFilterOpen, setTeamFilterOpen] = useState(false);
  const [endsAtAuto, setEndsAtAuto] = useState(false);
  const [attendanceEvent, setAttendanceEvent] = useState(null);
  const [messageResult, setMessageResult] = useState(null);
  const [pastPage, setPastPage] = useState(1);
  const [pastPageSize] = useState(10);
  const [selectedGroupIds, setSelectedGroupIds] = useState([]);
  const [groupFilterOpen, setGroupFilterOpen] = useState(false);
  const teamFilterRef = useRef(null);
  const filterDefaultsApplied = useRef(false);
  const processedEventParam = useRef(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(ACTIVITY_VIEW_STORAGE_KEY, view);
    } catch {
      // Storage may be unavailable in private or restricted browser contexts.
    }
  }, [view]);

  useEffect(() => {
    if (!teamFilterOpen) return;
    const handleClick = (event) => {
      if (!teamFilterRef.current?.contains(event.target)) {
        setTeamFilterOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [teamFilterOpen]);

  const canCreate = can("core.events.create");
  const canEdit = can("core.events.edit");
  const canDelete = can("core.events.delete");
  const canAttendance = can("core.attendance.manage");
  const canPickTeam = can("core.teams.manage");
  const isLeader = can("core.is_leader");

  useEffect(() => {
    if (filterDefaultsApplied.current || !profile?.user) return;
    filterDefaultsApplied.current = true;
    if (!isLeader && profile.user.team_id) {
      setSelectedTeamIds([profile.user.team_id]);
    }
  }, [isLeader, profile]);

  const { data: events = [], isLoading } = useQuery({
    queryKey: ["activity-events"],
    queryFn: async () => {
      const { data } = await api.get("/activity/events");
      return data;
    },
  });

  const { data: members = [], isLoading: membersLoading } = useQuery({
    queryKey: ["activity-members", attendanceEvent?.id ?? selectedEvent?.id ?? null],
    queryFn: async () => {
      const eventId = attendanceEvent?.id ?? selectedEvent?.id;
      const { data } = await api.get("/activity/members", {
        params: { event_id: eventId },
      });
      return data;
    },
    enabled: canAttendance && (Boolean(attendanceEvent) || Boolean(selectedEvent)),
    retry: false,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["teams"],
    queryFn: async () => {
      const { data } = await api.get("/teams");
      return data;
    },
    enabled: canPickTeam,
    retry: false,
  });

  const { data: userGroups = [] } = useQuery({
    queryKey: ["user-groups", userId],
    queryFn: async () => {
      const { data } = await api.get(`/teams/${userId}/groups`);
      return data;
    },
    enabled: Boolean(userId),
    retry: false,
  });

  const saveMutation = useMutation({
    mutationFn: async (payload) => {
      if (editing?.id) {
        await api.put(`/activity/events/${editing.id}`, payload);
      } else {
        await api.post("/activity/events", payload);
      }
    },
    onSuccess: () => {
      setFormError(null);
      setFormOpen(false);
      setFeedback({ type: "success", message: t("calendar.saveSuccess") });
      queryClient.invalidateQueries({ queryKey: ["activity-events"] });
    },
    onError: (error) => {
      setFormError(extractError(error, t("calendar.saveError")));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (eventId) => {
      await api.delete(`/activity/events/${eventId}`);
    },
    onSuccess: () => {
      setSelectedEvent(null);
      setFeedback({ type: "success", message: t("calendar.deleteSuccess") });
      queryClient.invalidateQueries({ queryKey: ["activity-events"] });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: extractError(error, t("calendar.deleteError")) });
    },
  });

  const attendanceMutation = useMutation({
    mutationFn: async ({ eventId, memberId, mode, status }) => {
      await api.post(`/activity/events/${eventId}/attendance`, { user_id: memberId, mode, status });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-events"] });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: extractError(error, t("calendar.saveError")) });
    },
  });

  const messageMutation = useMutation({
    mutationFn: async ({ eventId, message }) => {
      const { data } = await api.post(`/activity/events/${eventId}/message`, { message });
      return data;
    },
    onSuccess: () => {
      setMessageResult(t("calendar.messageSent"));
    },
    onError: (error) => {
      setMessageResult(null);
      setFeedback({ type: "danger", message: extractError(error, t("calendar.saveError")) });
    },
  });

  const ownPlannedMutation = useMutation({
    mutationFn: async ({ eventId, status }) => {
      const { data } = await api.post(`/activity/events/${eventId}/planned`, { status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-events"] });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: extractError(error, t("calendar.saveError")) });
    },
  });

  const handleSetOwnPlanned = (eventId, status) => {
    ownPlannedMutation.mutate({ eventId, status });
  };

  const teamOptions = useMemo(() => {
    const byId = new Map();
    if (profile?.user?.team_id && profile.user.team_name) {
      byId.set(profile.user.team_id, profile.user.team_name);
    }
    for (const event of events) {
      if (event.team_id && event.team_name) {
        byId.set(event.team_id, event.team_name);
      }
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, i18n.language));
  }, [events, i18n.language, profile]);

  const filteredEvents = useMemo(() => {
    const byTeam = selectedTeamIds.length === 0
      ? events
      : events.filter((event) => !event.team_id || selectedTeamIds.includes(event.team_id));
    return councilOnly ? byTeam.filter((event) => event.audience === "leaders") : byTeam;
  }, [councilOnly, events, selectedTeamIds]);

  const toggleTeam = (id) => {
    setSelectedTeamIds((prev) =>
      prev.includes(id) ? prev.filter((teamId) => teamId !== id) : [...prev, id]
    );
  };

  const sortedEvents = useMemo(
    () =>
      [...filteredEvents].sort(
        (a, b) => parseServerDate(a.starts_at) - parseServerDate(b.starts_at)
      ),
    [filteredEvents]
  );


  const attendanceByEvent = useMemo(() => {
    const map = {};
    for (const event of events) {
      map[event.id] = {};
      for (const entry of event.attendance || []) {
        map[event.id][`${entry.mode}:${entry.user_id}`] = entry;
      }
    }
    return map;
  }, [events]);

  const myPlannedByEvent = useMemo(() => {
    const map = {};
    for (const event of events) {
      for (const entry of event.attendance || []) {
        if (entry.mode === "planned" && entry.user_id === userId) {
          map[event.id] = entry.status;
        }
      }
    }
    return map;
  }, [events, userId]);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const upcoming = sortedEvents.filter((event) => parseServerDate(event.starts_at) >= today);
  const past = sortedEvents.filter((event) => parseServerDate(event.starts_at) < today);

  const openCreateForm = (date) => {
    setFormError(null);
    setEditing(null);
    const startsAt = date ? toLocalInput(date, true) : "";
    setForm({
      ...emptyForm(),
      starts_at: startsAt,
      ends_at: startsAt ? addHoursToInput(startsAt, 1) : "",
    });
    setEndsAtAuto(Boolean(startsAt));
    setFormOpen(true);
  };

  const openEditForm = (event) => {
    setFormError(null);
    setSelectedEvent(null);
    setEditing(event);
    const nextForm = mapEventToForm(event);
    setForm(nextForm);
    setEndsAtAuto(!nextForm.ends_at && Boolean(nextForm.starts_at));
    setFormOpen(true);
  };

  const handleStartChange = (value) => {
    const shouldAuto = endsAtAuto || !form.ends_at;
    setForm((current) => {
      const next = { ...current, starts_at: value };
      if (shouldAuto) {
        next.ends_at = value ? addHoursToInput(value, 1) : "";
      }
      if (current.requires_planned && !current.planned_deadline) {
        next.planned_deadline = value;
      }
      return next;
    });
    if (shouldAuto) {
      setEndsAtAuto(true);
    }
  };

  const handleEndChange = (value) => {
    setEndsAtAuto(false);
    setForm({ ...form, ends_at: value });
  };

  const openDetail = (event) => {
    setSelectedEvent(event);
  };

  useEffect(() => {
    const eventId = searchParams.get("event");
    if (!eventId) {
      processedEventParam.current = null;
      return;
    }
    if (processedEventParam.current === eventId || isLoading) return;
    if (events.length === 0) return;
    const target = events.find((event) => event.id === Number(eventId));
    if (!target) return;
    processedEventParam.current = eventId;
    openDetail(target);
    const params = new URLSearchParams(searchParams);
    params.delete("event");
    setSearchParams(params, { replace: true });
  }, [searchParams, events, isLoading, openDetail]);

  const handleSave = (eventForm) => {
    eventForm.preventDefault();
    const validationError = validateEventForm(form);
    if (validationError) {
      setFormError(t(`calendar.${validationError}`));
      return;
    }
    const payload = {
      title: form.title.trim(),
      kind: form.kind,
      starts_at: convertLocalToUTC(form.starts_at),
      ends_at: form.ends_at ? convertLocalToUTC(form.ends_at) : null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      color: form.color || null,
      team_id: form.team_id ? Number(form.team_id) : null,
      audience: form.audience || "members",
      requires_planned: Boolean(form.requires_planned),
      planned_deadline: form.requires_planned && form.planned_deadline
        ? convertLocalToUTC(form.planned_deadline)
        : null,
      is_public: Boolean(form.is_public),
    };
    saveMutation.mutate(payload);
  };

  const handleDelete = () => {
    if (!selectedEvent) return;
    if (!window.confirm(t("calendar.confirmDelete"))) return;
    deleteMutation.mutate(selectedEvent.id);
  };

  const handleAttendance = (eventId, memberId, mode, status) => {
    attendanceMutation.mutate({ eventId, memberId, mode, status });
  };

  const openAttendance = (event) => {
    setMessageResult(null);
    setAttendanceEvent(event);
  };

  const handleSendMessage = (message) => {
    if (!attendanceEvent) return;
    messageMutation.mutate({ eventId: attendanceEvent.id, message });
  };

  const selectedAttendance = selectedEvent ? attendanceByEvent[selectedEvent.id] || {} : {};

  const scopedMemberIds = useMemo(
    () => new Set(members.map((member) => member.id)),
    [members]
  );
  const isScopedMember = (entry) => scopedMemberIds.has(entry.user_id);

  const plannedEntries = selectedEvent
    ? Object.values(selectedAttendance).filter((entry) => entry.mode === "planned")
    : [];
  const plannedAnswer = (status) => {
    if (["attending", "present"].includes(status)) return "yes";
    if (["not_attending", "absent", "excused"].includes(status)) return "no";
    return "unknown";
  };
  const plannedRows = plannedEntries.filter((entry) => isScopedMember(entry));
  const plannedYes = plannedRows.filter((entry) => plannedAnswer(entry.status) === "yes").length;
  const plannedNo = plannedRows.filter((entry) => plannedAnswer(entry.status) === "no").length;

  const monthLabel = formatMonthTitle(viewDate, i18n.language);

  return (
    <>
      <HeroHeader
        title={t("calendar.title")}
        subtitle={t("calendar.subtitle")}
        icon="📅"
        gradient="linear-gradient(135deg, #14532d 0%, #16a34a 100%)"
      >
        <div className="d-flex align-items-center gap-2 justify-content-md-end">
          {canCreate && (
            <Button variant="light" gradient="linear-gradient(135deg, #22c55e 0%, #16a34a 100%)" icon="fas fa-plus" onClick={() => openCreateForm(null)}>
              {t("calendar.addEvent")}
            </Button>
          )}
        </div>
      </HeroHeader>

      {feedback && !formOpen && (
        <Alert type={feedback.type} className="mb-4" icon={<></>}>
          {feedback.message}
        </Alert>
      )}

      {/* Toolbar */}
      <div className="card shadow-sm border-0 mb-4">
        <div className="card-body d-flex flex-wrap align-items-center gap-2">
          <div className="btn-group">
            <button
              type="button"
              className={`btn btn-sm ${view === "month" ? "btn-success" : "btn-outline-success"}`}
              onClick={() => setView("month")}
            >
              <i className="fas fa-calendar-days me-1"></i>
              {t("calendar.monthView")}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${view === "list" ? "btn-success" : "btn-outline-success"}`}
              onClick={() => setView("list")}
            >
              <i className="fas fa-list me-1"></i>
              {t("calendar.listView")}
            </button>
          </div>

          {teamOptions.length > 0 && (
            <div className="position-relative" ref={teamFilterRef}>
              <button
                type="button"
                className={`btn btn-sm ${selectedTeamIds.length > 0 ? "btn-success" : "btn-outline-success"}`}
                onClick={() => setTeamFilterOpen((open) => !open)}
              >
                <i className="fas fa-layer-group me-1"></i>
                {selectedTeamIds.length === 0
                  ? t("calendar.allTeams")
                  : `${selectedTeamIds.length} ${t("calendar.teamsSelected")}`}
                <i className={`fas fa-chevron-${teamFilterOpen ? "up" : "down"} ms-1 small`}></i>
              </button>
              {teamFilterOpen && (
                <div
                  className="position-absolute top-100 start-0 mt-1 shadow rounded bg-white border p-2 z-3"
                  style={{ minWidth: "220px", maxHeight: "280px", overflowY: "auto" }}
                >
                  <label className="d-flex align-items-center gap-2 px-2 py-1 rounded small user-select-none">
                    <input
                      type="checkbox"
                      className="form-check-input m-0"
                      checked={selectedTeamIds.length === 0}
                      onChange={() => setSelectedTeamIds([])}
                    />
                    <span className="fw-semibold">{t("calendar.allTeams")}</span>
                  </label>
                  <hr className="my-1" />
                  {teamOptions.map((team) => (
                    <label
                      key={team.id}
                      className="d-flex align-items-center gap-2 px-2 py-1 rounded small user-select-none"
                      style={{ cursor: "pointer" }}
                    >
                      <input
                        type="checkbox"
                        className="form-check-input m-0"
                        checked={selectedTeamIds.includes(team.id)}
                        onChange={() => toggleTeam(team.id)}
                      />
                      <span className="text-truncate">{team.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {isLeader && (
            <label
              className={`d-inline-flex align-items-center gap-2 border rounded px-2 py-1 small user-select-none ${
                councilOnly ? "border-success bg-success-subtle text-success-emphasis" : "border-secondary-subtle"
              }`}
              style={{ cursor: "pointer", minHeight: "31px" }}
            >
              <input
                type="checkbox"
                className="form-check-input m-0"
                checked={councilOnly}
                onChange={(event) => setCouncilOnly(event.target.checked)}
              />
              <i className="fas fa-user-shield" aria-hidden="true" />
              <span>{t("calendar.councilOnly")}</span>
            </label>
          )}

          {view === "month" && (
            <>
              <div className="d-flex align-items-center gap-1 ms-lg-auto">
                <Button variant="outline-secondary" size="sm" icon="fas fa-chevron-left" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))} aria-label={t("common.previous")} />
                <Button variant="outline-secondary" size="sm" onClick={() => setViewDate(new Date())}>
                  {t("calendar.today")}
                </Button>
                <Button variant="outline-secondary" size="sm" icon="fas fa-chevron-right" onClick={() => setViewDate((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))} aria-label={t("common.next")} />
              </div>
              <span className="fw-semibold fs-5 text-success ms-lg-3" style={{ textTransform: "capitalize" }}>
                {monthLabel}
              </span>
            </>
          )}

          <span className="ms-auto text-muted small">
            <i className="fas fa-calendar-check me-1"></i>
            {sortedEvents.length} {t("calendar.eventsCount")}
          </span>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="d-flex justify-content-center py-5">
          <LoadingSpinner text={t("calendar.loading")} />
        </div>
      ) : view === "month" ? (
        <div className="card shadow-sm border-0">
          <EventMonthCalendar
            events={filteredEvents}
            viewDate={viewDate}
            onEventClick={openDetail}
            onCreateDay={openCreateForm}
            canCreate={canCreate}
            getEventColor={eventColor}
            getEventLabel={(event) => formatEventTime(event.starts_at, i18n.language)}
            plannedStatusByEvent={myPlannedByEvent}
          />
        </div>
      ) : (
        <div className="card shadow-sm border-0">
          <div className="card-body">
            {sortedEvents.length === 0 && (
              <div className="text-center text-muted py-5">{t("calendar.noEventsInMonth")}</div>
            )}

            {upcoming.length > 0 && (
              <section className="mb-4">
                <h2 className="h6 text-success text-uppercase mb-3">
                  <i className="fas fa-hourglass-half me-2"></i>
                  {t("calendar.upcoming")} ({upcoming.length})
                </h2>
                <div className="list-group list-group-flush">
                  {upcoming.map((event) => (
                    <EventListItem key={event.id} event={event} i18n={i18n} myStatus={myPlannedByEvent[event.id]} t={t} onClick={() => openDetail(event)} />
                  ))}
                </div>
              </section>
            )}

{past.length > 0 && (
              <section>
                <div className="d-flex align-items-center justify-content-between flex-wrap gap-2 mb-3">
                  <h2 className="h6 text-muted text-uppercase mb-0">
                    <i className="fas fa-clock-rotate-left me-2"></i>
                    {t("calendar.past")} ({past.length})
                  </h2>
                  <div className="d-flex align-items-center gap-2">
                    {userGroups.length > 0 && (
                      <div className="position-relative" ref={teamFilterRef}>
                        <button
                          type="button"
                          className={`btn btn-sm ${selectedGroupIds.length > 0 ? "btn-info" : "btn-outline-info"}`}
                          onClick={() => setGroupFilterOpen((open) => !open)}
                        >
                          <i className="fas fa-users me-1"></i>
                          {selectedGroupIds.length === 0
                            ? t("calendar.allGroups")
                            : `${selectedGroupIds.length} ${t("calendar.groupsSelected")}`}
                          <i className={`fas fa-chevron-${groupFilterOpen ? "up" : "down"} ms-1 small`}></i>
                        </button>
                        {groupFilterOpen && (
                          <div
                            className="position-absolute top-100 start-0 mt-1 shadow rounded bg-white border p-2 z-3"
                            style={{ minWidth: "220px", maxHeight: "280px", overflowY: "auto" }}
                          >
                            <label className="d-flex align-items-center gap-2 px-2 py-1 rounded small user-select-none">
                              <input
                                type="checkbox"
                                className="form-check-input m-0"
                                checked={selectedGroupIds.length === 0}
                                onChange={() => setSelectedGroupIds([])}
                              />
                              <span className="fw-semibold">{t("calendar.allGroups")}</span>
                            </label>
                            <hr className="my-1" />
                            {userGroups.map((group) => (
                              <label
                                key={group.id}
                                className="d-flex align-items-center gap-2 px-2 py-1 rounded small user-select-none"
                                style={{ cursor: "pointer" }}
                              >
                                <input
                                  type="checkbox"
                                  className="form-check-input m-0"
                                  checked={selectedGroupIds.includes(group.id)}
                                  onChange={() => setSelectedGroupIds(prev =>
                                    prev.includes(group.id) ? prev.filter(id => id !== group.id) : [...prev, group.id]
                                  )}
                                />
                                <span className="text-truncate">{group.name}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="d-flex align-items-center gap-2">
                      <span className="small text-muted">{t("calendar.page")} {pastPage} / {Math.ceil(past.length / pastPageSize)}</span>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        icon="fas fa-chevron-left"
                        onClick={() => setPastPage(p => Math.max(1, p - 1))}
                        disabled={pastPage <= 1}
                      />
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        icon="fas fa-chevron-right"
                        onClick={() => setPastPage(p => Math.min(Math.ceil(past.length / pastPageSize), p + 1))}
                        disabled={pastPage >= Math.ceil(past.length / pastPageSize)}
                      />
                    </div>
                  </div>
                </div>
                <div className="list-group list-group-flush">
                  {past
                    .slice((pastPage - 1) * pastPageSize, pastPage * pastPageSize)
                    .map((event) => (
                      <EventListItem key={event.id} event={event} i18n={i18n} t={t} onClick={() => openDetail(event)} dimmed />
                    ))}
                </div>
              </section>
            )}
          </div>
        </div>
      )}

      {/* Detail modal */}
      <Modal
        isVisible={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        title={selectedEvent?.title || ""}
        subtitle={
          selectedEvent && selectedEvent.ends_at && !isSameDay(parseServerDate(selectedEvent.starts_at), parseServerDate(selectedEvent.ends_at))
            ? `${formatEventDate(selectedEvent.starts_at, i18n.language)} – ${formatEventDate(selectedEvent.ends_at, i18n.language)}`
            : selectedEvent
              ? formatEventDate(selectedEvent.starts_at, i18n.language)
              : ""
        }
        icon="📅"
        headerGradient="linear-gradient(135deg, #14532d 0%, #16a34a 100%)"
        size="lg"
        footer={
          selectedEvent && (
            <div className="d-flex justify-content-between w-100">
              <div>
                {canEdit && (
                  <Button variant="outline-primary" icon="fas fa-pen" onClick={() => openEditForm(selectedEvent)}>
                    {t("calendar.edit")}
                  </Button>
                )}
                {canDelete && (
                  <Button variant="outline-danger" icon="fas fa-trash" className="ms-2" onClick={handleDelete} loading={deleteMutation.isPending}>
                    {t("calendar.delete")}
                  </Button>
                )}
              </div>
              <Button variant="secondary" icon="fas fa-xmark" onClick={() => setSelectedEvent(null)}>
                {t("calendar.close")}
              </Button>
            </div>
          )
        }
      >
        {selectedEvent && (
          <div className="row g-3">
            <div className="col-12">
              <KindBadge kind={selectedEvent.kind} t={t} />
              {selectedEvent.team_name && (
                <span className="badge bg-dark ms-2">
                  <i className="fas fa-users me-1"></i>
                  {selectedEvent.team_name}
                </span>
              )}
            </div>
            <div className="col-md-6">
              <div className="d-flex align-items-center gap-2 text-muted small mb-2">
                <i className="fas fa-clock"></i>
                <span>
                  {!selectedEvent.ends_at ||
                  isSameDay(parseServerDate(selectedEvent.starts_at), parseServerDate(selectedEvent.ends_at)) ? (
                    <>
                      {formatEventTime(selectedEvent.starts_at, i18n.language)}
                      {selectedEvent.ends_at && (
                        <>
                          {" – "}
                          {formatEventTime(selectedEvent.ends_at, i18n.language)}
                        </>
                      )}
                    </>
                  ) : (
                    <>
                      {formatEventDate(selectedEvent.starts_at, i18n.language)}{" "}
                      {formatEventTime(selectedEvent.starts_at, i18n.language)}
                      {" – "}
                      {formatEventDate(selectedEvent.ends_at, i18n.language)}{" "}
                      {formatEventTime(selectedEvent.ends_at, i18n.language)}
                    </>
                  )}
                </span>
              </div>
              {selectedEvent.location && (
                <div className="d-flex align-items-center gap-2 text-muted small">
                  <i className="fas fa-location-dot"></i>
                  <span>{selectedEvent.location}</span>
                </div>
              )}
            </div>
            <div className="col-12">
              {selectedEvent.description ? (
                <RichTextContent className="markdown-body" value={selectedEvent.description} />
              ) : (
                <p className="mb-0">
                  <em className="text-muted">—</em>
                </p>
              )}
            </div>

            {selectedEvent.linked_posts?.length > 0 && (
              <div className="col-12">
                <h3 className="h6 mb-2">
                  <i className="fas fa-newspaper me-2 text-primary" aria-hidden="true" />
                  {t("calendar.relatedPosts")}
                </h3>
                <div className="list-group">
                  {selectedEvent.linked_posts.map((post) => (
                    <Link key={post.id} className="list-group-item list-group-item-action" to={`/posts/${post.id}`}>
                      {post.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            <div className="col-12">
              <hr />
              <h3 className="h6">
                <i className="fas fa-calendar-day me-2 text-success"></i>
                {t("calendar.myPlannedAttendance")}
              </h3>
              {selectedEvent.requires_planned &&
                !myPlannedByEvent[selectedEvent.id] &&
                !isDeadlinePassed(selectedEvent) && (
                  <div className="alert alert-warning py-2 mb-2">
                    <i className="fas fa-exclamation-triangle me-1"></i>
                    {t("calendar.forcedPreregistration")}
                  </div>
                )}
              <div className="btn-group" role="group" aria-label={t("calendar.myPlannedAttendance")}>
                {["attending", "not_attending", "unknown"].map((status) => {
                  const active = myPlannedByEvent[selectedEvent.id] === status;
                  return (
                    <button
                      key={status}
                      type="button"
                      className={`btn btn-sm ${
                        active ? PLANNED_STATUS_META[status].badge : "btn-outline-secondary"
                      }`}
                      disabled={isDeadlinePassed(selectedEvent) || ownPlannedMutation.isPending}
                      onClick={() => handleSetOwnPlanned(selectedEvent.id, status)}
                    >
                      <i className={`fas ${PLANNED_STATUS_META[status].icon} me-1`}></i>
                      {t(PLANNED_STATUS_META[status].label)}
                    </button>
                  );
                })}
              </div>
              {!selectedEvent.requires_planned && (
                <div className="form-text">{t("calendar.myPlannedOptional")}</div>
              )}
            </div>

            {canAttendance && (
              <>
                <hr />
                <div className="col-12">
                  <div className="d-flex align-items-center justify-content-between gap-2 flex-wrap">
                    <div>
                      <h3 className="h6 mb-1">
                        <i className="fas fa-clipboard-user me-2 text-success"></i>
                        {t("calendar.attendance")}
                      </h3>
                      <span className="badge bg-success">
                        {t("calendar.presentCount")}:{" "}
                        {Object.values(selectedAttendance).filter(
                          (entry) =>
                            entry.mode === "real" &&
                            entry.status === "present" &&
                            isScopedMember(entry)
                        ).length}
                      </span>
                    </div>
                    <Button
                      variant="success"
                      icon="fas fa-clipboard-user"
                      onClick={() => openAttendance(selectedEvent)}
                    >
                      {t("calendar.manageAttendance")}
                    </Button>
                  </div>
                </div>

                {selectedEvent.requires_planned && plannedRows.length > 0 && (
                  <div className="col-12">
                    <h4 className="h6 text-muted mb-2">
                      <i className="fas fa-calendar-check me-2"></i>
                      {t("calendar.preregistration")}
                    </h4>
                    <div className="d-flex gap-2 mb-2 flex-wrap">
                      <span className="badge bg-success">
                        <i className="fas fa-check me-1"></i>
                        {t("calendar.yes")}: {plannedYes}
                      </span>
                      <span className="badge bg-danger">
                        <i className="fas fa-xmark me-1"></i>
                        {t("calendar.no")}: {plannedNo}
                      </span>
                    </div>
                    <div className="table-responsive">
                      <table className="table table-sm table-hover align-middle mb-0">
                        <thead>
                          <tr>
                            <th>{t("calendar.member")}</th>
                            <th>{t("calendar.answer")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plannedRows.map((entry) => {
                            const answer = plannedAnswer(entry.status);
                            const member = members.find((m) => m.id === entry.user_id);
                            const name = entry.user_name || member?.name || `#${entry.user_id}`;
                            return (
                              <tr key={`${entry.user_id}-planned`}>
                                <td className="fw-semibold">{name}</td>
                                <td>
                                  <span
                                    className={`badge ${
                                      answer === "yes" ? "bg-success" : answer === "no" ? "bg-danger" : "bg-secondary"
                                    }`}
                                  >
                                    <i
                                      className={`fas ${
                                        answer === "yes" ? "fa-check" : answer === "no" ? "fa-xmark" : "fa-question"
                                      } me-1`}
                                    ></i>
                                    {answer === "yes"
                                      ? t("calendar.yes")
                                      : answer === "no"
                                        ? t("calendar.no")
                                        : t("calendar.unknown")}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Modal>

      {/* Attendance modal */}
      <AttendanceDialog
        event={attendanceEvent}
        members={members}
        membersLoading={membersLoading}
        attendanceByEvent={attendanceByEvent}
        userId={userId}
        onAttendanceChange={handleAttendance}
        onClose={() => setAttendanceEvent(null)}
        onSendMessage={handleSendMessage}
        sendingMessage={messageMutation.isPending}
        messageResult={messageResult}
      />

      {/* Create/Edit modal */}
      <Modal
        isVisible={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? t("calendar.editEvent") : t("calendar.addEvent")}
        icon={editing ? "✏️" : "➕"}
        headerGradient="linear-gradient(135deg, #14532d 0%, #16a34a 100%)"
        size="lg"
        footer={
          <div className="d-flex justify-content-end gap-2 w-100">
            <Button variant="secondary" icon="fas fa-xmark" onClick={() => setFormOpen(false)}>
              {t("calendar.cancel")}
            </Button>
            <Button
              variant="success"
              icon="fas fa-save"
              loading={saveMutation.isPending}
              onClick={handleSave}
            >
              {t("calendar.save")}
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSave}>
          {formError && (
            <Alert type="warning" className="mb-3" icon={<></>}>
              {formError}
            </Alert>
          )}
          <div className="row g-3">
            <div className="col-12">
              <label className="form-label small fw-semibold">{t("calendar.titleField")} *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder={t("calendar.titleField")}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold">{t("calendar.kindField")}</label>
              <Select
                value={form.kind}
                onChange={(e) => setForm({ ...form, kind: e.target.value })}
                options={[
                  { value: "meeting", label: t("calendar.kindMeeting") },
                  { value: "trip", label: t("calendar.kindTrip") },
                  { value: "other", label: t("calendar.kindOther") },
                ]}
              />
            </div>
            {canPickTeam && (
              <div className="col-md-6">
                <label className="form-label small fw-semibold">{t("calendar.team")}</label>
                <Select
                  value={form.team_id}
                  onChange={(e) => setForm({ ...form, team_id: e.target.value })}
                  options={[
                    { value: "", label: t("calendar.unitWide") },
                    ...teams.map((team) => ({ value: String(team.id), label: team.name })),
                  ]}
                />
              </div>
            )}
            {isLeader && (
              <div className="col-md-6">
                <label className="form-label small fw-semibold">{t("calendar.audience")}</label>
                <Select
                  value={form.audience}
                  onChange={(e) => setForm({ ...form, audience: e.target.value })}
                  options={[
                    { value: "members", label: t("calendar.audienceAll") },
                    { value: "leaders", label: t("calendar.audienceLeaders") },
                  ]}
                />
              </div>
            )}
            <div className="col-md-6">
              <label className="form-label small fw-semibold">{t("calendar.startsAt")} *</label>
              <Input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => handleStartChange(e.target.value)}
                required
              />
            </div>
            <div className="col-md-6">
              <label className="form-label small fw-semibold">{t("calendar.endsAt")}</label>
              <Input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => handleEndChange(e.target.value)}
              />
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">{t("calendar.location")}</label>
              <Input
                icon="fas fa-location-dot"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder={t("calendar.location")}
              />
            </div>
            <div className="col-12">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="requires-planned"
                  checked={form.requires_planned}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      requires_planned: e.target.checked,
                      planned_deadline:
                        e.target.checked && !current.planned_deadline ? current.starts_at : current.planned_deadline,
                    }))
                  }
                />
                <label className="form-check-label" htmlFor="requires-planned">
                  <i className="fas fa-calendar-day me-1 text-success"></i>
                  {t("calendar.requiresPlanned")}
                </label>
              </div>
            </div>
            {form.requires_planned && (
              <div className="col-md-6">
                <label className="form-label small fw-semibold">{t("calendar.plannedDeadlineField")}</label>
                <Input
                  type="datetime-local"
                  value={form.planned_deadline}
                  onChange={(e) => setForm({ ...form, planned_deadline: e.target.value })}
                />
                <div className="form-text">{t("calendar.plannedDeadlineHint")}</div>
              </div>
            )}
            <div className="col-12">
              <div className="form-check">
                <input
                  type="checkbox"
                  className="form-check-input"
                  id="event-is-public"
                  checked={form.is_public}
                  onChange={(event) => setForm({ ...form, is_public: event.target.checked })}
                />
                <label className="form-check-label" htmlFor="event-is-public">
                  <i className="fas fa-globe me-1 text-success"></i>
                  {t("calendar.isPublic")}
                </label>
                <div className="form-text">{t("calendar.isPublicHint")}</div>
              </div>
            </div>
            <div className="col-12">
              <label className="form-label small fw-semibold">{t("calendar.description")}</label>
              <ArticleEditBox
                value={form.description}
                onChange={(description) => setForm((current) => ({ ...current, description }))}
                disabled={saveMutation.isPending}
              />
            </div>
          </div>
        </form>
      </Modal>
    </>
  );
}

function EventListItem({ event, i18n, t, onClick, dimmed, myStatus }) {
  const style = KIND_STYLES[event.kind] || KIND_STYLES.other;
  const deadlinePassed = isDeadlinePassed(event);
  const needsSignup =
    !myStatus && event.requires_planned && !deadlinePassed && parseServerDate(event.starts_at) >= new Date();
  const statusMeta = PLANNED_STATUS_META[myStatus] || REAL_STATUS_META[myStatus];
  return (
    <button
      type="button"
      className={`calendar-list-item list-group-item list-group-item-action d-flex align-items-center gap-3 border-0 ${dimmed ? "opacity-50" : ""}`}
      onClick={onClick}
    >
      <div className="text-center d-none d-md-block" style={{ minWidth: "44px" }}>
        <div className="fw-bold fs-5 text-success">{parseServerDate(event.starts_at).getDate()}</div>
        <div className="small text-muted text-uppercase">
          {parseServerDate(event.starts_at).toLocaleDateString(i18n.language === "cs" ? "cs-CZ" : "en-US", { month: "short" })}
        </div>
      </div>
      <div
        className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
        style={{ width: "38px", height: "38px", color: "white", fontSize: "15px", backgroundColor: eventColor(event) }}
      >
        <i className={`fas ${style.icon}`}></i>
      </div>
      <div className="flex-grow-1 min-w-0">
        <div className="fw-semibold text-truncate">{event.title}</div>
        <div className="small text-muted text-truncate">
          <i className="fas fa-clock me-1"></i>
          {event.ends_at && !isSameDay(parseServerDate(event.starts_at), parseServerDate(event.ends_at)) ? (
            <>
              {formatEventDate(event.starts_at, i18n.language)} {formatEventTime(event.starts_at, i18n.language)}
              {" – "}
              {formatEventDate(event.ends_at, i18n.language)} {formatEventTime(event.ends_at, i18n.language)}
            </>
          ) : (
            formatEventTime(event.starts_at, i18n.language)
          )}
          {event.location && (
            <>
              {" · "}
              <i className="fas fa-location-dot me-1"></i>
              {event.location}
            </>
          )}
          {event.team_name && (
            <>
              {" · "}
              <i className="fas fa-users me-1"></i>
              {event.team_name}
            </>
          )}
        </div>
      </div>
      <span className="flex-shrink-0">
        {myStatus && statusMeta ? (
          <span className={`badge ${statusMeta.badge}`}>
            <i className={`fas ${statusMeta.icon} me-1`}></i>
            {t(statusMeta.label)}
          </span>
        ) : needsSignup ? (
          <span className="badge bg-warning text-dark" title={t("calendar.signupNeeded")}>
            <i className="fas fa-exclamation me-1"></i>
            {t("calendar.signupNeeded")}
          </span>
        ) : (
          <span className="badge bg-secondary-subtle text-secondary">
            <i className="fas fa-minus"></i>
          </span>
        )}
      </span>
    </button>
  );
}
EventListItem.propTypes = {
  event: PropTypes.object.isRequired,
  i18n: PropTypes.object.isRequired,
  t: PropTypes.func.isRequired,
  onClick: PropTypes.func.isRequired,
  dimmed: PropTypes.bool,
  myStatus: PropTypes.string,
};

function toLocalInput(date, withTime = true) {
  const pad = (n) => String(n).padStart(2, "0");
  const base = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (!withTime) return base;
  return `${base}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const addHoursToInput = (value, hours = 1) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  date.setHours(date.getHours() + hours);
  return toLocalInput(date, true);
};
