import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import { parseServerDate } from "../utils/dateUtils";

const formatEvent = (event, locale) => {
  const date = parseServerDate(event.starts_at);
  const when = date ? date.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" }) : "";
  return [event.title, when, event.location].filter(Boolean).join(" · ");
};

/** Searchable event selector whose result list is portalled above enclosing dialogs. */
export default function EventPickerField({ value, onChange, disabled = false }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === "cs" ? "cs-CZ" : "en-US";
  const inputRef = useRef(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setQuery(search.trim()), 200);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useLayoutEffect(() => {
    if (!open || !inputRef.current) return undefined;
    const updatePosition = () => {
      const rect = inputRef.current?.getBoundingClientRect();
      if (rect) setMenuPosition({ left: rect.left, top: rect.bottom + 4, width: rect.width });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  const { data, isLoading } = useQuery({
    queryKey: ["activity-event-options", query, value],
    queryFn: async () => (await api.get("/activity/events/options", {
      params: { q: query || undefined, limit: 20, include_id: value || undefined },
    })).data,
    enabled: !disabled,
    staleTime: 30_000,
  });
  const events = data?.items || [];
  const selectedEvent = useMemo(() => events.find((event) => event.id === value) || null, [events, value]);

  const results = open && menuPosition && typeof document !== "undefined" && createPortal(
    <div id="post-linked-event-options" className="dropdown-menu show p-0 overflow-auto" style={{ position: "fixed", left: menuPosition.left, top: menuPosition.top, width: menuPosition.width, zIndex: 1060, maxHeight: "15rem" }} role="listbox">
      <div className="px-3 py-2 small text-muted border-bottom">{query ? t("web.eventSearchResults") : t("web.recentEvents")}</div>
      {isLoading ? <div className="px-3 py-2 small text-muted">{t("common.loading")}</div> : events.length === 0 ? <div className="px-3 py-2 small text-muted">{t("web.noEventResults")}</div> : events.map((event) => <button key={event.id} type="button" className={`dropdown-item small text-wrap ${event.id === value ? "active" : ""}`} onMouseDown={(clickEvent) => clickEvent.preventDefault()} onClick={() => { onChange(event); setSearch(""); setOpen(false); }}>
        {formatEvent(event, locale)}
      </button>)}
    </div>,
    document.body,
  );

  return <div className="event-picker-field">
    {selectedEvent && <div className="d-flex align-items-center gap-2 mb-2 small">
      <span className="badge bg-primary text-truncate" title={formatEvent(selectedEvent, locale)}>{formatEvent(selectedEvent, locale)}</span>
      <button type="button" className="btn btn-link btn-sm p-0" onClick={() => onChange(null)} disabled={disabled}>{t("web.removeLinkedEvent")}</button>
    </div>}
    <input
      ref={inputRef}
      type="search"
      className="form-control form-control-sm"
      value={search}
      disabled={disabled}
      placeholder={t("web.searchEvent")}
      role="combobox"
      aria-expanded={open}
      aria-controls="post-linked-event-options"
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onChange={(event) => { setSearch(event.target.value); setOpen(true); }}
    />
    {results}
  </div>;
}

EventPickerField.propTypes = {
  value: PropTypes.number,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
