import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import Modal from "./Modal";
import Button from "./Button";
import Select from "./Select";
import LoadingSpinner from "./LoadingSpinner";
import { parseServerDate } from "../utils/dateUtils";

const STATUSES = ["present", "absent", "excused"];

const STATUS_BADGE = {
  present: "bg-success",
  absent: "bg-danger",
  excused: "bg-warning text-dark",
};

const STATUS_ICON = {
  present: "fa-check",
  absent: "fa-xmark",
  excused: "fa-umbrella-beach",
};

export default function AttendanceDialog({
  event,
  members,
  membersLoading,
  attendanceByEvent,
  userId,
  onAttendanceChange,
  onClose,
  onSendMessage,
  sendingMessage,
  messageResult,
}) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState("real");
  const [search, setSearch] = useState("");
  const [messageText, setMessageText] = useState("");

  useEffect(() => {
    if (event?.id) setMode("real");
  }, [event?.id]);

  const byUser = attendanceByEvent[event?.id] || {};

  const scopedMembers = useMemo(() => members || [], [members]);
  const scopedMemberIds = useMemo(
    () => new Set(scopedMembers.map((member) => member.id)),
    [scopedMembers]
  );

  const filteredMembers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return scopedMembers;
    return scopedMembers.filter((member) => member.name?.toLowerCase().includes(query));
  }, [scopedMembers, search]);

  const memberGroups = useMemo(() => [
    {
      key: "members",
      label: t("calendar.attendanceMembers"),
      icon: "fa-user",
      members: filteredMembers.filter((member) => !member.is_leader),
    },
    {
      key: "leaders",
      label: t("calendar.attendanceLeaders"),
      icon: "fa-user-shield",
      members: filteredMembers.filter((member) => member.is_leader),
    },
  ], [filteredMembers, t]);

  const counts = useMemo(() => {
    const result = { present: 0, absent: 0, excused: 0 };
    for (const entry of Object.values(byUser)) {
      if (entry.mode !== mode) continue;
      if (!scopedMemberIds.has(entry.user_id)) continue;
      result[entry.status] = (result[entry.status] || 0) + 1;
    }
    return result;
  }, [byUser, mode, scopedMemberIds]);

  const deadlinePassed = useMemo(() => {
    if (!event?.requires_planned || !event?.planned_deadline) return false;
    return parseServerDate(event.planned_deadline) < new Date();
  }, [event]);

  const deadlineText = event?.planned_deadline
    ? parseServerDate(event.planned_deadline).toLocaleString(
        i18n.language === "cs" ? "cs-CZ" : "en-US",
        { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }
      )
    : null;

  const realByMember = useMemo(() => {
    const map = {};
    for (const entry of Object.values(byUser)) {
      if (entry.mode === "real") map[entry.user_id] = entry;
    }
    return map;
  }, [byUser]);

  const plannedByMember = useMemo(() => {
    const map = {};
    for (const entry of Object.values(byUser)) {
      if (entry.mode === "planned") map[entry.user_id] = entry;
    }
    return map;
  }, [byUser]);

  const realStats = useMemo(() => {
    const result = { present: 0, absent: 0, excused: 0 };
    const plannedNotAttending = new Set(["not_attending", "absent", "excused"]);
    for (const member of scopedMembers) {
      const real = realByMember[member.id];
      const planned = plannedByMember[member.id];
      if (real?.status === "present") result.present++;
      else if (real?.status === "excused") result.excused++;
      else if (planned && plannedNotAttending.has(planned.status)) result.excused++;
      else result.absent++;
    }
    return result;
  }, [scopedMembers, realByMember, plannedByMember]);

  const statCounts = mode === "real" ? realStats : counts;

  const realPresent = realStats.present;
  const plannedPresent = Object.values(byUser).filter(
    (entry) => entry.mode === "planned" && entry.status === "present" && scopedMemberIds.has(entry.user_id)
  ).length;

  const handleSend = () => {
    const text = messageText.trim();
    if (!text) return;
    onSendMessage(text);
    setMessageText("");
  };

  const renderMemberRow = (member) => {
    const record = Object.values(byUser).find(
      (entry) => entry.user_id === member.id && entry.mode === mode
    );
    const status = record?.status || "";
    return (
      <div
        key={member.id}
        className="list-group-item attendance-member-row d-flex align-items-center justify-content-between gap-2"
      >
        <span className="text-truncate">
          {member.name}
          {member.id === userId && (
            <span className="badge bg-success ms-1">★</span>
          )}
          {mode === "real" && (
            <>
              {" "}
              {status ? (
                <span className={`badge ${STATUS_BADGE[status] || "bg-secondary"} ms-1`}>
                  <i className={`fas ${STATUS_ICON[status] || "fa-minus"} me-1`}></i>
                  {t(`calendar.${status}`)}
                </span>
              ) : (
                <span className="badge bg-secondary-subtle text-secondary ms-1">
                  {t("calendar.notFilledYet")}
                </span>
              )}
            </>
          )}
        </span>
        <Select
          className="form-select-sm"
          style={{ width: "140px" }}
          value={status}
          onChange={(e) => onAttendanceChange(event.id, member.id, mode, e.target.value)}
          placeholder={t("calendar.notFilledYet")}
          options={[
            { value: "present", label: t("calendar.present") },
            { value: "absent", label: t("calendar.absent") },
            { value: "excused", label: t("calendar.excused") },
          ]}
        />
      </div>
    );
  };

  return (
    <Modal
      isVisible={Boolean(event)}
      onClose={onClose}
      title={event?.title || ""}
      subtitle={`${t("calendar.attendance")} – ${
        mode === "planned" ? t("calendar.plannedAttendance") : t("calendar.realAttendance")
      }`}
      icon="📋"
      headerGradient="linear-gradient(135deg, #14532d 0%, #16a34a 100%)"
      size="lg"
      footer={
        event && (
          <div className="d-flex justify-content-between align-items-center w-100">
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-success">
                <i className="fas fa-clipboard-check me-1"></i>
                {t("calendar.presentCount")}: {realPresent}
              </span>
              <span className="badge bg-info">
                <i className="fas fa-calendar-day me-1"></i>
                {t("calendar.plannedCount")}: {plannedPresent}
              </span>
            </div>
            <Button variant="secondary" icon="fas fa-xmark" onClick={onClose}>
              {t("calendar.close")}
            </Button>
          </div>
        )
      }
    >
      {event && (
        <div className="d-flex flex-column gap-3">
          <div className="btn-group w-100" role="group">
            <button
              type="button"
              className={`btn btn-sm ${mode === "planned" ? "btn-info" : "btn-outline-info"}`}
              onClick={() => setMode("planned")}
            >
              <i className="fas fa-calendar-day me-1"></i>
              {t("calendar.plannedAttendance")}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${mode === "real" ? "btn-success" : "btn-outline-success"}`}
              onClick={() => setMode("real")}
            >
              <i className="fas fa-clipboard-check me-1"></i>
              {t("calendar.realAttendance")}
            </button>
          </div>

          {mode === "planned" && event.requires_planned && event.planned_deadline && (
            <div className={`alert ${deadlinePassed ? "alert-warning" : "alert-info"} py-2 mb-0`}>
              <i className="fas fa-clock me-1"></i>
              {t("calendar.plannedDeadline", { date: deadlineText || "–" })}
              {deadlinePassed && <span className="ms-1">({t("calendar.deadlinePassed")})</span>}
            </div>
          )}

          <div className="d-flex gap-2 flex-wrap">
            {STATUSES.map((status) => (
              <span key={status} className={`badge ${STATUS_BADGE[status]}`}>
                <i className={`fas ${STATUS_ICON[status]} me-1`}></i>
                {t(`calendar.${status}`)}: {statCounts[status] || 0}
              </span>
            ))}
          </div>

          <div className="input-group">
            <span className="input-group-text">
              <i className="fas fa-magnifying-glass"></i>
            </span>
            <input
              type="text"
              className="form-control"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("calendar.searchMembers")}
            />
          </div>

          <div className="attendance-member-list" style={{ maxHeight: "320px", overflowY: "auto" }}>
            {membersLoading ? (
              <div className="py-4">
                <LoadingSpinner text={t("calendar.loading")} />
              </div>
            ) : filteredMembers.length === 0 ? (
              <em className="text-muted">{t("calendar.noMembers")}</em>
            ) : (
              memberGroups.map((group) => (
                <section className="attendance-member-group" key={group.key} aria-labelledby={`attendance-${group.key}`}>
                  <h3 id={`attendance-${group.key}`} className="attendance-member-group__heading">
                    <span><i className={`fas ${group.icon}`} aria-hidden="true" /> {group.label}</span>
                    <span className="badge bg-secondary">{group.members.length}</span>
                  </h3>
                  {group.members.length > 0 ? (
                    <div className="list-group list-group-flush">
                      {group.members.map(renderMemberRow)}
                    </div>
                  ) : (
                    <div className="attendance-member-group__empty" aria-hidden="true">—</div>
                  )}
                </section>
              ))
            )}
          </div>

          <div className="border-top pt-3">
            <label className="form-label small fw-semibold">
              <i className="fas fa-paper-plane me-1 text-success"></i>
              {t("calendar.messageAttendees")}
            </label>
            <div className="input-group">
              <textarea
                className="form-control"
                rows={2}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder={t("calendar.messageAttendeesPlaceholder")}
              ></textarea>
              <Button
                variant="success"
                icon="fas fa-paper-plane"
                loading={sendingMessage}
                onClick={handleSend}
              >
                {t("calendar.send")}
              </Button>
            </div>
            {messageResult && <div className="form-text text-success mt-1">{messageResult}</div>}
          </div>
        </div>
      )}
    </Modal>
  );
}

AttendanceDialog.propTypes = {
  event: PropTypes.object,
  members: PropTypes.array,
  membersLoading: PropTypes.bool,
  attendanceByEvent: PropTypes.object,
  userId: PropTypes.number,
  onAttendanceChange: PropTypes.func.isRequired,
  onClose: PropTypes.func.isRequired,
  onSendMessage: PropTypes.func.isRequired,
  sendingMessage: PropTypes.bool,
  messageResult: PropTypes.string,
};
