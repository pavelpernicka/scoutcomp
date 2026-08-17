import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import api from "../../services/api";
import { useAuth } from "../../providers/AuthProvider";
import DecoratedCard from "../DecoratedCard";
import { parseServerDate } from "../../utils/dateUtils";
import EventMonthCalendar from "../calendar/EventMonthCalendar";
import DashboardWidgetIcon from "./DashboardWidgetIcon";

import "./PlannedEventsWidget.css";

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
  const [calendarMonth, setCalendarMonth] = useState(() => new Date());

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
      icon={<DashboardWidgetIcon>📅</DashboardWidgetIcon>}
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
        <div className="row g-0">
          <div className="col-12 col-lg-7 p-2 dashboard-events-calendar-pane">
            <div className="d-flex align-items-center justify-content-between px-1 pb-2">
              <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Předchozí měsíc" onClick={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}><i className="fas fa-chevron-left" /></button>
              <strong className="small text-capitalize">{calendarMonth.toLocaleDateString(locale, { month: "long", year: "numeric" })}</strong>
              <button type="button" className="btn btn-sm btn-outline-secondary" aria-label="Další měsíc" onClick={() => setCalendarMonth((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}><i className="fas fa-chevron-right" /></button>
            </div>
            <EventMonthCalendar
              events={events}
              viewDate={calendarMonth}
              onEventClick={(event) => navigate(`/activity?event=${event.id}`)}
              getEventColor={(event) => (KIND_STYLES[event.kind] || KIND_STYLES.other).chip}
              getEventLabel={(event) => parseServerDate(event.starts_at).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
              plannedStatusByEvent={myStatusByEvent}
              compact
            />
          </div>
          <div className="col-12 col-lg-5 d-flex flex-column dashboard-events-list">
          <div className="dashboard-events-list__heading">
            <span>Nadcházející akce</span>
            <span>{upcoming.length}</span>
          </div>
          {upcoming.map((event, index) => {
            const style = KIND_STYLES[event.kind] || KIND_STYLES.other;
            const myEntry = myStatusByEvent[event.id];
            const status = myEntry?.status || "unknown";
            const deadlinePassed =
              event.requires_planned &&
              event.planned_deadline &&
              parseServerDate(event.planned_deadline) < new Date();

            return (
              <div key={event.id} className={`p-3 ${index !== upcoming.length - 1 ? "border-bottom" : ""} widget-event-row dashboard-event-row`}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/activity?event=${event.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      navigate(`/activity?event=${event.id}`);
                    }
                  }}
                  className="d-flex flex-column flex-sm-row align-items-sm-center gap-3"
                  style={{ cursor: "pointer" }}
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
                      {status === "attending" && <span className="badge bg-success small px-2 py-1"><i className="fas fa-check me-1" />Přihlášen</span>}
                      {status === "not_attending" && <span className="badge bg-warning text-dark small px-2 py-1"><i className="fas fa-xmark me-1" />Omluven</span>}
                      {status === "unknown" && event.requires_planned && !deadlinePassed && <span className="badge bg-warning text-dark small px-2 py-1"><i className="fas fa-triangle-exclamation me-1" />Nutnost přihlášení</span>}
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
                    </div>
                  </div>
                </div>
                <div className="mt-3 d-flex flex-wrap align-items-center gap-2">
                  {!deadlinePassed && <div className="btn-group" role="group" aria-label={`Účast na akci ${event.title}`}>
                    {[
                      ["attending", "btn-success", "fa-check", "Zúčastním se"],
                      ["not_attending", "btn-warning", "fa-xmark", "Nezúčastním se"],
                      ["unknown", "btn-outline-secondary", "fa-question", "Nevím"],
                    ].map(([value, className, icon, label]) => <button key={value} type="button" className={`btn btn-sm ${status === value ? className : "btn-outline-secondary"}`} disabled={signupMutation.isPending} onClick={() => signupMutation.mutate({ eventId: event.id, status: value })}><i className={`fas ${icon} me-1`} /><span className="d-none d-xl-inline">{label}</span></button>)}
                  </div>}
                </div>
              </div>
            );
          })}
          </div>
        </div>
      )}
    </DecoratedCard>
  );
}
