import { useState } from "react";
import PropTypes from "prop-types";

import UserAvatar from "./UserAvatar";

/** Search-first member picker; results overlay the dialog instead of resizing it. */
export default function MemberSearchPicker({ value, onChange, users, selectedId, onSelect, disabled = false, placeholder = "Začněte psát jméno nebo e-mail…" }) {
  const [open, setOpen] = useState(false);
  const query = value.trim().toLocaleLowerCase("cs-CZ");
  const matches = users
    .filter((user) => [user.real_name, user.username, user.email].filter(Boolean).some((part) => part.toLocaleLowerCase("cs-CZ").includes(query)))
    .slice(0, 8);
  const showResults = open && query.length > 0;

  return <div className="member-search-picker position-relative">
    <div className="input-group input-group-sm">
      <span className="input-group-text"><i className="fas fa-search" /></span>
      <input
        type="search"
        className="form-control"
        value={value}
        onChange={(event) => { onChange(event.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        placeholder={placeholder}
        disabled={disabled}
        autoComplete="off"
        role="combobox"
        aria-expanded={showResults}
        aria-controls="member-search-picker-results"
      />
    </div>
    {showResults && <div id="member-search-picker-results" className="dropdown-menu show position-absolute top-100 start-0 w-100 mt-1 p-0 overflow-auto member-search-picker-results" style={{ zIndex: 1080, maxHeight: "16rem" }} role="listbox" aria-label="Nalezení členové">
      {matches.length ? matches.map((user) => {
        const selected = Number(selectedId) === user.id;
        return <button type="button" role="option" aria-selected={selected} key={user.id} className={`dropdown-item text-wrap d-flex align-items-center gap-2 ${selected ? "active" : ""}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { onSelect(user); setOpen(false); }} disabled={disabled}>
          <UserAvatar user={user} size={30} fallbackClass={selected ? "bg-light text-primary" : "bg-success"} />
          <span className="text-start overflow-hidden"><strong className="d-block text-truncate">{user.real_name || user.username}</strong><small className="d-block text-truncate opacity-75">{user.email || `@${user.username}`}</small></span>
        </button>;
      }) : <div className="px-3 py-2 small text-muted">Nikdo neodpovídá hledání.</div>}
    </div>}
  </div>;
}

MemberSearchPicker.propTypes = {
  value: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  users: PropTypes.arrayOf(PropTypes.object).isRequired,
  selectedId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  onSelect: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  placeholder: PropTypes.string,
};
