import { useId, useState, useRef, useEffect } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

/** Multi-select dropdown for event team scope. Whole unit (empty) or one/more teams. */
export default function TeamScopePicker({
  value,
  onChange,
  teams,
  disabled = false,
  isLoading = false,
  error = false,
  allowWholeUnit = true,
}) {
  const { t } = useTranslation();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  const selectedIds = new Set(value.map(Number));

  const isAll = value.length === 0;

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleToggleAll = () => {
    if (isAll) return;
    onChange([]);
  };

  const handleToggleTeam = (teamId) => {
    const id = Number(teamId);
    if (selectedIds.has(id)) {
      const next = value.filter((v) => Number(v) !== id);
      onChange(next.length === 0 ? [] : next);
    } else {
      onChange([...value.map(Number), id]);
    }
  };

  const label = isAll
    ? t("calendar.unitWide")
    : teams
        .filter((t) => selectedIds.has(Number(t.id)))
        .map((t) => t.name)
        .join(", ");

  return (
    <div>
      <label className="form-label small fw-semibold mb-1">
        {t("calendar.teamScope")}
      </label>
      <div className="position-relative" ref={containerRef}>
        <button
          type="button"
          className={`form-select text-start${error ? " is-invalid" : ""}`}
          disabled={disabled || isLoading}
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-describedby={`${fieldId}-hint`}
          style={{ minWidth: 0 }}
        >
          {isLoading ? (
            <>
              <i className="fas fa-spinner fa-spin me-1" aria-hidden="true" />
              {t("calendar.teamsLoading")}
            </>
          ) : (
            <span className={isAll ? "" : "fw-semibold"}>{label}</span>
          )}
        </button>
        {open && (
          <div
            className="position-absolute start-0 w-100 border rounded bg-white shadow-sm"
            style={{ zIndex: 1000, maxHeight: "16rem", overflowY: "auto" }}
          >
            {allowWholeUnit && (
              <label className="d-flex align-items-center gap-2 px-3 py-2 m-0 user-select-none cursor-pointer"
                style={{ cursor: "pointer" }}>
                <input
                  type="radio"
                  className="form-check-input m-0"
                  name={`${fieldId}-all`}
                  checked={isAll}
                  onChange={handleToggleAll}
                />
                <span>
                  <span className="d-block fw-semibold small">{t("calendar.unitWide")}</span>
                  <span className="d-block text-muted" style={{ fontSize: ".75rem" }}>
                    {t("calendar.unitWideHint")}
                  </span>
                </span>
              </label>
            )}

            {allowWholeUnit && <hr className="my-0" />}

            {teams.map((team) => (
              <label
                key={team.id}
                className="d-flex align-items-center gap-2 px-3 py-2 m-0 user-select-none"
                style={{ cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  className="form-check-input m-0"
                  checked={selectedIds.has(Number(team.id))}
                  onChange={() => handleToggleTeam(team.id)}
                />
                <span className="small">{team.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>
      <div id={`${fieldId}-hint`} className="form-text">
        {allowWholeUnit
          ? t("calendar.teamScopeHint")
          : t("calendar.teamScopeTeamsOnlyHint")}
      </div>
    </div>
  );
}

TeamScopePicker.propTypes = {
  value: PropTypes.arrayOf(PropTypes.number).isRequired,
  onChange: PropTypes.func.isRequired,
  teams: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.number.isRequired,
      name: PropTypes.string.isRequired,
    })
  ).isRequired,
  disabled: PropTypes.bool,
  isLoading: PropTypes.bool,
  error: PropTypes.bool,
  allowWholeUnit: PropTypes.bool,
};
