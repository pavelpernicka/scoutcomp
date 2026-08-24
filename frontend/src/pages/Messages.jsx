import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import { useAuth } from "../providers/AuthProvider";
import { renderMarkdown } from "../utils/markdown";
import HeroHeader from "../components/HeroHeader";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";
import UserAvatar from "../components/UserAvatar";
import { formatRelativeTime } from "../components/widgets/utils";

const extractErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (!detail) {
    return fallback;
  }
  if (typeof detail === "string") {
    return detail;
  }
  return fallback;
};

const messageId = (message) => Number(message?.id) || 0;

const mergeThreadPage = (current, incoming) => {
  if (!current) {
    const messages = incoming.messages || [];
    return { ...incoming, cursor: messageId(messages.at(-1)) };
  }

  const knownIds = new Set(current.messages.map(messageId));
  const additions = (incoming.messages || []).filter((message) => !knownIds.has(messageId(message)));
  let messages = additions.length > 0 ? [...current.messages, ...additions] : current.messages;
  const readThroughId = Number(incoming.read_through_id) || 0;
  const receiptChanged = readThroughId > (Number(current.read_through_id) || 0);
  if (receiptChanged) {
    let messagesChanged = false;
    messages = messages.map((message) => {
      if (!message.from_me || message.read_at || messageId(message) > readThroughId) return message;
      messagesChanged = true;
      return { ...message, read_at: incoming.read_through_at || true };
    });
    if (!messagesChanged && additions.length === 0) messages = current.messages;
  }

  const unreadChanged = incoming.unread_count !== undefined
    && incoming.unread_count !== current.unread_count;
  if (additions.length === 0 && !receiptChanged && !unreadChanged) return current;
  return {
    ...current,
    messages,
    cursor: messageId(messages.at(-1)) || current.cursor || 0,
    other_user: current.other_user || incoming.other_user,
    unread_count: incoming.unread_count ?? current.unread_count,
    read_through_id: incoming.read_through_id ?? current.read_through_id,
    read_through_at: incoming.read_through_at ?? current.read_through_at,
  };
};

const syncConversation = (conversations, otherUser, lastMessage, unreadCountOverride) => {
  if (!otherUser?.id) return conversations;
  const index = conversations.findIndex(
    (conversation) => Number(conversation.other_user?.id) === Number(otherUser.id)
  );
  if (index < 0) {
    if (!lastMessage) return conversations;
    return [{
      other_user: otherUser,
      last_message: lastMessage,
      last_message_at: lastMessage.created_at,
      unread_count: 0,
    }, ...conversations];
  }

  const existing = conversations[index];
  const hasNewLastMessage = messageId(lastMessage) > messageId(existing.last_message);
  const unreadCount = unreadCountOverride ?? (existing.unread_count || 0);
  if (!hasNewLastMessage && unreadCount === (existing.unread_count || 0)) return conversations;
  const updated = {
    ...existing,
    ...(hasNewLastMessage ? {
      last_message: lastMessage,
      last_message_at: lastMessage.created_at,
    } : {}),
    unread_count: unreadCount,
  };
  if (!hasNewLastMessage) {
    const next = [...conversations];
    next[index] = updated;
    return next;
  }
  return [updated, ...conversations.slice(0, index), ...conversations.slice(index + 1)];
};

export default function Messages() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const [searchParams] = useSearchParams();
  const userId = profile?.user?.id;
  const receiveMessages = profile?.user?.receive_messages !== false;
  const requestedUserId = searchParams.get("user");
  const requestedMessageId = Number(searchParams.get("message")) || null;
  const requestedSystemView = searchParams.get("view") === "system";

  const [selectedId, setSelectedId] = useState(() => (
    requestedSystemView ? "system" : requestedUserId || null
  )); // null | "system" | user id
  const [pickedUser, setPickedUser] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState("");
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState(null);
  const threadEndRef = useRef(null);
  const threadScrollRef = useRef(null);

  const [olderMessages, setOlderMessages] = useState([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const { data: conversations = [], isLoading: loadingConversations } = useQuery({
    queryKey: ["messages", "conversations"],
    queryFn: async ({ signal }) => {
      const { data } = await api.get("/messages", { signal });
      return data;
    },
    enabled: Boolean(userId),
    staleTime: 10_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });

  const { data: notifications = [] } = useQuery({
    queryKey: ["notifications", "list", 50],
    queryFn: async ({ signal }) => {
      const { data } = await api.get("/notifications", { params: { limit: 50 }, signal });
      return data;
    },
    enabled: Boolean(userId),
    staleTime: 30_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const timeout = window.setTimeout(
      () => setDebouncedSearchQuery(searchQuery.trim()),
      250
    );
    return () => window.clearTimeout(timeout);
  }, [searchQuery]);

  const searchEnabled = debouncedSearchQuery.length > 0;
  const { data: searchResults = [], isLoading: searching } = useQuery({
    queryKey: ["messages", "search", debouncedSearchQuery],
    queryFn: async ({ signal }) => {
      const { data } = await api.get("/messages/users/search", {
        params: { q: debouncedSearchQuery },
        signal,
      });
      return data;
    },
    enabled: searchEnabled,
    staleTime: 30_000,
  });

  const selectedUser = useMemo(() => {
    if (!selectedId || selectedId === "system") return null;
    const id = Number(selectedId);
    return (
      conversations.find((conversation) => conversation.other_user?.id === id)?.other_user || null
    );
  }, [selectedId, conversations]);

  const threadQueryKey = useMemo(
    () => ["messages", "thread", selectedId],
    [selectedId]
  );
  const { data: threadPage, isLoading: loadingThread } = useQuery({
    queryKey: threadQueryKey,
    queryFn: async ({ signal }) => {
      const current = queryClient.getQueryData(threadQueryKey);
      const params = { limit: 50 };
      if (current) {
        params.after_id = current.cursor || messageId(current.messages?.at(-1));
        if (current.read_through_id) params.known_read_id = current.read_through_id;
      }
      const { data } = await api.get(`/messages/${selectedId}`, { params, signal });
      return mergeThreadPage(current, data);
    },
    enabled: selectedId != null && selectedId !== "system",
    staleTime: 0,
    refetchInterval: 4_000,
    refetchIntervalInBackground: false,
  });

  const thread = useMemo(
    () => [...olderMessages, ...(threadPage?.messages || [])],
    [olderMessages, threadPage]
  );

  useEffect(() => {
    if (requestedSystemView) {
      setSelectedId("system");
      setPickedUser(null);
    } else if (requestedUserId) {
      setSelectedId(requestedUserId);
      setPickedUser(null);
    }
  }, [requestedSystemView, requestedUserId]);

  useEffect(() => {
    setOlderMessages([]);
    setHasMoreOlder(false);
  }, [selectedId]);

  useEffect(() => {
    if (olderMessages.length === 0) {
      setHasMoreOlder(threadPage?.has_more ?? false);
    }
  }, [olderMessages.length, threadPage?.has_more]);

  const latestThreadId = messageId(thread.at(-1));
  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ block: "end" });
  }, [latestThreadId, selectedId]);

  useEffect(() => {
    if (!requestedMessageId || !thread.some((message) => Number(message.id) === requestedMessageId)) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      const target = threadScrollRef.current?.querySelector(
        `[data-message-id="${requestedMessageId}"]`
      );
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [requestedMessageId, thread]);

  const loadOlder = async () => {
    const oldestId = thread[0]?.id;
    if (!selectedId || selectedId === "system" || loadingOlder || !hasMoreOlder || !oldestId) {
      return;
    }
    setLoadingOlder(true);
    const container = threadScrollRef.current;
    const prevScrollHeight = container ? container.scrollHeight : null;
    try {
      const { data } = await api.get(`/messages/${selectedId}`, {
        params: { before_id: oldestId, limit: 50 },
      });
      setOlderMessages((prev) => [...data.messages, ...prev]);
      setHasMoreOlder(data.has_more);
      if (container && prevScrollHeight != null) {
        requestAnimationFrame(() => {
          container.scrollTop = container.scrollTop + (container.scrollHeight - prevScrollHeight);
        });
      }
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleThreadScroll = (event) => {
    if (event.currentTarget.scrollTop < 40) {
      loadOlder();
    }
  };

  const threadUser = pickedUser || selectedUser || threadPage?.other_user || null;
  const latestPageMessage = threadPage?.messages?.at(-1) || null;
  useEffect(() => {
    if (!threadPage || selectedId === "system") return;
    queryClient.setQueryData(["messages", "conversations"], (current = []) => (
      syncConversation(
        current,
        threadPage.other_user || threadUser,
        latestPageMessage,
        threadPage.unread_count
      )
    ));
  }, [latestPageMessage, queryClient, selectedId, threadPage, threadUser]);

  const unreadTotal = useMemo(
    () =>
      conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0),
    [conversations]
  );
  const unreadNotifications = useMemo(
    () => notifications.filter((notification) => !notification.read_at).length,
    [notifications]
  );

  const sendMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post("/messages", payload);
      return data;
    },
    onSuccess: (message) => {
      setBody("");
      setSendError(null);
      queryClient.setQueryData(threadQueryKey, (current) => mergeThreadPage(current, {
        messages: [message],
        has_more: false,
        other_user: threadUser,
      }));
      queryClient.setQueryData(["messages", "conversations"], (current = []) => (
        syncConversation(current, threadUser, message)
      ));
    },
    onError: (error) => {
      setSendError(extractErrorMessage(error, t("messages.sendFailed")));
    },
  });

  const markNotificationsReadMutation = useMutation({
    mutationFn: async () => {
      await api.post("/notifications/read");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const handleSend = (event) => {
    event.preventDefault();
    if (!selectedId || selectedId === "system" || !body.trim()) return;
    sendMutation.mutate({ recipient_id: Number(selectedId), body: body.trim() });
  };

  const handleSearchResultClick = (user) => {
    setSelectedId(user.id);
    setPickedUser(user);
    setSearchQuery("");
  };

  const closeMobileThread = () => {
    setSelectedId(null);
    setPickedUser(null);
    setBody("");
    setSendError(null);
  };

  useEffect(() => {
    if (!selectedId) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape" && window.matchMedia("(max-width: 991.98px)").matches) {
        closeMobileThread();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedId]);

  const showBlockedNotice = threadUser && threadUser.receive_messages === false;

  const showOwnBlockedNotice = !receiveMessages;

  return (
    <>
      <HeroHeader
        title={t("messages.title")}
        subtitle={t("messages.subtitle")}
        icon="💬"
        gradient="linear-gradient(135deg, #0f766e 0%, #22d3ee 100%)"
      >
        <span className="badge bg-light text-success px-3 py-2 fs-5">
          <i className="fas fa-envelope-open-text me-2"></i>
          {unreadTotal + unreadNotifications}
        </span>
      </HeroHeader>

      {showOwnBlockedNotice && (
        <Alert type="warning" className="mb-4">
          <i className="fas fa-ban me-2"></i>
          {t("messages.yourMessagesDisabled")}
        </Alert>
      )}

      <div className="card shadow-lg border-0 messages-card">
        <div className="row g-0 messages-card-row">
          {/* Conversation list */}
          <div className="col-12 col-lg-4 border-lg-end d-flex flex-column messages-contacts">
            <div className="p-3 bg-light border-bottom">
              <div className="input-group">
                <span className="input-group-text bg-white">
                  <i className="fas fa-search"></i>
                </span>
                <input
                  type="text"
                  className="form-control"
                  placeholder={t("messages.searchPlaceholder")}
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
              </div>
              {searchEnabled && (
                <div className="mt-2">
                  {searching && (
                    <div className="small text-muted">
                      <LoadingSpinner text={t("common.loading")} />
                    </div>
                  )}
                  {!searching && searchResults.length === 0 && (
                    <div className="small text-muted py-2">{t("messages.noResults")}</div>
                  )}
                  {searchResults.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      className="list-group-item list-group-item-action d-flex align-items-center gap-2 border-0 bg-white"
                      onClick={() => handleSearchResultClick(user)}
                    >
                      <UserAvatar user={user} />
                      <span className="text-truncate">
                        <span className="d-block fw-semibold">{user.name}</span>
                        {user.team_name && (
                          <span className="small text-muted">{user.team_name}</span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="list-group list-group-flush flex-grow-1 overflow-auto">
              <button
                type="button"
                className={`list-group-item list-group-item-action d-flex align-items-center gap-3 border-0 ${
                  selectedId === "system" ? "active" : ""
                }`}
                onClick={() => {
                  setSelectedId("system");
                  setPickedUser(null);
                  markNotificationsReadMutation.mutate();
                }}
              >
                <UserAvatar user={{ real_name: t("messages.system") }} fallbackClass="bg-info" />
                <span className="flex-grow-1 text-truncate">
                  <span className="d-block fw-semibold">{t("messages.system")}</span>
                  <span className="small text-truncate d-block">
                    {notifications[0]?.message || t("messages.noNotifications")}
                  </span>
                </span>
                {unreadNotifications > 0 && (
                  <span className="badge bg-primary rounded-pill">{unreadNotifications}</span>
                )}
              </button>

              {loadingConversations ? (
                <div className="p-4 text-center">
                  <LoadingSpinner text={t("common.loading")} />
                </div>
              ) : conversations.length === 0 ? (
                <div className="p-4 text-center text-muted small">
                  {t("messages.noConversations")}
                </div>
              ) : (
                conversations.map((conversation) => {
                  const user = conversation.other_user;
                  if (!user) return null;
                  const isActive = selectedId === String(user.id);
                  const lastMessage = conversation.last_message;
                  return (
                    <button
                      key={user.id}
                      type="button"
                      className={`list-group-item list-group-item-action d-flex align-items-center gap-3 border-0 ${
                        isActive ? "active" : ""
                      }`}
                      onClick={() => {
                        setSelectedId(String(user.id));
                        setPickedUser(user);
                      }}
                    >
                      <UserAvatar user={user} fallbackClass="bg-success" />
                      <span className="flex-grow-1 overflow-hidden">
                        <span className="d-flex justify-content-between align-items-baseline">
                          <span className="fw-semibold text-truncate">{user.name}</span>
                          <small className="text-muted text-nowrap ms-2">
                            {conversation.last_message_at
                              ? formatRelativeTime(conversation.last_message_at, i18n.language, t)
                              : ""}
                          </small>
                        </span>
                        <span className="small text-truncate d-block">
                          {lastMessage
                            ? `${lastMessage.from_me ? t("messages.you") + ": " : ""}${lastMessage.body}`
                            : ""}
                        </span>
                      </span>
                      {(conversation.unread_count || 0) > 0 && (
                        <span className="badge bg-primary rounded-pill">{conversation.unread_count}</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Thread pane */}
          <div className={`col-12 col-lg-8 d-flex flex-column messages-thread ${selectedId ? "messages-thread--open" : ""}`} role={selectedId ? "dialog" : undefined} aria-modal={selectedId ? "true" : undefined}>
            {!selectedId ? (
              <div className="d-flex flex-column align-items-center justify-content-center text-center p-5 flex-grow-1">
                <i className="fas fa-comments fs-1 text-muted mb-3 opacity-50"></i>
                <p className="text-muted mb-0">{t("messages.startConversation")}</p>
              </div>
            ) : selectedId === "system" ? (
              <div className="d-flex flex-column flex-grow-1">
                <div className="p-3 bg-light border-bottom d-flex align-items-center gap-2">
                  <UserAvatar user={{ real_name: t("messages.system") }} fallbackClass="bg-info" />
                  <div>
                    <h2 className="h6 mb-0">{t("messages.system")}</h2>
                    <small className="text-muted">{t("messages.systemDescription")}</small>
                  </div>
<button type="button" className="btn btn-sm btn-outline-secondary d-lg-none ms-auto" onClick={closeMobileThread} aria-label={t("messages.closeConversation")}><i className="fas fa-xmark" /></button>
                </div>
                <div className="flex-grow-1 overflow-auto">
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-muted">{t("messages.noNotifications")}</div>
                  ) : (
                    notifications.map((notification) => (
                      <div key={notification.id} className="p-3 border-bottom">
                        <div className="d-flex align-items-start gap-2 mb-1">
                          <UserAvatar
                            user={{
                              real_name:
                                notification.sender_real_name ||
                                notification.sender_username ||
                                t("messages.system"),
                            }}
                            fallbackClass="bg-info"
                          />
                          <div className="flex-grow-1">
                            <div className="d-flex justify-content-between">
                              <span className="fw-semibold">
                                {notification.sender_real_name ||
                                  notification.sender_username ||
                                  t("messages.system")}
                              </span>
                              <small className="text-muted">
                                {formatRelativeTime(notification.created_at, i18n.language, t)}
                              </small>
                            </div>
                            <div
                              className="markdown-body"
                              dangerouslySetInnerHTML={renderMarkdown(notification.message)}
                            />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="d-flex flex-column flex-grow-1">
                <div className="p-3 bg-light border-bottom d-flex align-items-center gap-2">
                  <UserAvatar user={threadUser} fallbackClass="bg-success" />
                  <div className="flex-grow-1">
                    <h2 className="h6 mb-0">
                      {threadUser?.name || t("messages.recipient")}
                      {showBlockedNotice && (
                        <span className="badge bg-warning text-dark ms-2">
                          <i className="fas fa-ban me-1"></i>
                          {t("messages.blocked")}
                        </span>
                      )}
                    </h2>
                    <small className="text-muted">
                      {threadUser?.team_name || t("messages.directMessages")}
                    </small>
                  </div>
<button type="button" className="btn btn-sm btn-outline-secondary d-lg-none" onClick={closeMobileThread} aria-label={t("messages.closeConversation")}><i className="fas fa-xmark" /></button>
                </div>

                <div
                  className="bg-light flex-grow-1 overflow-auto"
                  ref={threadScrollRef}
                  onScroll={handleThreadScroll}
                >
                  {loadingThread ? (
                    <div className="d-flex justify-content-center align-items-center h-100">
                      <LoadingSpinner text={t("common.loading")} />
                    </div>
                  ) : thread.length === 0 ? (
                    <div className="d-flex flex-column align-items-center justify-content-center h-100 text-muted">
                      <i className="fas fa-inbox fs-3 mb-2 opacity-50"></i>
                      <span>{t("messages.emptyThread")}</span>
                    </div>
                  ) : (
                    <div className="p-3 d-flex flex-column gap-2">
                      {loadingOlder && (
                        <div className="text-center small text-muted py-1">
                          <LoadingSpinner text={t("messages.loadingOlder")} />
                        </div>
                      )}
                      {thread.map((message) => {
                        const mine = message.from_me;
                        return (
                          <div
                            key={message.id}
                            className={`message-thread-row d-flex ${mine ? "justify-content-end" : "justify-content-start"} ${Number(message.id) === requestedMessageId ? "message-thread-row--target" : ""}`}
                            data-message-id={message.id}
                            tabIndex={Number(message.id) === requestedMessageId ? -1 : undefined}
                          >
                            <div
                              className={`px-3 py-2 rounded-4 shadow-sm ${
                                mine ? "bg-primary text-white" : "bg-white"
                              }`}
                              style={{ maxWidth: "70%" }}
                            >
                              <div
                                className="markdown-body mb-1"
                                style={{ wordBreak: "break-word" }}
                                dangerouslySetInnerHTML={renderMarkdown(message.body)}
                              />
                              <div
                                className={`small ${mine ? "text-white-50" : "text-muted"}`}
                                style={{ display: "flex", gap: "4px", alignItems: "center" }}
                              >
                                <span>
                                  {formatRelativeTime(message.created_at, i18n.language, t)}
                                </span>
                                {mine &&
                                  (message.read_at ? (
                                    <span title={t("messages.read")}>
                                      <i className="fas fa-check-double"></i>
                                    </span>
                                  ) : (
                                    <span>
                                      <i className="fas fa-check"></i>
                                    </span>
                                  ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      <div ref={threadEndRef} />
                    </div>
                  )}
                </div>

                {sendError && (
                  <Alert type="danger" className="m-3 mb-0">
                    {sendError}
                  </Alert>
                )}

                <form className="p-3 bg-white border-top d-flex gap-2" autoComplete="off" onSubmit={handleSend}>
                  <input
                    type="text"
                    name="scoutcomp-chat-composer"
                    autoComplete="off"
                    inputMode="text"
                    autoCapitalize="sentences"
                    spellCheck="true"
                    aria-autocomplete="none"
                    data-form-type="other"
                    data-lpignore="true"
                    data-1p-ignore="true"
                    data-bwignore="true"
                    className="form-control"
                    placeholder={t("messages.placeholder")}
                    value={body}
                    onChange={(event) => setBody(event.target.value)}
                    disabled={showBlockedNotice}
                  />
                  <Button
                    type="submit"
                    variant="success"
                    disabled={showBlockedNotice || !body.trim() || sendMutation.isPending}
                    loading={sendMutation.isPending}
                  >
                    <i className="fas fa-paper-plane"></i>
                  </Button>
                </form>
                {showBlockedNotice && (
                  <div className="px-3 pb-3 small text-muted">
                    <i className="fas fa-ban me-1"></i>
                    {t("messages.blocked")}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      {selectedId && <button type="button" className="messages-thread-mobile-backdrop d-lg-none" aria-label={t("messages.closeConversation")} onClick={closeMobileThread} />}
    </>
  );
}
