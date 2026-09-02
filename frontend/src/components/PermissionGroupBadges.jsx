import PropTypes from "prop-types";

export default function PermissionGroupBadges({ names = [], emptyLabel = "—" }) {
  if (!names.length) return <span className="text-muted">{emptyLabel}</span>;

  return (
    <span className="d-flex flex-wrap gap-1">
      {names.map((name) => (
        <span key={name} className="badge bg-primary px-2 py-1">
          <i className="fas fa-user-shield me-1" aria-hidden="true" />
          {name}
        </span>
      ))}
    </span>
  );
}

PermissionGroupBadges.propTypes = {
  names: PropTypes.arrayOf(PropTypes.string),
  emptyLabel: PropTypes.string,
};
