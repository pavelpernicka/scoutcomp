import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import DOMPurify from "dompurify";
import { marked } from "marked";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { formatDateToLocal } from "../utils/dateUtils";
import HeroHeader from "../components/HeroHeader";
import Alert from "../components/Alert";
import Button from "../components/Button";
import Modal from "../components/Modal";

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
  return formatDateToLocal(dateString);
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
    mutationFn: async ({ taskId, count, note, variantId }) => {
      const url = `/tasks/${taskId}/submissions${variantId ? `?variant_id=${variantId}` : ''}`;
      return api.post(url, {
        count,
        member_note: note || undefined,
      });
    },
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
  const [selectedVariant, setSelectedVariant] = useState(null);

  // Reset selected variant when task changes
  useEffect(() => {
    if (selectedTask && selectedTask.variants?.length > 0) {
      setSelectedVariant(selectedTask.variants[0]);
    } else {
      setSelectedVariant(null);
    }
  }, [selectedTask]);
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
      variantId: selectedVariant?.id,
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
      return t("tasks.resetSoon");
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
      return t("tasks.noDescription");
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
    return <div className="text-center py-5">{t("tasks.loading")}</div>;
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
                <h2 className="mb-3">{t("tasks.noTasksYet")}</h2>
                <p className="lead mb-0">{t("tasks.noTasksMessage")}</p>
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
      lines.push(t("tasks.noLimitShort"));
    }
    lines.push(
      t("tasks.lifetimeTotal", {
        count: progress.lifetime,
      })
    );
    if (progress.period_end) {
      lines.push(
        `${t("tasks.resetsIn")}: ${formatRelativeTime(progress.period_end)} (${formatDateTime(
          progress.period_end
        )})`
      );
    }
    if (progress.period_start && progress.period_end) {
      lines.push(
        `${t("tasks.periodRange")}: ${formatPeriodRange(progress)}`
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
    const maxCount = remaining !== null ? Math.max(remaining, 1) : 999;

    const modalFooter = (
      <div className="bg-light bg-opacity-50 px-4 py-3">
        <Button
          variant="outline-secondary"
          className="px-4 py-2"
          onClick={() => setSelectedTask(null)}
          icon="fas fa-undo"
          iconPosition="left"
        >
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          className="px-4 py-2 fw-bold text-light shadow ms-2"
          onClick={handleSubmit}
          loading={submissionMutation.isLoading}
          disabled={
            submissionMutation.isLoading ||
            isLimitReached ||
            submissionCount < 1 ||
            (remaining !== null && submissionCount > remaining) ||
            isCooldownActive
          }
          gradient={
            submissionMutation.isLoading || isLimitReached || isCooldownActive
              ? undefined
              : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
          }
          icon={
            submissionMutation.isLoading ? "fas fa-hourglass-half"
            : isLimitReached ? null
            : isCooldownActive ? "fas fa-clock"
            : "fas fa-arrow-right-to-bracket"
          }
          iconPosition="left"
        >
          {isLimitReached && <span className="me-2">🏁</span>}
          {submissionMutation.isLoading
            ? t("tasks.sending")
            : isLimitReached
              ? t("tasks.questComplete")
              : isCooldownActive
                ? t("tasks.cooldownActive")
                : t("tasks.submit")}
        </Button>
      </div>
    );

    return (
      <Modal
        isVisible={true}
        onClose={() => setSelectedTask(null)}
        title={selectedTask.name}
        subtitle={t("tasks.questDetails")}
        icon="🎯"
        size="lg"
        headerGradient="linear-gradient(135deg, #667eea 0%, #764ba2 100%)"
        footer={modalFooter}
        className="position-relative"
      >
        <div className="position-absolute top-0 end-0 opacity-20" style={{ fontSize: '4rem', lineHeight: 1, marginTop: '-1rem', marginRight: '3rem' }}>
          <i className="fas fa-star text-warning"></i>
        </div>

        {/* Task Variants or Description */}
        {selectedTask.variants && selectedTask.variants.length > 0 ? (
          <div className="mb-4">
            {/* Common Task Description */}
            {selectedTask.description && (
              <div className="bg-light rounded-3 p-4 mb-3 border border-info border-opacity-25">
                <h5 className="text-primary mb-3 d-flex align-items-center">
                  <span className="me-2">📋</span>
                  {t("tasks.questDescription")}
                </h5>
                <div
                  className="text-dark"
                  dangerouslySetInnerHTML={renderMarkdown(selectedTask.description)}
                  style={{ lineHeight: '1.6' }}
                />
              </div>
            )}

            {/* Variant Tabs */}
            <div className="nav nav-tabs mb-0" role="tablist" style={{ borderBottom: '2px solid #e9ecef' }}>
              {selectedTask.variants.map((variant) => (
                <button
                  key={variant.id}
                  className={`nav-link px-4 py-3 fw-medium position-relative ${
                    selectedVariant?.id === variant.id
                      ? 'active text-primary'
                      : 'text-muted hover-bg-light'
                  }`}
                  style={{
                    backgroundColor: selectedVariant?.id === variant.id ? '#f8f9fa' : 'transparent',
                    borderBottom: selectedVariant?.id === variant.id ? '3px solid #0d6efd' : '3px solid transparent',
                    cursor: 'pointer'
                  }}
                  onClick={() => setSelectedVariant(variant)}
                  role="tab"
                >
                  <div className="d-flex align-items-center">
                    <span className="me-2 fw-bold">{variant.name}</span>
                    <span className="badge bg-primary bg-opacity-90 px-2 py-1">
                      💰 {variant.points} {t("tasks.pts")}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {/* Variant Content */}
            <div className="tab-content bg-light border border-info rounded-bottom-3 p-4">
              {selectedVariant && (
                <div className="tab-pane fade show active">
                  <div
                    className="text-dark"
                    dangerouslySetInnerHTML={renderMarkdown(
                      selectedVariant.description || t("tasks.noVariantDescription")
                    )}
                    style={{ lineHeight: '1.6' }}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          // Show task description when no variants
          <div className="bg-light rounded-3 p-4 mb-4 border border-info border-opacity-25">
            <h5 className="text-primary mb-3 d-flex align-items-center">
              <span className="me-2">📋</span>
              {t("tasks.questDescription")}
            </h5>
            <div
              className="text-dark"
              dangerouslySetInnerHTML={renderMarkdown(
                selectedTask.description || t("tasks.noDescription")
              )}
              style={{ lineHeight: '1.6' }}
            />
          </div>
        )}

        {/* Submission Form */}
        <div className="bg-success bg-opacity-10 rounded-3 p-4 mb-4 border border-success border-opacity-25">
          <h5 className="text-success mb-3 d-flex align-items-center">
            <span className="me-2">🎯</span>
            {t("tasks.logCompletion")}
          </h5>

          <div className="mb-3">
            <label className="form-label fw-medium text-dark d-flex align-items-center">
              {t("tasks.countLabel")}
            </label>
            <input
              type="number"
              className="form-control form-control-lg border-success border-opacity-50"
              min={1}
              max={maxCount || 999}
              value={submissionCount}
              onChange={(event) => setSubmissionCount(Number(event.target.value))}
              disabled={isLimitReached}
            />
            {limit !== null ? (
              <small className="text-success d-flex align-items-center mt-2">
                {t("tasks.remainingLabel", { count: remaining })}
              </small>
            ) : (
              <small className="text-success d-flex align-items-center mt-2">
                {t("tasks.noLimit")}
              </small>
            )}
          </div>

          <div className="mb-3">
            <label className="form-label fw-medium text-dark d-flex align-items-center">
              {t("tasks.noteLabel")}
            </label>
            <textarea
              className="form-control border-success border-opacity-50"
              rows={3}
              value={submissionNote}
              onChange={(event) => setSubmissionNote(event.target.value)}
              placeholder={t("tasks.notePlaceholder")}
              style={{ resize: 'none' }}
            ></textarea>
          </div>
        </div>

        {/* Status Messages */}
        {isLimitReached && (
          <div className="alert alert-warning border-0 shadow-sm d-flex align-items-center" role="alert">
            <div>
              <strong>{t("tasks.questComplete")}</strong>
              <div className="small opacity-75">{t("tasks.limitReached")}</div>
            </div>
          </div>
        )}
        {isCooldownActive && (
          <div className="alert alert-info border-0 shadow-sm d-flex align-items-center" role="alert">
            <i className="fas fa-clock text-info me-2 fs-4"></i>
            <div>
              <strong>{t("tasks.cooldownActive")}</strong>
              <div className="small opacity-75">{t("tasks.cooldown")}</div>
            </div>
          </div>
        )}
      </Modal>
    );
  };

  return (
    <>
      <HeroHeader
        title={t("tasks.heroTitle")}
        subtitle={t("tasks.heroSubtitle", { count: tasks.length })}
        icon="🚀"
        gradient="linear-gradient(351deg, #f093fb 0%, #f5576c 100%)"
      />

      {feedback && (
        <Alert
          type={feedback.type}
          className="shadow-sm border-0 mb-4"
          icon={feedback.type === 'success' ? '🎉' : undefined}
        >
          {feedback.message}
        </Alert>
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
              <div className={`card h-100 shadow-sm position-relative ${task.hot_deal ? 'bg-warning bg-opacity-25' : 'border'}`} style={{
                transform: 'translateY(0)',
                transition: 'all 0.3s ease',
                backgroundColor: task.hot_deal ? '#fff3cd' : '#ffffff',
                borderColor: task.hot_deal ? '#dc3545' : (isLimitReached ? '#e9ecef' : isCooldownActive ? '#b3d7ff' : '#28a745'),
                borderWidth: task.hot_deal ? '4px' : '2px'
              }}>
                {/* Hot Deal indicator */}
                {task.hot_deal && (
                  <div className="position-absolute" style={{ top: '-35px', left: '-20px', zIndex: 10 }}>
                    <span style={{ fontSize: '3rem', filter: 'drop-shadow(2px 2px 4px rgba(0,0,0,0.3))' }}>
                      🔥
                    </span>
                  </div>
                )}

                {/* Status indicator - only show for cooldown or ready */}
                <div className="position-absolute top-0 end-0 m-3">
                  {isCooldownActive ? (
                    <span className="badge text-dark px-3 py-2" style={{ backgroundColor: '#b3d7ff', color: '#0056b3 !important' }}>
                      <i className="fas fa-clock text-info me-1"></i> {cooldownSeconds}s
                    </span>
                  ) : !isLimitReached ? (
                    <span className="badge bg-success text-white px-3 py-2">
                      {t("tasks.ready")}
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
                          💰 {task.variants && task.variants.length > 0
                            ? (() => {
                                const minPoints = Math.min(...task.variants.map(v => v.points));
                                const maxPoints = Math.max(...task.variants.map(v => v.points));
                                return minPoints === maxPoints ? `${minPoints}` : `${minPoints}-${maxPoints}`;
                              })()
                            : task.points_per_completion
                          } {t("tasks.pts")}
                        </span>
                        {task.requires_approval && (
                          <span className="badge bg-warning text-dark px-3 py-2">
                            🔍 {t("tasks.requiresApproval")}
                          </span>
                        )}
                        {/* Completion count badge */}
                        {task.progress?.lifetime > 0 && (
                          <span className="badge text-white px-3 py-2 d-flex align-items-center" style={{
                            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                            fontSize: '0.85rem'
                          }}>
                            <i className="fas fa-star text-warning me-1"></i>
                            {task.progress.lifetime}x {t("tasks.completed")}
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
                          ? `${t("tasks.showLess")}`
                          : `${t("tasks.showMore")}`}
                      </button>
                    )}
                  </div>

                  {/* Progress section */}
                  <div className="bg-light rounded-3 p-3 mb-3 border" style={{ borderColor: '#e9ecef' }}>
                    <h6 className="text-primary mb-2 fw-bold d-flex align-items-center">
                      <span className="me-2">📊</span>
                      {t("tasks.questStatus")}
                    </h6>
                    <div className="small">
                      {renderProgress(task)}
                      {/* Show reset info if limit reached */}
                      {isLimitReached && task.progress?.period_end && (
                        <div className="text-muted mt-2 pt-2 border-top">
                          <strong>{t("tasks.resetsIn")}: {formatRelativeTime(task.progress.period_end)}</strong>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* End time if exists */}
                  {task.end_time && (
                    <div className="bg-danger bg-opacity-10 rounded p-2 mb-3">
                      <div className="text-danger small fw-medium d-flex align-items-center">
                        <i className="fas fa-clock me-2"></i>
                        {t("tasks.ends")}: {formatDateTime(task.end_time)}
                      </div>
                    </div>
                  )}

                  {/* Action button */}
                  <Button
                    variant={isLimitReached ? 'outline-secondary' : isCooldownActive ? 'outline-primary' : 'success'}
                    className="mt-auto py-3 fw-bold"
                    onClick={() => handleOpenModal(task)}
                    disabled={isLimitReached || isCooldownActive}
                    style={{
                      fontSize: '1.1rem',
                      borderWidth: isLimitReached || isCooldownActive ? '2px' : '1px'
                    }}
                  >
                    {isLimitReached
                      ? `${t("tasks.limitReachedShort")}`
                      : isCooldownActive
                      ? <><i className="fas fa-hourglass-half text-info me-2"></i>{t("tasks.cooldownShort")} ({cooldownSeconds}s)</>
                      : <>🚀 {t("tasks.startQuest")}</>}
                  </Button>
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
