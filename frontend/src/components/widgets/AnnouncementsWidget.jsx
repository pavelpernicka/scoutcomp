import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../../services/api";
import { useAuth } from "../../providers/AuthProvider";
import DecoratedCard from "../DecoratedCard";
import { formatDate, renderMarkdown } from "./utils";

export default function AnnouncementsWidget() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();

  const { data: announcements = [] } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data } = await api.get("/announcements");
      return data;
    },
    enabled: Boolean(profile),
    staleTime: 30_000,
  });

  return (
    <DecoratedCard
      title={t("dashboard.announcements")}
      subtitle={t("dashboard.stayInformed")}
      icon={<span className="flip_vert fs-2">📢</span>}
      shadow={true}
      border={false}
      bodyClassName="p-0"
    >
      <div className="d-flex flex-column">
        {announcements.length === 0 && (
          <div className="p-4 text-muted text-center">
            <i className="fas fa-bullhorn fs-3 mb-2 d-block opacity-50"></i>
            {t("dashboard.noMessagesYet")}
          </div>
        )}
        {announcements.map((announcement, index) => (
          <div
            key={announcement.id}
            className={`p-4 ${index !== announcements.length - 1 ? 'border-bottom' : ''} position-relative overflow-hidden dashboard-announcement`}
          >
            <div className="position-absolute start-0 top-0 bottom-0 bg-primary" style={{ width: '4px' }}></div>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <h3 className="mb-0 dashboard-announcement__title">{announcement.title || t("dashboard.infoTitle")}</h3>
              <div className="text-end">
                <small className="text-muted d-flex align-items-center gap-1">
                  <i className="fas fa-clock text-muted"></i>
                  {formatDate(announcement.created_at, i18n.language)}
                </small>
              </div>
            </div>
            <div className="AnnText">
              <div
                className="mb-2 dashboard-announcement__body"
                dangerouslySetInnerHTML={renderMarkdown(announcement.body)}
              />
              <span className="badge bg-primary px-2 py-2">
                {announcement.team_name || t("dashboard.allTeams")}
              </span>
            </div>
          </div>
        ))}
      </div>
    </DecoratedCard>
  );
}
