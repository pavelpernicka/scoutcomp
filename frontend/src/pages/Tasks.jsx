import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { marked } from "marked";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

const COOLDOWN_MS = 5000;
const MAX_PREVIEW_LENGTH = 220;

marked.setOptions({ breaks: true });

const renderMarkdown = (markdown) => ({
  __html: DOMPurify.sanitize(marked.parse(markdown || "")),
});

const extractErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (!detail) {
    return fallback;
  }
  if (typeof detail === "string") {
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        const location = Array.isArray(item.loc)
          ? item.loc.filter((part) => part !== "body").join(".")
          : "";
        const message = item.msg || JSON.stringify(item);
        return location ? `${location}: ${message}` : message;
      })
      .filter(Boolean)
      .join("\n");
  }
  if (detail.msg) {
    return detail.msg;
  }
  return typeof detail === "object" ? JSON.stringify(detail) : fallback;
};

const formatDateTime = (dateString) => {
  if (!dateString) return "";
  const date = new Date(dateString);
  return date.toLocaleString();
};

const formatPeriodRange = (progress) => {
  if (!progress?.period_start || !progress?.period_end) {
    return null;
  }
  return `${formatDateTime(progress.period_start)} → ${formatDateTime(progress.period_end)}`;
};

export default function TasksPage() {
  const { t, i18n } = useTranslation();
  const { profile, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();

  const [selectedTask, setSelectedTask] = useState(null);
  const [submissionCount, setSubmissionCount] = useState(1);
  const [submissionNote, setSubmissionNote] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [cooldowns, setCooldowns] = useState({});
  const [cooldownTick, setCooldownTick] = useState(Date.now());

  const {
    data: tasks = [],
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["tasks", "active"],
    queryFn: async () => {
      const { data } = await api.get("/tasks", { params: { status: "active" } });
      return data;
    },
    enabled: Boolean(profile),
    retry: 1,
  });

  const submissionMutation = useMutation({
    mutationFn: async ({ taskId, count, note }) =>
      api.post(`/tasks/${taskId}/submissions`, {
        count,
        member_note: note || undefined,
      }),
    onSuccess: (_, variables) => {
      setFeedback({ type: "success", message: t("tasks.submitSuccess") });
      setCooldowns((prev) => ({
        ...prev,
        [variables.taskId]: Date.now() + COOLDOWN_MS,
      }));
      setSelectedTask(null);
      setSubmissionCount(1);
      setSubmissionNote("");
      queryClient.invalidateQueries({ queryKey: ["tasks", "active"] });
      queryClient.invalidateQueries({ queryKey: ["completions", "me"] });
    },
    onError: (err) => {
      setFeedback({ type: "danger", message: extractErrorMessage(err, t("tasks.error")) });
    },
  });

  useEffect(() => {
    if (!feedback) return undefined;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const hasCooldown = Object.values(cooldowns).some((until) => until > Date.now());
    if (!hasCooldown) {
      return undefined;
    }
    const interval = setInterval(() => setCooldownTick(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [cooldowns]);

  useEffect(() => {
    setCooldowns((prev) => {
      const now = cooldownTick;
      const entries = Object.entries(prev).filter(([, until]) => until > now);
      if (entries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(entries);
    });
  }, [cooldownTick]);

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => new Date(a.start_time) - new Date(b.start_time));
  }, [tasks]);
  const [expandedDescriptions, setExpandedDescriptions] = useState({});
  useEffect(() => {
    setExpandedDescriptions((prev) => {
      const next = { ...prev };
      tasks.forEach((task) => {
        if (!(task.id in next)) {
          next[task.id] = false;
        }
      });
      return next;
    });
  }, [tasks]);

  const handleOpenModal = (task) => {
    setSelectedTask(task);
    setSubmissionCount(1);
    setSubmissionNote("");
  };

  useEffect(() => {
    if (!selectedTask) return;
    const freshTask = tasks.find((task) => task.id === selectedTask.id);
    if (freshTask) {
      setSelectedTask(freshTask);
      const remaining = freshTask.progress?.remaining ?? null;
      if (remaining !== null && remaining < submissionCount) {
        setSubmissionCount(Math.max(remaining, 1));
      }
    }
  }, [tasks]);

  useEffect(() => {
    if (!selectedTask) return;
    const remaining = selectedTask.progress?.remaining ?? null;
    if (remaining !== null && remaining > 0 && submissionCount > remaining) {
      setSubmissionCount(Math.max(remaining, 1));
    }
    if (remaining === 0) {
      setSubmissionCount(1);
    }
  }, [selectedTask, submissionCount]);

  const handleSubmit = () => {
    if (!selectedTask) return;
    submissionMutation.mutate({
      taskId: selectedTask.id,
      count: submissionCount,
      note: submissionNote,
    });
  };

  const cooldownRemaining = (taskId) => {
    const until = cooldowns[taskId];
    if (!until) return 0;
    return Math.max(0, until - cooldownTick);
  };

  const relativeTimeFormatter = useMemo(
    () => new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" }),
    [i18n.language]
  );

  const formatRelativeTime = (dateString) => {
    const diffMs = new Date(dateString).getTime() - Date.now();
    if (diffMs <= 0) {
      return t("tasks.resetSoon", "soon");
    }
    const seconds = diffMs / 1000;
    const day = 86400;
    const hour = 3600;
    const minute = 60;
    if (seconds >= day) {
      return relativeTimeFormatter.format(Math.round(seconds / day), "day");
    }
    if (seconds >= hour) {
      return relativeTimeFormatter.format(Math.round(seconds / hour), "hour");
    }
    if (seconds >= minute) {
      return relativeTimeFormatter.format(Math.round(seconds / minute), "minute");
    }
    return relativeTimeFormatter.format(Math.max(1, Math.round(seconds)), "second");
  };

  const getPreview = (task) => {
    if (!task.description) {
      return t("tasks.noDescription", "No description");
    }
    const isExpanded = expandedDescriptions[task.id] ?? false;
    if (isExpanded) {
      return task.description;
    }
    const paragraphs = task.description.split(/\n{2,}/);
    let preview = paragraphs[0];
    if (preview.length > MAX_PREVIEW_LENGTH) {
      preview = `${preview.slice(0, MAX_PREVIEW_LENGTH)}…`;
    }
    return preview;
  };

  const hasMoreContent = (task) => {
    if (!task.description) {
      return false;
    }
    return (
      task.description.length > MAX_PREVIEW_LENGTH || task.description.split(/\n{2,}/).length > 1
    );
  };

  if (authLoading || isLoading) {
    return <div className="text-center py-5">{t("tasks.loading", "Loading…")}</div>;
  }

  if (isError) {
    return (
      <div className="alert alert-danger" role="alert">
        {error?.response?.data?.detail || t("tasks.error")}
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="container-fluid">
        <div className="row">
          <div className="col-12">
            <div className="card shadow-lg border-0">
              <div className="card-body text-center py-5" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', color: 'white' }}>
                <div className="display-1 mb-4">🎯</div>
                <h2 className="mb-3">{t("tasks.noTasksYet", "Ready for Action!")}</h2>
                <p className="lead mb-0">{t("tasks.noTasksMessage", "Amazing tasks are being prepared for you. Check back soon for exciting challenges!")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderProgress = (task) => {
  const progress = task.progress;
  if (!progress) return null;

    const lines = [];
    if (progress.limit !== null) {
      lines.push(
        t("tasks.completedPeriodDetail", {
          current: progress.current,
          limit: progress.limit,
        })
      );
      lines.push(
        t("tasks.remainingLabel", {
          count: progress.remaining,
        })
      );
    } else {
      lines.push(
        t("tasks.completedPeriodUnlimited", {
          current: progress.current,
        })
      );
      lines.push(t("tasks.noLimitShort", "No limit"));
    }
    lines.push(
      t("tasks.lifetimeTotal", {
        count: progress.lifetime,
      })
    );
    if (progress.period_end) {
      lines.push(
        `${t("tasks.resetsIn", "Resets in")}: ${formatRelativeTime(progress.period_end)} (${formatDateTime(
          progress.period_end
        )})`
      );
    }
    if (progress.period_start && progress.period_end) {
      lines.push(
        `${t("tasks.periodRange", "Current window")}: ${formatPeriodRange(progress)}`
      );
    }

    return (
      <ul className="list-unstyled small text-muted mb-3">
        {lines.map((line, index) => (
          <li key={index}>{line}</li>
        ))}
      </ul>
    );
  };

  const renderModal = () => {
    if (!selectedTask) return null;
    const progress = selectedTask.progress;
    const limit = progress?.limit ?? null;
    const remaining = progress?.remaining ?? null;
    const cooldownMs = cooldownRemaining(selectedTask.id);
    const isLimitReached = remaining !== null && remaining <= 0;
    const isCooldownActive = cooldownMs > 0;
    const maxCount = remaining !== null ? Math.max(remaining, 1) : 50;

    return (
      <>
        <div className="modal fade show d-block" tabIndex="-1" role="dialog">
          <div className="modal-dialog modal-lg" role="document">
            <div className="modal-content border-0 shadow-lg">
              <div className="modal-header text-white position-relative" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                <div className="d-flex align-items-center">
                  <span className="fs-2 me-3">🎯</span>
                  <div>
                    <h4 className="modal-title mb-1">{selectedTask.name}</h4>
                    <p className="mb-0 opacity-90">{t("tasks.questDetails", "Quest Details & Submission")}</p>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn-close btn-close-white"
                  aria-label="Close"
                  onClick={() => setSelectedTask(null)}
                ></button>
                <div className="position-absolute top-0 end-0 opacity-20" style={{ fontSize: '4rem', lineHeight: 1, marginTop: '-1rem', marginRight: '3rem' }}>
                  ⭐
                </div>
              </div>
              <div className="modal-body p-4">
                {/* Quest Description */}
                <div className="bg-light rounded-3 p-4 mb-4 border border-info border-opacity-25">
                  <h5 className="text-primary mb-3 d-flex align-items-center">
                    <span className="me-2">📋</span>
                    {t("tasks.questDescription", "Quest Description")}
                  </h5>
                  <div
                    className="text-dark"
                    dangerouslySetInnerHTML={renderMarkdown(
                      selectedTask.description || t("tasks.noDescription", "No description")
                    )}
                    style={{ lineHeight: '1.6' }}
                  />
                </div>

                {/* Progress Stats */}
                <div className="bg-gradient rounded-3 p-4 mb-4 text-white" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
                  <h5 className="mb-3 d-flex align-items-center">
                    <span className="me-2">📊</span>
                    {t("tasks.questProgress", "Your Quest Progress")}
                  </h5>
                  <div className="text-white opacity-90">
                    {renderProgress(selectedTask)}
                  </div>
                </div>

                {/* Submission Form */}
                <div className="bg-success bg-opacity-10 rounded-3 p-4 mb-4 border border-success border-opacity-25">
                  <h5 className="text-success mb-3 d-flex align-items-center">
                    <span className="me-2">🎯</span>
                    {t("tasks.logCompletion", "Log Your Achievement")}
                  </h5>

                  <div className="mb-3">
                    <label className="form-label fw-medium text-dark d-flex align-items-center">
                      <span className="me-2">🏆</span>
                      {t("tasks.countLabel", "How many completions?")}
                    </label>
                    <input
                      type="number"
                      className="form-control form-control-lg border-success border-opacity-50"
                      min={1}
                      max={maxCount || 50}
                      value={submissionCount}
                      onChange={(event) => setSubmissionCount(Number(event.target.value))}
                      disabled={isLimitReached}
                    />
                    {limit !== null ? (
                      <small className="text-success d-flex align-items-center mt-2">
                        <span className="me-1">✨</span>
                        {t("tasks.remainingLabel", { count: remaining })}
                      </small>
                    ) : (
                      <small className="text-success d-flex align-items-center mt-2">
                        <span className="me-1">🚀</span>
                        {t("tasks.noLimit", "No limit in this period")}
                      </small>
                    )}
                  </div>

                  <div className="mb-3">
                    <label className="form-label fw-medium text-dark d-flex align-items-center">
                      <span className="me-2">💬</span>
                      {t("tasks.noteLabel", "Note")}
                    </label>
                    <textarea
                      className="form-control border-success border-opacity-50"
                      rows={3}
                      value={submissionNote}
                      onChange={(event) => setSubmissionNote(event.target.value)}
                      placeholder={t("tasks.notePlaceholder", "Optional note for approver")}
                      style={{ resize: 'none' }}
                    ></textarea>
                  </div>
                </div>

                {/* Status Messages */}
                {isLimitReached && (
                  <div className="alert alert-warning border-0 shadow-sm d-flex align-items-center" role="alert">
                    <span className="me-2 fs-4">🏁</span>
                    <div>
                      <strong>{t("tasks.questComplete", "Quest Complete!")}</strong>
                      <div className="small opacity-75">{t("tasks.limitReached", "You have reached the limit for this period.")}</div>
                    </div>
                  </div>
                )}
                {isCooldownActive && (
                  <div className="alert alert-info border-0 shadow-sm d-flex align-items-center" role="alert">
                    <span className="me-2 fs-4">⏰</span>
                    <div>
                      <strong>{t("tasks.cooldownActive", "Taking a breather!")}</strong>
                      <div className="small opacity-75">{t("tasks.cooldown", "Please wait a moment before logging again.")}</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer bg-light bg-opacity-50 px-4 py-3">
                <button
                  type="button"
                  className="btn btn-outline-secondary px-4 py-2"
                  onClick={() => setSelectedTask(null)}
                >
                  <span className="me-2">↩️</span>
                  {t("common.cancel", "Cancel")}
                </button>
                <button
                  type="button"
                  className="btn btn-primary px-4 py-2 fw-bold shadow"
                  onClick={handleSubmit}
                  disabled={
                    submissionMutation.isLoading ||
                    isLimitReached ||
                    submissionCount < 1 ||
                    (remaining !== null && submissionCount > remaining) ||
                    isCooldownActive
                  }
                  style={{
                    background: submissionMutation.isLoading || isLimitReached || isCooldownActive
                      ? undefined
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    border: 'none'
                  }}
                >
                  <span className="me-2">
                    {submissionMutation.isLoading ? '⏳' : isLimitReached ? '🏁' : isCooldownActive ? '⏰' : '🚀'}
                  </span>
                  {submissionMutation.isLoading
                    ? t("tasks.sending", "Sending…")
                    : isLimitReached
                      ? t("tasks.questComplete", "Quest Complete!")
                      : isCooldownActive
                        ? t("tasks.cooldownActive", "Taking a breather!")
                        : t("tasks.submit", "Log completion")}
                </button>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-backdrop fade show"></div>
      </>
    );
  };

  return (
    <>
      {/* Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-body border text-white position-relative" style={{ background: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)' }}>
              <div className="row align-items-center">
                <div className="col-md-8">
                  <div className="d-flex align-items-center mb-2">
                    <span className="fs-1 me-3">🚀</span>
                    <div>
                      <h1 className="mb-1">{t("tasks.heroTitle", "Your Epic Quest Awaits!")}</h1>
                      <p className="mb-0 opacity-90 fs-5">
                        {t("tasks.heroSubtitle", "{{count}} exciting challenge(s) ready to conquer!", { count: tasks.length })}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="col-md-4 text-end">
                  <div className="display-2">⭐</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {feedback && (
        <div className={`alert alert-${feedback.type} shadow-sm border-0`} role="alert">
          <div className="d-flex align-items-center">
            <span className="me-2">
              {feedback.type === 'success' ? '🎉' : feedback.type === 'danger' ? '⚠️' : 'ℹ️'}
            </span>
            {feedback.message}
          </div>
        </div>
      )}

      <div className="row g-4">
        {sortedTasks.map((task) => {
          const cooldownMs = cooldownRemaining(task.id);
          const progress = task.progress;
          const isLimitReached = progress?.limit !== null && progress?.remaining === 0;
          const isCooldownActive = cooldownMs > 0;
          const cooldownSeconds = Math.ceil(cooldownMs / 1000);

          return (
            <div key={task.id} className="col-12 col-md-6 col-xl-4">
              <div className="card h-100 shadow-sm border position-relative" style={{
                transform: 'translateY(0)',
                transition: 'all 0.3s ease',
                backgroundColor: '#ffffff',
                borderColor: isLimitReached ? '#e9ecef' : isCooldownActive ? '#b3d7ff' : '#28a745',
                borderWidth: '2px'
              }}>
                {/* Status indicator - only show for cooldown or ready */}
                <div className="position-absolute top-0 end-0 m-3">
                  {isCooldownActive ? (
                    <span className="badge text-dark px-3 py-2" style={{ backgroundColor: '#b3d7ff', color: '#0056b3 !important' }}>
                      ⏰ {cooldownSeconds}s
                    </span>
                  ) : !isLimitReached ? (
                    <span className="badge bg-success text-white px-3 py-2">
                      ✨ {t("tasks.ready", "Ready!")}
                    </span>
                  ) : null}
                </div>

                <div className="card-body d-flex flex-column pt-5">
                  {/* Task header with emoji */}
                  <div className="d-flex align-items-start mb-3">
                    <span className="fs-2 me-3">🎯</span>
                    <div className="flex-grow-1">
                      <h5 className="card-title fw-bold text-dark mb-2">{task.name}</h5>
                      <div className="d-flex flex-wrap gap-2 mb-3">
                        <span className="badge bg-primary bg-opacity-90 px-3 py-2">
                          💰 {task.points_per_completion} {t("tasks.pts", "pts")}
                        </span>
                        {task.requires_approval && (
                          <span className="badge bg-warning text-dark px-3 py-2">
                            🔍 {t("tasks.requiresApproval", "Needs review")}
                          </span>
                        )}
                        {/* Completion count badge */}
                        {task.progress?.lifetime > 0 && (
                          <span className="badge text-white px-3 py-2 d-flex align-items-center" style={{
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            fontSize: '0.85rem'
                          }}>
                            <span className="me-1">⭐</span>
                            {task.progress.lifetime}x {t("tasks.completed", "completed")}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <div className="card-text text-dark flex-grow-1 mb-3">
                    <div
                      className="task-description"
                      dangerouslySetInnerHTML={renderMarkdown(getPreview(task))}
                      style={{ fontSize: '0.95rem', lineHeight: '1.5' }}
                    />
                    {hasMoreContent(task) && (
                      <button
                        type="button"
                        className="btn btn-link btn-sm px-0 text-decoration-none fw-medium"
                        onClick={() =>
                          setExpandedDescriptions((prev) => ({
                            ...prev,
                            [task.id]: !prev[task.id],
                          }))
                        }
                      >
                        {expandedDescriptions[task.id]
                          ? `${t("tasks.showLess", "Show less")}`
                          : `${t("tasks.showMore", "Show more")}`}
                      </button>
                    )}
                  </div>

                  {/* Progress section */}
                  <div className="bg-light rounded-3 p-3 mb-3 border" style={{ borderColor: '#e9ecef' }}>
                    <h6 className="text-primary mb-2 fw-bold d-flex align-items-center">
                      <span className="me-2">📊</span>
                      {t("tasks.progressTitle", "Your Progress")}
                    </h6>
                    <div className="small">
                      {renderProgress(task)}
                      {/* Show reset info if limit reached */}
                      {isLimitReached && task.progress?.period_end && (
                        <div className="text-muted mt-2 pt-2 border-top">
                          <strong>{t("tasks.resetsIn", "Resets in")}: {formatRelativeTime(task.progress.period_end)}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* End time if exists */}
                  {task.end_time && (
                    <div className="bg-danger bg-opacity-10 rounded p-2 mb-3">
                      <div className="text-danger small fw-medium d-flex align-items-center">
                        <span className="me-2">⏰</span>
                        {t("tasks.ends", "Ends")}: {formatDateTime(task.end_time)}
                      </div>
                    </div>
                  )}

                  {/* Action button */}
                  <button
                    type="button"
                    className={`btn mt-auto py-3 fw-bold ${
                      isLimitReached
                        ? 'btn-outline-secondary'
                        : isCooldownActive
                          ? 'btn-outline-primary'
                          : 'btn-success'
                    }`}
                    onClick={() => handleOpenModal(task)}
                    disabled={isLimitReached || isCooldownActive}
                    style={{
                      fontSize: '1.1rem',
                      borderWidth: isLimitReached || isCooldownActive ? '2px' : '1px'
                    }}
                  >
                    {isLimitReached
                      ? `🏆 ${t("tasks.limitReachedShort", "Limit Reached")}`
                      : isCooldownActive
                      ? `⏳ ${t("tasks.cooldownShort", "Cooldown")} (${cooldownSeconds}s)`
                      : `🚀 ${t("tasks.startQuest", "Start Quest!")}`}
                  </button>
                </div>

              </div>
            </div>
          );
        })}
      </div>
      {renderModal()}
    </>
  );
}
