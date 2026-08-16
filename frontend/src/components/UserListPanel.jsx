import { useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

export default function UserListPanel({ scopedUsers, teams, selectedUserId, onSelectUser, loading, headerExtra }) {
  const { t } = useTranslation();
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [userTeamFilter, setUserTeamFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");

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
      if (userRoleFilter !== "all" && user.role !== userRoleFilter) {
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
  }, [scopedUsers, teamNameById, userRoleFilter, userSearchQuery, userTeamFilter]);

  const handleResetFilters = () => {
    setUserSearchQuery("");
    setUserTeamFilter("all");
    setUserRoleFilter("all");
  };

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-header d-flex justify-content-between align-items-center">
        <span>{t('adminUsers.users')}</span>
        {headerExtra}
      </div>
      <div className="card-body p-0">
        {loading ? (
          <div className="text-center text-muted py-3">{t('adminUsers.loading')}</div>
        ) : scopedUsers.length === 0 ? (
          <p className="text-muted px-3 py-2 mb-0">{t('adminUsers.noUsersYet')}</p>
        ) : (
          <>
            <div className="p-3 border-bottom bg-light">
              <div className="row g-2 align-items-end">
                <div className="col-12 col-lg-5">
                  <label className="form-label mb-1 small">{t('adminUsers.searchUsers')}</label>
                  <input
                    type="search"
                    className="form-control form-control-sm"
                    value={userSearchQuery}
                    onChange={(event) => setUserSearchQuery(event.target.value)}
                    placeholder={t('adminUsers.searchUsersPlaceholder')}
                  />
                </div>
                <div className="col-6 col-lg-3">
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
                <div className="col-6 col-lg-2">
                  <label className="form-label mb-1 small">{t('adminUsers.role')}</label>
                  <select
                    className="form-select form-select-sm"
                    value={userRoleFilter}
                    onChange={(event) => setUserRoleFilter(event.target.value)}
                  >
                    <option value="all">{t('adminUsers.allRoles')}</option>
                    <option value="member">{t('adminUsers.roleMember')}</option>
                    <option value="group_admin">{t('adminUsers.roleGroupAdmin')}</option>
                    <option value="admin">{t('adminUsers.roleAdmin')}</option>
                  </select>
                </div>
                <div className="col-12 col-lg-2 d-flex justify-content-lg-end">
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
              <div className="table-responsive" style={{ maxHeight: "340px" }}>
                <table className="table table-hover table-sm align-middle mb-0">
                  <thead className="table-light sticky-top" style={{ zIndex: 5 }}>
                    <tr>
                      <th>{t('adminUsers.name')}</th>
                      <th>{t('adminUsers.username')}</th>
                      <th>{t('adminUsers.email')}</th>
                      <th>{t('adminUsers.role')}</th>
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
                        <td className="text-capitalize">{user.role.replace("_", " ")}</td>
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
            )}
          </>
        )}
      </div>
    </div>
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
