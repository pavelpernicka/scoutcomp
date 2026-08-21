import PropTypes from "prop-types";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import Modal from "../Modal";
import { parseServerDate } from "../../utils/dateUtils";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const PCT = 100 / 7;
const CELL_HEIGHT = 110;
const BAR_HEIGHT = 24;
const BAR_GAP = 2;
const BAR_TOP_OFFSET = 26;
const MAX_LANES = 3;
const COMPACT_CELL_HEIGHT = 84;
const COMPACT_BAR_HEIGHT = 18;
const COMPACT_BAR_TOP_OFFSET = 22;
const COMPACT_VISIBLE_LANES = 2;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const daysBetween = (a, b) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
const plannedStatusIcon = (value) => {
  const status = typeof value === "string" ? value : value?.status;
  if (status === "attending") return "fa-check";
  if (status === "not_attending") return "fa-xmark";
  return null;
};

/** Builds the overlapping-event lanes shared by the full calendar and dashboard. */
export const buildEventMonthLayout = (events, viewDate) => {
  const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const count = Math.ceil((offset + new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate()) / 7);
  return Array.from({ length: count }, (_, week) => {
    const days = Array.from({ length: 7 }, (_, column) => new Date(viewDate.getFullYear(), viewDate.getMonth(), 1 - offset + week * 7 + column));
    const weekStart = days[0];
    const weekEnd = days[6];
    const items = (events || []).flatMap((event) => {
      const start = startOfDay(parseServerDate(event.starts_at));
      if (Number.isNaN(start.getTime())) return [];
      const rawEnd = event.ends_at ? parseServerDate(event.ends_at) : null;
      const end = rawEnd ? startOfDay(rawEnd) : new Date(start);
      if (rawEnd && rawEnd.getHours() === 0 && rawEnd.getMinutes() === 0) end.setDate(end.getDate() - 1);
      if (end < start) end.setTime(start.getTime());
      if (end < weekStart || start > weekEnd) return [];
      return [{ event, startCol: Math.max(0, daysBetween(start, weekStart)), endCol: Math.min(6, Math.max(0, daysBetween(end, weekStart))), continuesBefore: start < weekStart, continuesAfter: end > weekEnd }];
    }).sort((a, b) => a.startCol - b.startCol || parseServerDate(a.event.starts_at) - parseServerDate(b.event.starts_at));
    const lanes = [];
    items.forEach((item) => {
      const lane = lanes.findIndex((lastEnd) => lastEnd <= item.startCol);
      item.lane = lane === -1 ? lanes.length : lane;
      lanes[item.lane] = item.endCol + 1;
    });
    return { days, items };
  });
};

function CalendarOverflowIndicator({ column, count, height, onClick, top }) {
  const { t } = useTranslation();
  const label = `+${count} ${t("calendar.more")}`;

  return <div
    className="calendar-event-overflow"
    style={{ left: `${column * PCT}%`, width: `${PCT}%`, top, height }}
  >
    <button
      type="button"
      className="calendar-event-overflow-trigger"
      aria-label={label}
      onClick={onClick}
    >
      {label}
    </button>
  </div>;
}

CalendarOverflowIndicator.propTypes = {
  column: PropTypes.number.isRequired,
  count: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  onClick: PropTypes.func.isRequired,
  top: PropTypes.number.isRequired,
};

export default function EventMonthCalendar({ events, viewDate, onEventClick, onCreateDay, canCreate = false, getEventColor, getEventLabel, plannedStatusByEvent = {}, compact = false }) {
  const { t, i18n } = useTranslation();
  const [overflowSelection, setOverflowSelection] = useState(null);
  const layout = buildEventMonthLayout(events, viewDate);
  const today = new Date();
  const cellHeight = compact ? COMPACT_CELL_HEIGHT : CELL_HEIGHT;
  const barHeight = compact ? COMPACT_BAR_HEIGHT : BAR_HEIGHT;
  const barTopOffset = compact ? COMPACT_BAR_TOP_OFFSET : BAR_TOP_OFFSET;
  const laneStep = barHeight + BAR_GAP;
  const closeOverflow = () => setOverflowSelection(null);
  const openOverflowEvent = (event) => {
    closeOverflow();
    onEventClick?.(event);
  };
  const formatModalEventRange = (event) => {
    const start = parseServerDate(event.starts_at);
    const end = parseServerDate(event.ends_at);
    if (!start || !end || isSameDay(start, end)) return getEventLabel(event);
    const options = {
      day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit",
    };
    return `${start.toLocaleString(i18n.language, options)} – ${end.toLocaleString(i18n.language, options)}`;
  };
  const overflowTitle = overflowSelection
    ? overflowSelection.day.toLocaleDateString(i18n.language, { day: "numeric", month: "long", year: "numeric" })
    : "";
  const selectDay = (day, dayEvents) => {
    if (canCreate) {
      onCreateDay?.(day);
      return;
    }
    setOverflowSelection({ day, events: dayEvents });
  };

  return <>
  <div className={`event-month-calendar ${compact ? "event-month-calendar-compact" : ""}`}>
    <div className="w-100">
      <div className="d-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {WEEKDAYS.map((day) => <div key={day} className="text-center bg-success text-white py-2 small fw-semibold border">{t(`calendar.${day}`)}</div>)}
      </div>
      {layout.map((week, weekIndex) => {
        const needsOverflowLane = week.items.some((item) => item.lane >= MAX_LANES);
        const visibleLanes = compact ? COMPACT_VISIBLE_LANES : needsOverflowLane ? MAX_LANES - 1 : MAX_LANES;
        return <div key={weekIndex} className="position-relative d-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", borderTop: "1px solid #dee2e6" }}>
        {week.items.map((item) => {
          const statusIcon = plannedStatusIcon(plannedStatusByEvent[item.event.id]);
          return item.lane < visibleLanes && <button key={`${item.event.id}-${weekIndex}`} type="button" className="calendar-event-bar d-block text-start border-0 rounded-1 text-white text-truncate" style={{ position: "absolute", left: `${item.startCol * PCT}%`, width: `${(item.endCol - item.startCol + 1) * PCT}%`, top: barTopOffset + item.lane * laneStep, height: barHeight, lineHeight: `${barHeight}px`, padding: "0 6px", zIndex: 2, backgroundColor: getEventColor(item.event) }} title={item.event.title} onClick={(event) => { event.stopPropagation(); onEventClick?.(item.event); }}>
            {item.continuesBefore && <i className="fas fa-chevron-left me-1 small" />}{item.event.title}{!item.continuesBefore && <span className="ms-1">{getEventLabel(item.event)}</span>}{statusIcon && <i className={`fas ${statusIcon} ms-1 small`} />}{item.continuesAfter && <i className="fas fa-chevron-right ms-1 small" />}
          </button>;
        })}
        {week.days.map((day, column) => {
          const dayEvents = week.items.filter((item) => column >= item.startCol && column <= item.endCol);
          const hiddenEvents = dayEvents.filter((item) => item.lane >= visibleLanes);
          return hiddenEvents.length > 0 && <CalendarOverflowIndicator
            key={`overflow-${day.toISOString()}`}
            column={column}
            count={hiddenEvents.length}
            height={barHeight}
            onClick={() => setOverflowSelection({ day, events: dayEvents })}
            top={barTopOffset + visibleLanes * laneStep}
          />;
        })}
        {week.days.map((day, column) => {
          const inMonth = day.getMonth() === viewDate.getMonth();
          const todayClass = isSameDay(day, today);
          const dayEvents = week.items.filter((item) => column >= item.startCol && column <= item.endCol);
          const activateDay = () => inMonth && selectDay(day, dayEvents);
          return <div
            key={day.toISOString()}
            className={`calendar-day ${inMonth ? "" : "bg-light"}`}
            role={inMonth ? "button" : undefined}
            tabIndex={inMonth ? 0 : undefined}
            aria-label={inMonth ? `${day.toLocaleDateString(i18n.language)}, ${dayEvents.length} ${t("calendar.eventsCount")}` : undefined}
            style={{ height: `${cellHeight}px`, minWidth: 0, overflow: "hidden", borderRight: "1px solid #dee2e6", cursor: inMonth ? "pointer" : "default", backgroundColor: todayClass ? "#d8f3dc" : undefined }}
            onClick={activateDay}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                activateDay();
              }
            }}
          >
            <div className="d-flex justify-content-between align-items-center p-1"><span className={todayClass ? "fw-bold text-success" : inMonth ? "text-muted" : "text-muted opacity-50"}>{day.getDate()}</span></div>
          </div>;
        })}
      </div>;
      })}
    </div>
  </div>
  <Modal
    isVisible={Boolean(overflowSelection)}
    onClose={closeOverflow}
    title={overflowTitle}
    icon={<i className="fas fa-calendar-days" />}
    size="sm"
  >
    <div className="calendar-overflow-modal-list list-group list-group-flush">
      {overflowSelection?.events.length === 0 && <p className="mb-0 py-3 text-center text-muted">{t("calendar.noEventsOnDay")}</p>}
      {(overflowSelection?.events || []).map(({ event }) => <button
        key={event.id}
        type="button"
        className="calendar-overflow-modal-event list-group-item list-group-item-action d-flex align-items-start gap-3"
        style={{ "--calendar-event-color": getEventColor(event) }}
        onClick={() => openOverflowEvent(event)}
      >
        <span className="calendar-overflow-modal-color" aria-hidden="true" />
        <span className="min-w-0 text-start">
          <span className="d-block small text-muted">{formatModalEventRange(event)}</span>
          <strong className="d-block text-break">{event.title}</strong>
        </span>
      </button>)}
    </div>
  </Modal>
  </>;
}

EventMonthCalendar.propTypes = {
  events: PropTypes.array.isRequired,
  viewDate: PropTypes.instanceOf(Date).isRequired,
  onEventClick: PropTypes.func,
  onCreateDay: PropTypes.func,
  canCreate: PropTypes.bool,
  getEventColor: PropTypes.func.isRequired,
  getEventLabel: PropTypes.func.isRequired,
  plannedStatusByEvent: PropTypes.object,
  compact: PropTypes.bool,
};
