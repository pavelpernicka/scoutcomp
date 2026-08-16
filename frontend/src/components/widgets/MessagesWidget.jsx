import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import api from "../../services/api";
import { useAuth } from "../../providers/AuthProvider";
import DecoratedCard from "../DecoratedCard";
import UserAvatar from "../UserAvatar";
import { formatRelativeTime } from "./utils";
import { parseServerDate } from "../../utils/dateUtils";

const timestamp = (value) => parseServerDate(value)?.getTime() || 0;

/** Unified, priority-first inbox: unread items lead, then newest read history. */
export default function MessagesWidget() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const { data: conversations = [] } = useQuery({ queryKey: ["messages", "conversations"], queryFn: async () => (await api.get("/messages")).data, enabled: Boolean(profile), staleTime: 30_000 });
  const { data: notifications = [] } = useQuery({ queryKey: ["notifications"], queryFn: async () => (await api.get("/notifications")).data, enabled: Boolean(profile), staleTime: 30_000 });

  const rows = useMemo(() => {
    const messageRows = conversations.filter((conversation) => conversation.last_message).map((conversation) => ({
      key: `message-${conversation.other_user?.id || conversation.id}`,
      user: conversation.other_user,
      name: conversation.other_user?.name || t("messages.system"),
      body: conversation.last_message.body,
      createdAt: conversation.last_message_at,
      unread: Boolean(conversation.unread_count),
      count: conversation.unread_count || 0,
      kind: "message",
    }));
    const notificationRows = notifications.map((notification) => ({
      key: `notification-${notification.id}`,
      name: notification.title || t("messages.system"),
      body: notification.message,
      createdAt: notification.created_at,
      unread: !notification.read_at,
      count: 0,
      kind: "notification",
    }));
    return [...messageRows, ...notificationRows]
      .sort((a, b) => Number(b.unread) - Number(a.unread) || timestamp(b.createdAt) - timestamp(a.createdAt))
      .slice(0, 8);
  }, [conversations, notifications, t]);
  const unreadTotal = rows.reduce((sum, row) => sum + (row.unread ? Math.max(1, row.count) : 0), 0);

  return <DecoratedCard title={t("dashboard.messages")} subtitle={t("dashboard.messagesSubtitle")} icon={<span className="flip_vert fs-2">💬</span>} headerGradient="linear-gradient(135deg, #0f766e 0%, #22d3ee 100%)" shadow border={false} className="h-100 dashboard-messages-card" bodyClassName="p-0 d-flex flex-column">
    <div className="p-3 bg-light border-bottom d-flex align-items-center justify-content-between"><span className="fw-medium text-dark">{t("dashboard.conversations")}</span><span className="badge bg-primary">{unreadTotal}</span></div>
    {rows.length === 0 ? <div className="d-flex flex-column align-items-center justify-content-center p-4 text-center flex-grow-1"><i className="fas fa-envelope-open-text fs-3 text-muted mb-2 opacity-50" /><p className="small text-muted mb-0">{t("dashboard.noConversations")}</p></div> : <div className="d-flex flex-column dashboard-message-list">
      {rows.map((row) => <Link to="/messages" key={row.key} className={`dashboard-message-row d-flex align-items-start gap-3 p-3 text-decoration-none text-reset ${row.unread ? "dashboard-message-unread" : ""}`}>
        {row.user ? <UserAvatar user={{ real_name: row.name, avatar: row.user.avatar }} size={36} fallbackClass="bg-success" /> : <span className="bg-info rounded-circle d-flex align-items-center justify-content-center text-white flex-shrink-0" style={{ width: 36, height: 36 }}><i className="fas fa-bell" /></span>}
        <span className="flex-grow-1 overflow-hidden"><span className="d-flex justify-content-between gap-2"><strong className="text-truncate">{row.name}</strong><small className="text-muted text-nowrap">{formatRelativeTime(row.createdAt, i18n.language, t)}</small></span><span className="d-block text-truncate small text-muted mt-1">{row.body}</span></span>
        {row.unread && <span className="badge bg-primary rounded-pill">{row.count || "Nové"}</span>}
      </Link>)}
    </div>}
  </DecoratedCard>;
}
