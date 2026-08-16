import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../../services/api";
import { useAuth } from "../../providers/AuthProvider";
import DecoratedCard from "../DecoratedCard";
import UserAvatar from "../UserAvatar";
import { formatRelativeTime } from "./utils";

export default function MessagesWidget() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();

  const { data: conversations = [] } = useQuery({
    queryKey: ["messages", "conversations"],
    queryFn: async () => {
      const { data } = await api.get("/messages");
      return data;
    },
    enabled: Boolean(profile),
    staleTime: 30_000,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      const { data } = await api.get("/notifications");
      return data;
    },
    enabled: Boolean(profile),
    staleTime: 30_000,
  });

  const unreadReceived = conversations.filter(
    (conversation) =>
      (conversation.unread_count || 0) > 0 &&
      conversation.last_message &&
      !conversation.last_message.from_me
  );

  const unreadNotifications = notifications.filter((notification) => !notification.read_at).length;
  const unreadTotal = unreadReceived.reduce(
    (sum, conversation) => sum + (conversation.unread_count || 0),
    0
  ) + unreadNotifications;

  const lastNotification = notifications[0];

  const rows = [];
  if (lastNotification && unreadNotifications > 0) {
    rows.push({
      key: "system",
      avatar: t("messages.system").charAt(0).toUpperCase(),
      avatarColor: "bg-info",
      name: t("messages.system"),
      time: formatRelativeTime(lastNotification.created_at, i18n.language, t),
      body: lastNotification.message,
      unread: unreadNotifications,
    });
  }
  unreadReceived.slice(0, 5).forEach((conversation) => {
    const user = conversation.other_user;
    if (!user) return;
    rows.push({
      key: `user-${user.id}`,
      user,
      avatar: user.name ? user.name.charAt(0).toUpperCase() : null,
      avatarColor: "bg-success",
      name: user.name,
      time: conversation.last_message_at
        ? formatRelativeTime(conversation.last_message_at, i18n.language, t)
        : "",
      body: conversation.last_message ? conversation.last_message.body : "",
      unread: conversation.unread_count || 0,
    });
  });

  return (
    <DecoratedCard
      title={t("dashboard.messages")}
      subtitle={t("dashboard.messagesSubtitle")}
      icon={<span className="flip_vert fs-2">💬</span>}
      headerGradient="linear-gradient(135deg, #0f766e 0%, #22d3ee 100%)"
      shadow={true}
      border={false}
      bodyClassName="p-0"
    >
      <div className="p-3 bg-light border-bottom">
        <div className="d-flex align-items-center justify-content-between">
          <span className="fw-medium text-dark">{t("dashboard.conversations")}</span>
          <span className="badge bg-primary">{unreadTotal}</span>
        </div>
      </div>
      {rows.length === 0 ? (
        <div
          className="d-flex flex-column align-items-center justify-content-center p-4 text-center"
          style={{ minHeight: "160px" }}
        >
          <i className="fas fa-envelope-open-text fs-3 text-muted mb-2 opacity-50"></i>
          <p className="small text-muted mb-0">{t("dashboard.noConversations")}</p>
        </div>
      ) : (
        <div className="d-flex flex-column">
          {rows.map((row, index) => (
              <div
                key={row.key}
                className={`d-flex align-items-start gap-3 p-3 ${
                  index !== rows.length - 1 ? "border-bottom" : ""
                } ${index % 2 === 0 ? "bg-light" : ""}`}
              >
                {row.user ? (
                  <UserAvatar user={row.user} size={36} fallbackClass={row.avatarColor} />
                ) : (
                  <div
                    className={`${row.avatarColor} rounded-circle d-flex align-items-center justify-content-center flex-shrink-0`}
                    style={{ width: "36px", height: "36px", fontSize: "15px", color: "white" }}
                  >
                    {row.avatar || <i className="fas fa-user"></i>}
                  </div>
                )}
                <div className="flex-grow-1 overflow-hidden">
                <div className="d-flex justify-content-between align-items-baseline gap-2">
                  <span className="fw-semibold text-dark text-truncate">{row.name}</span>
                  <small className="text-muted text-nowrap">{row.time}</small>
                </div>
                <p className="mb-0 text-dark text-truncate" style={{ lineHeight: "1.5" }}>
                  {row.body}
                </p>
              </div>
              {row.unread > 0 && (
                <span className="badge bg-primary rounded-pill">{row.unread}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </DecoratedCard>
  );
}
