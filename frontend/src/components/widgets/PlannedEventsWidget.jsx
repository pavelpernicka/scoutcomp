import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import api from "../../services/api";
import { useAuth } from "../../providers/AuthProvider";
import DecoratedCard from "../DecoratedCard";
import { formatDate } from "./utils";
import { parseServerDate } from "../../utils/dateUtils";

const STATUS_META = {
  present: { badge: "bg-success", icon: "fa-check", label: "calendar.present" },
  absent: { badge: "bg-danger", icon: "fa-xmark", label: "calendar.absent" },
  excused: { badge: "bg-warning text-dark", icon: "fa-umbrella-beach", label: "calendar.excused" },
  attending: { badge: "bg-success", icon: "fa-check", label: "calendar.attending" },
  not_attending: { badge: "bg-warning text-dark", icon: "fa-umbrella-beach", label: "calendar.not_attending" },
  unknown: { badge: "bg-secondary", icon: "fa-question", label: "calendar.unknown" },
};

const PLANNED_STATUS_OPTIONS = ["attending", "not_attending", "unknown"];

const KIND_STYLES = {
  meeting: { chip: "#0d6efd", icon: "fa-people-group", label: "calendar.meeting" },
  trip: { chip: "#198754", icon: "fa-tent", label: "calendar.trip" },
  other: { chip: "#0dcaf0", icon: "fa-flag", label: "calendar.other" },
};

export default function PlannedEventsWidget() {
  const { t, i18n } = useTranslation();
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data: events = [] } = useQuery({
    queryKey: ["activity-events"],
    queryFn: async () => {
      const { data } = await api.get("/activity/events");
      return data;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const { data: userTeams = [] } = useQuery({
    queryKey: ["user-teams", userId],
    queryFn: async () => {
      const { data } = await api.get(`/teams/${userId}/groups`);
      return data;
    },
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const signupMutation = useMutation({
    mutationFn: async ({ eventId, status }) => {
      const { data } = await api.post(`/activity/events/${eventId}/planned`, { status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-events"] });
    },
  });

  const unregisterMutation = useMutation({
    mutationFn: async (eventId) => {
      await api.delete(`/activity/events/${eventId}/planned`);
      return eventId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["activity-events"] });
    },
  });

  const upcoming = useMemo(() => {
    const now = new Date();
    return events
      .filter((event) => parseServerDate(event.starts_at) >= now)
      .sort((a, b) => parseServerDate(a.starts_at) - parseServerDate(b.starts_at))
      .slice(0, 6);
  }, [events]);

  const myStatusByEvent = useMemo(() => {
    const map = {};
    for (const event of events) {
      for (const entry of event.attendance || []) {
        if (entry.mode === "planned" && entry.user_id === userId) {
          map[event.id] = entry;
        }
      }
    }
    return map;
  }, [events, userId]);

  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";

  const getEventGroupLabel = (event) => {
    if (!event.filteredGroups || event.filteredGroups.length === 0) {
      return t("calendar.allGroups");
    }
    return event.filteredGroups
      .map(gId => userTeams.find(t => t.id === gId)?.name)
      .filter(Boolean)
      .join(", ");
  };

  return (
    <DecoratedCard
      title={t("dashboard.plannedEvents")}
      subtitle={t("dashboard.plannedEventsSubtitle")}
      icon={<span>📅</span>}
      headerGradient="linear-gradient(135deg, #14532d 0%, #22c55e 100%)"
      shadow={true}
      border={false}
      bodyClassName="p-0 d-flex flex-column"
      rightContent={
        <>
          <Link to="/activity" className="btn btn-sm btn-light text-success fw-semibold">
            <i className="fas fa-calendar-days me-1"></i>
            {t("dashboard.allEvents")}
          </Link>
        </>
      }
    >
      {upcoming.length === 0 ? (
        <div className="p-4 text-center text-muted">
          <i className="fas fa-calendar-check fs-3 mb-2 d-block opacity-50"></i>
          {t("dashboard.noPlannedEvents")}
        </div>
      ) : (
        <div className="d-flex flex-column">
          {upcoming.map((event, index) => {
            const style = KIND_STYLES[event.kind] || KIND_STYLES.other;
            const myEntry = myStatusByEvent[event.id];
            const status = myEntry?.status;
            const deadlinePassed =
              event.requires_planned &&
              event.planned_deadline &&
              parseServerDate(event.planned_deadline) < new Date();
            const registeredAt = myEntry?.created_at ? parseServerDate(myEntry.created_at) : null;

            return (
              <div
                key={event.id}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/activity?event=${event.id}`)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    navigate(`/activity?event=${event.id}`);
                  }
                }}
                className={`p-3 ${index !== upcoming.length - 1 ? "border-bottom" : ""} d-flex flex-column flex-md-row align-items-md-center gap-3 widget-event-row`}
                style={{ background: index % 2 === 0 ? "#f8f9fa" : "white", cursor: "pointer" }}
              >
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center flex-shrink-0"
                  style={{ width: "36px", height: "36px", color: "white", fontSize: "14px", backgroundColor: style.chip }}
                >
                  <i className={`fas ${style.icon}`}></i>
                </div>
                <div className="flex-grow-1 min-w-0">
                  <div className="fw-semibold text-truncate">{event.title}</div>
                  <div className="small text-muted d-flex flex-wrap gap-3">
                    <span>
                      <i className="fas fa-clock me-1"></i>
                      {parseServerDate(event.starts_at).toLocaleString(locale, {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {event.location && (
                      <span>
                        <i className="fas fa-map-marker-alt me-1"></i>
                        {event.location}
                      </span>
                    )}
                    {event.filteredGroups?.length > 0 && (
                      <span className="text-truncate" style={{ maxWidth: "200px" }}>
                        <i className="fas fa-users me-1"></i>
                        {getEventGroupLabel(event)}
                      </span>
                    )}
                    {registeredAt && (
                      <span className="text-info">
                        <i className="fas fa-user-check me-1"></i>
                        {t("calendar.registeredOn")}: {formatDate(registeredAt, locale)}
                      </span>
                    )}
                  </div>
                </div>
                <div className="d-flex flex-column flex-md-row align-items-md-center gap-2">
                  {status ? (
                    <>
                      <span className={`badge ${STATUS_META[status]?.badge || "bg-secondary"} small px-2 py-1`}>
                        <i className={`fas ${STATUS_META[status]?.icon || "fa-question"} me-1`}></i>
                        {t(STATUS_META[status]?.label || `calendar.${status}`)}
                      </span>
                      {!deadlinePassed && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          onClick={() => unregisterMutation.mutate(event.id)}
                          disabled={unregisterMutation.isPending}
                          title={t("calendar.unregister")}
                        >
                          <i className="fas fa-times me-1"></i>{t("calendar.unregister")}
                        </button>
                      )}
                    </>
                  ) : (
                    <div className="btn-group btn-group-sm" role="group" aria-label={event.title}>
                      {PLANNED_STATUS_OPTIONS.map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={`btn ${STATUS_META[value]?.badge ? STATUS_META[value].badge.replace("bg-", "btn-") : "btn-outline-secondary"}`}
                          disabled={Boolean(deadlinePassed) || signupMutation.isPending}
                          title={t(`calendar.${value}`)}
                          onClick={() => signupMutation.mutate({ eventId: event.id, status: value })}
                        >
                          <i className={`fas ${STATUS_META[value]?.icon || "fa-question"}`}></i>
                          <span className="d-none d-sm-inline ms-1">{t(`calendar.${value}`)}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DecoratedCard>
  );
}