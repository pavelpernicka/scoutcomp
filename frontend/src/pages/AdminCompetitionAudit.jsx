import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import UserCompetitionHistory from "../components/UserCompetitionHistory";
import UserListPanel from "../components/UserListPanel";
import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { useTranslation } from "react-i18next";
import HeroHeader from "../components/HeroHeader";

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
    <>
      <HeroHeader
        title={t("admin.audit.title")}
        subtitle={t("admin.audit.subtitle")}
        icon="📋"
        gradient="linear-gradient(135deg, #0f766e 0%, #14b8a6 100%)"
      />

      <div className="container px-0">
      <div className="mb-4">
        <h1 className="h2">{t("admin.audit.title")}</h1>
        <p className="text-muted">{t("admin.audit.intro")}</p>
      </div>
      <div className="row g-4">
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
    </>
  );
}
