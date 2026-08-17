import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import { parseServerDate } from "../../utils/dateUtils";

const WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const PCT = 100 / 7;
const CELL_HEIGHT = 110;
const BAR_HEIGHT = 24;
const BAR_GAP = 2;
const BAR_TOP_OFFSET = 26;
const MAX_LANES = 3;
const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const isSameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const daysBetween = (a, b) => Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);

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

export default function EventMonthCalendar({ events, viewDate, onEventClick, onCreateDay, canCreate = false, getEventColor, getEventLabel, plannedStatusByEvent = {}, compact = false }) {
  const { t } = useTranslation();
  const layout = buildEventMonthLayout(events, viewDate);
  const today = new Date();
  return <div className={`event-month-calendar ${compact ? "event-month-calendar-compact" : ""}`}>
    <div className="w-100">
      <div className="d-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)" }}>
        {WEEKDAYS.map((day) => <div key={day} className="text-center bg-success text-white py-2 small fw-semibold border">{t(`calendar.${day}`)}</div>)}
      </div>
      {layout.map((week, weekIndex) => <div key={weekIndex} className="position-relative d-grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", borderTop: "1px solid #dee2e6" }}>
        {week.items.map((item) => item.lane < MAX_LANES && <button key={`${item.event.id}-${weekIndex}`} type="button" className="calendar-event-bar d-block text-start border-0 rounded-1 text-white text-truncate" style={{ position: "absolute", left: `${item.startCol * PCT}%`, width: `${(item.endCol - item.startCol + 1) * PCT}%`, top: BAR_TOP_OFFSET + item.lane * (BAR_HEIGHT + BAR_GAP), height: BAR_HEIGHT, lineHeight: `${BAR_HEIGHT}px`, padding: "0 6px", zIndex: 2, backgroundColor: getEventColor(item.event) }} title={item.event.title} onClick={(event) => { event.stopPropagation(); onEventClick?.(item.event); }}>
          {item.continuesBefore ? <i className="fas fa-chevron-left me-1 small" /> : <span className="me-1">{getEventLabel(item.event)}</span>}{item.event.title}{plannedStatusByEvent[item.event.id] && <i className="fas fa-check ms-1 small" />}{item.continuesAfter && <i className="fas fa-chevron-right ms-1 small" />}
        </button>)}
        {week.days.map((day) => {
          const inMonth = day.getMonth() === viewDate.getMonth();
          const todayClass = isSameDay(day, today);
          const column = daysBetween(day, week.days[0]);
          const hidden = week.items.filter((item) => item.lane >= MAX_LANES && column >= item.startCol && column <= item.endCol).length;
          return <div key={day.toISOString()} className={`calendar-day ${inMonth ? "" : "bg-light"}`} style={{ height: `${compact ? 84 : CELL_HEIGHT}px`, minWidth: 0, overflow: "hidden", borderRight: "1px solid #dee2e6", cursor: inMonth && canCreate ? "pointer" : "default", backgroundColor: todayClass ? "#d8f3dc" : undefined }} onClick={() => inMonth && canCreate && onCreateDay?.(day)}>
            <div className="d-flex justify-content-between align-items-center p-1"><span className={todayClass ? "fw-bold text-success" : inMonth ? "text-muted" : "text-muted opacity-50"}>{day.getDate()}</span></div>
            {hidden > 0 && <div className="small text-muted ps-2">+{hidden} {t("calendar.more")}</div>}
          </div>;
        })}
      </div>)}
    </div>
  </div>;
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
