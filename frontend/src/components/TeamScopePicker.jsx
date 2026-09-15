import { useId } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

/** Selects either the whole unit or one or more teams. An empty value means the whole unit. */
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
  const selectedIds = new Set(value.map(Number));

  const toggleTeam = (teamId, checked) => {
    const normalizedId = Number(teamId);
    if (checked) {
      onChange([...selectedIds, normalizedId]);
      return;
    }
    onChange(value.filter((id) => Number(id) !== normalizedId));
  };

  return (
    <fieldset disabled={disabled} aria-describedby={`${fieldId}-hint`}>
      <legend className="form-label small fw-semibold mb-1">{t("calendar.teamScope")}</legend>
      <div className="border rounded p-2">
        {allowWholeUnit && (
          <>
            <label className="d-flex align-items-start gap-2 rounded px-2 py-1 user-select-none">
              <input
                type="radio"
                className="form-check-input mt-1"
                name={`${fieldId}-scope`}
                checked={value.length === 0}
                onChange={() => onChange([])}
              />
              <span>
                <span className="d-block fw-semibold">{t("calendar.unitWide")}</span>
                <span className="d-block small text-muted">{t("calendar.unitWideHint")}</span>
              </span>
            </label>

            <hr className="my-2" />
          </>
        )}

        {isLoading && (
          <div className="small text-muted px-2 py-1" role="status">
            <i className="fas fa-spinner fa-spin me-1" aria-hidden="true" />
            {t("calendar.teamsLoading")}
          </div>
        )}

        {error && (
          <div className="small text-danger px-2 py-1" role="alert">
            {t("calendar.teamsLoadError")}
          </div>
        )}

        {!isLoading && teams.length === 0 && !error && (
          <div className="small text-muted px-2 py-1">{t("calendar.noTeamsAvailable")}</div>
        )}

        {teams.map((team) => (
          <label
            key={team.id}
            className="d-flex align-items-center gap-2 rounded px-2 py-1 user-select-none"
          >
            <input
              type="checkbox"
              className="form-check-input m-0"
              checked={selectedIds.has(Number(team.id))}
              onChange={(event) => toggleTeam(team.id, event.target.checked)}
            />
            <span>{team.name}</span>
          </label>
        ))}
      </div>
      <div id={`${fieldId}-hint`} className="form-text">
        {allowWholeUnit
          ? t("calendar.teamScopeHint")
          : t("calendar.teamScopeTeamsOnlyHint")}
      </div>
    </fieldset>
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
