import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import AdminPanel from "./AdminPanel";
import PermissionGroupBadges from "./PermissionGroupBadges";

export default function UserListPanel({ scopedUsers, teams, selectedUserId, onSelectUser, loading, headerExtra }) {
  const { t } = useTranslation();
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userTeamFilter, setUserTeamFilter] = useState("all");
  const [permissionGroupFilter, setPermissionGroupFilter] = useState("all");

  const permissionGroupNames = useMemo(
    () => Array.from(new Set(scopedUsers.flatMap((user) => user.permission_group_names || []))).sort(),
    [scopedUsers]
  );

  const teamNameById = useMemo(() => {
    const map = new Map();
    teams.forEach((team) => map.set(team.id, team.name));
    return map;
  }, [teams]);

  const filteredUsers = useMemo(() => {
    const query = userSearchQuery.trim().toLowerCase();
    return scopedUsers.filter((user) => {
      if (userTeamFilter !== "all" && String(user.team_id ?? "") !== userTeamFilter) {
        return false;
      }
      if (permissionGroupFilter !== "all" && !(user.permission_group_names || []).includes(permissionGroupFilter)) {
        return false;
      }
      if (!query) {
        return true;
      }
      const teamName = user.team_id ? teamNameById.get(user.team_id) || "" : "";
      const haystack = [user.real_name, user.username, user.email, teamName]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [permissionGroupFilter, scopedUsers, teamNameById, userSearchQuery, userTeamFilter]);

  const handleResetFilters = () => {
    setUserSearchQuery("");
    setUserTeamFilter("all");
    setPermissionGroupFilter("all");
  };

  return (
    <AdminPanel
      className="competition-audit-user-list"
      title={t('adminUsers.users')}
      action={headerExtra}
      bodyClassName="p-0"
    >
        {loading ? (
          <div className="text-center text-muted py-3">{t('adminUsers.loading')}</div>
        ) : scopedUsers.length === 0 ? (
          <p className="text-muted px-3 py-2 mb-0">{t('adminUsers.noUsersYet')}</p>
        ) : (
          <>
            <div className="competition-audit-user-filters p-3 border-bottom bg-light">
              <div className="competition-audit-filter-grid">
                <div>
                  <label className="form-label mb-1 small">{t('adminUsers.searchUsers')}</label>
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    value={userSearchQuery}
                    onChange={(event) => setUserSearchQuery(event.target.value)}
                    placeholder={t('adminUsers.searchUsersPlaceholder')}
                  />
                </div>
                <div>
                  <label className="form-label mb-1 small">{t('adminUsers.team')}</label>
                  <select
                    className="form-select form-select-sm"
                    value={userTeamFilter}
                    onChange={(event) => setUserTeamFilter(event.target.value)}
                  >
                    <option value="all">{t('adminUsers.allTeams')}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={String(team.id)}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="form-label mb-1 small">{t('adminUsers.permissionGroups')}</label>
                  <select
                    className="form-select form-select-sm"
                    value={permissionGroupFilter}
                    onChange={(event) => setPermissionGroupFilter(event.target.value)}
                  >
                    <option value="all">{t('adminUsers.allPermissionGroups')}</option>
                    {permissionGroupNames.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
                <div className="competition-audit-filter-grid__action">
                  <button
                    type="button"
                    className="btn btn-outline-secondary btn-sm w-100"
                    onClick={handleResetFilters}
                  >
                    {t('common.reset')}
                  </button>
                </div>
              </div>
              <div className="small text-muted mt-2">
                {t('adminUsers.usersShown', { shown: filteredUsers.length, total: scopedUsers.length })}
              </div>
            </div>
            {filteredUsers.length === 0 ? (
              <p className="text-muted px-3 py-2 mb-0">{t('adminUsers.noUsersMatchFilters')}</p>
            ) : (
              <>
              <div className="competition-audit-users-mobile d-md-none">
                {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className={`competition-audit-user-card ${user.id === selectedUserId ? "is-selected" : ""}`}
                      onClick={() => onSelectUser(user.id)}
                    >
                      <span className="competition-audit-user-card__name">{user.real_name || user.username}</span>
                      <span className="competition-audit-user-card__meta">{user.team_id ? teamNameById.get(user.team_id) || "—" : "—"}</span>
                      <span className="competition-audit-user-card__role">
                        {(user.permission_group_names || []).join(", ") || "—"}
                      </span>
                    </button>
                ))}
              </div>
              <div className="table-responsive d-none d-md-block" style={{ maxHeight: "340px" }}>
                <table className="table table-hover table-sm align-middle mb-0">
                  <thead className="table-light sticky-top" style={{ zIndex: 5 }}>
                    <tr>
                      <th>{t('adminUsers.name')}</th>
                      <th>{t('adminUsers.username')}</th>
                      <th>{t('adminUsers.email')}</th>
                      <th>{t('adminUsers.permissionGroups')}</th>
                      <th>{t('adminUsers.team')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredUsers.map((user) => (
                      <tr
                        key={user.id}
                        className={user.id === selectedUserId ? "table-primary" : ""}
                        onClick={() => onSelectUser(user.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            onSelectUser(user.id);
                          }
                        }}
                        tabIndex={0}
                        style={{ cursor: "pointer" }}
                      >
                        <td>{user.real_name || user.username}</td>
                        <td className="font-monospace text-muted">{user.username}</td>
                        <td className="text-truncate" style={{ maxWidth: "220px" }}>{user.email || "—"}</td>
                        <td><PermissionGroupBadges names={user.permission_group_names} /></td>
                        <td>
                          {user.team_id
                            ? teamNameById.get(user.team_id) || "—"
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </>
        )}
    </AdminPanel>
  );
}

UserListPanel.propTypes = {
  scopedUsers: PropTypes.array.isRequired,
  teams: PropTypes.array.isRequired,
  selectedUserId: PropTypes.number,
  onSelectUser: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  headerExtra: PropTypes.node,
};
