import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import UserCompetitionHistory from "../components/UserCompetitionHistory";
import UserListPanel from "../components/UserListPanel";
import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { useTranslation } from "react-i18next";
import AdminPageHeader from "../modules/web/admin/AdminPageHeader";

export default function AdminCompetitionAudit() {
  const { isAdmin, managedTeamIds } = useAuth();
  const { t } = useTranslation();
  const [selectedUserId, setSelectedUserId] = useState(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["admin", "teams", "for-users"],
    queryFn: async () => {
      const { data } = await api.get("/teams");
      return data;
    },
    staleTime: 30_000,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data } = await api.get("/users");
      return data;
    },
    staleTime: 30_000,
  });

  const managedTeamIdSet = useMemo(() => new Set(managedTeamIds), [managedTeamIds]);

  const scopedUsers = useMemo(() => {
    if (isAdmin) return users;
    return users.filter((user) => user.team_id != null && managedTeamIdSet.has(user.team_id));
  }, [isAdmin, managedTeamIdSet, users]);

  const selectedUser = useMemo(
    () => scopedUsers.find((user) => user.id === selectedUserId) || null,
    [scopedUsers, selectedUserId]
  );

  useEffect(() => {
    if (scopedUsers.length === 0) {
      if (selectedUserId !== null) {
        setSelectedUserId(null);
      }
      return;
    }
    if (!selectedUserId || !scopedUsers.some((user) => user.id === selectedUserId)) {
      setSelectedUserId(scopedUsers[0].id);
    }
  }, [scopedUsers, selectedUserId]);

  return (
    <div className="admin-competition-audit-page">
      <AdminPageHeader
        title={t("admin.audit.title")}
        description={t("admin.audit.subtitle")}
      />

      <p className="admin-competition-audit-page__intro">{t("admin.audit.intro")}</p>
      <div className="admin-competition-audit-page__sections">
        <div className="col-12">
          <UserListPanel
            scopedUsers={scopedUsers}
            teams={teams}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            loading={usersLoading}
          />
        </div>
        <div className="col-12">
          <UserCompetitionHistory
            selectedUserId={selectedUserId}
            userTeamId={selectedUser?.team_id ?? null}
          />
        </div>
      </div>
    </div>
  );
}
