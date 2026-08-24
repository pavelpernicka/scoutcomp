import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { formatDateToLocal, parseServerDate } from "../utils/dateUtils";
import AdminPanel from "./AdminPanel";

const COMPLETIONS_PAGE_SIZE = 20;
const EMPTY_LIST = [];

const emptyCompletionForm = {
  taskId: "",
  variantId: "",
  count: "1",
  status: "approved",
  memberNote: "",
  adminNote: "",
};

const formatErrorDetail = (detail) => {
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => item?.msg || item?.detail || item?.message || JSON.stringify(item))
      .join(" \u2013 ");
  }
  if (typeof detail === "object") {
    return detail.msg || detail.detail || detail.message || JSON.stringify(detail);
  }
  return String(detail);
};

const getErrorMessage = (error, fallbackMessage) => {
  if (!error) return fallbackMessage;
  const detail = error?.response?.data?.detail;
  const parsed = formatErrorDetail(detail);
  if (parsed) return parsed;
  return error?.message || fallbackMessage;
};

const haveSameDrafts = (current, next) => {
  const currentKeys = Object.keys(current);
  const nextKeys = Object.keys(next);
  return currentKeys.length === nextKeys.length && currentKeys.every(
    (key) => current[key] === next[key]
  );
};

export default function UserCompetitionHistory({ selectedUserId, userTeamId }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAdmin, managedTeamIds } = useAuth();

  const [completionDrafts, setCompletionDrafts] = useState({});
  const [completionError, setCompletionError] = useState(null);
  const [completionTaskFilter, setCompletionTaskFilter] = useState("all");
  const [completionFrom, setCompletionFrom] = useState("");
  const [completionTo, setCompletionTo] = useState("");
  const [completionPage, setCompletionPage] = useState(1);
  const [showCreateCompletionModal, setShowCreateCompletionModal] = useState(false);
  const [newCompletionForm, setNewCompletionForm] = useState(emptyCompletionForm);
  const [completionCreateError, setCompletionCreateError] = useState(null);

  const { data: activeTasksData, isLoading: tasksLoading } = useQuery({
    queryKey: ["admin", "tasks", "for-completions"],
    queryFn: async () => {
      const { data } = await api.get("/tasks", { params: { status: "active" } });
      return data;
    },
    staleTime: 30_000,
  });

  const { data: userCompletionsData, isFetching: completionsLoading } = useQuery({
    queryKey: ["admin", "user-completions", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const { data } = await api.get(`/completions/users/${selectedUserId}`);
      return data;
    },
    enabled: Boolean(selectedUserId),
  });
  const activeTasks = activeTasksData ?? EMPTY_LIST;
  const userCompletions = userCompletionsData ?? EMPTY_LIST;

  useEffect(() => {
    setCompletionTaskFilter("all");
    setCompletionFrom("");
    setCompletionTo("");
    setCompletionPage(1);
    setCompletionError(null);
  }, [selectedUserId]);

  useEffect(() => {
    setCompletionPage(1);
  }, [completionTaskFilter, completionFrom, completionTo]);

  useEffect(() => {
    const nextDrafts = userCompletions.reduce((acc, item) => {
        acc[item.id] = String(item.count);
        return acc;
      }, {});
    setCompletionDrafts((current) => (
      haveSameDrafts(current, nextDrafts) ? current : nextDrafts
    ));
  }, [userCompletions]);

  const assignableTasks = useMemo(() => {
    return activeTasks
      .filter((task) => {
        if (!task) return false;
        if (task.team_id == null) {
          return true;
        }
        if (isAdmin) {
          return userTeamId != null && task.team_id === userTeamId;
        }
        return managedTeamIds.includes(task.team_id) && userTeamId === task.team_id;
      })
      .map((task) => ({ value: String(task.id), label: task.name, task }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [activeTasks, isAdmin, managedTeamIds, userTeamId]);

  const selectedTaskForCompletion = useMemo(() => {
    if (!newCompletionForm.taskId) return null;
    return assignableTasks.find((task) => task.value === newCompletionForm.taskId)?.task || null;
  }, [assignableTasks, newCompletionForm.taskId]);

  const availableVariants = useMemo(() => {
    if (!selectedTaskForCompletion?.variants) return EMPTY_LIST;
    return selectedTaskForCompletion.variants.map((variant) => ({
      value: String(variant.id),
      label: `${variant.name} (${variant.points} pts)`,
      variant,
    }));
  }, [selectedTaskForCompletion]);

  useEffect(() => {
    setNewCompletionForm((prev) => {
      const defaultTaskId = assignableTasks[0]?.value || "";
      const nextTaskId = assignableTasks.some((task) => task.value === prev.taskId)
        ? prev.taskId
        : defaultTaskId;
      if (prev.taskId === nextTaskId) {
        return prev;
      }
      return {
        ...prev,
        taskId: nextTaskId,
        variantId: "",
      };
    });
  }, [assignableTasks]);

  useEffect(() => {
    setNewCompletionForm((prev) => {
      const firstVariantId = availableVariants[0]?.value || "";
      const variantIsAvailable = availableVariants.some(
        (variant) => variant.value === prev.variantId
      );
      const nextVariantId = variantIsAvailable ? prev.variantId : firstVariantId;
      return prev.variantId === nextVariantId
        ? prev
        : { ...prev, variantId: nextVariantId };
    });
  }, [availableVariants]);

  const updateCompletionMutation = useMutation({
    mutationFn: async ({ completionId, payload }) =>
      api.patch(`/completions/users/${selectedUserId}/${completionId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-completions", selectedUserId] });
      setCompletionError(null);
    },
    onError: (error) => {
      setCompletionError(getErrorMessage(error, t('adminUsers.unableToUpdateCompletion')));
    },
  });

  const deleteCompletionMutation = useMutation({
    mutationFn: async (completionId) =>
      api.delete(`/completions/users/${selectedUserId}/${completionId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-completions", selectedUserId] });
      setCompletionError(null);
    },
    onError: (error) => {
      setCompletionError(getErrorMessage(error, t('adminUsers.unableToDeleteCompletion')));
    },
  });

  const createCompletionMutation = useMutation({
    mutationFn: async (payload) => api.post(`/completions/users/${selectedUserId}`, payload),
    onMutate: () => {
      setCompletionCreateError(null);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "user-completions", selectedUserId] });
      setShowCreateCompletionModal(false);
      setNewCompletionForm(emptyCompletionForm);
    },
    onError: (error) => {
      setCompletionCreateError(getErrorMessage(error, t('adminUsers.unableToCreateCompletion')));
    },
  });

  const openCreateCompletionModal = () => {
    setCompletionCreateError(null);
    const defaultTaskId = assignableTasks[0]?.value || "";
    const defaultTask = assignableTasks[0]?.task;
    const defaultVariantId = defaultTask?.variants?.[0]?.id ? String(defaultTask.variants[0].id) : "";
    setNewCompletionForm({
      ...emptyCompletionForm,
      taskId: defaultTaskId,
      variantId: defaultVariantId,
    });
    setShowCreateCompletionModal(true);
  };

  const closeCreateCompletionModal = () => {
    setShowCreateCompletionModal(false);
    setCompletionCreateError(null);
    setNewCompletionForm(emptyCompletionForm);
  };

  const handleCompletionSave = (completionId) => {
    const countValue = completionDrafts[completionId];
    if (!selectedUserId || !countValue) return;
    const parsed = Number(countValue);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 999) {
      setCompletionError(t('adminUsers.countMustBeBetween'));
      return;
    }
    updateCompletionMutation.mutate({
      completionId,
      payload: { count: parsed },
    });
  };

  const handleCompletionStatusChange = (completionId, status) => {
    if (!selectedUserId || !status || status === "pending") {
      return;
    }
    updateCompletionMutation.mutate({
      completionId,
      payload: { status },
    });
  };

  const handleCompletionDelete = (completionId) => {
    if (!window.confirm(t('adminUsers.confirmRemoveCompletion'))) {
      return;
    }
    deleteCompletionMutation.mutate(completionId);
  };

  const handleCreateCompletion = (event) => {
    event.preventDefault();
    if (!selectedUserId) {
      setCompletionCreateError(t('adminUsers.selectUserFirst'));
      return;
    }
    if (!newCompletionForm.taskId) {
      setCompletionCreateError(t('adminUsers.selectTask'));
      return;
    }
    const countValue = Number(newCompletionForm.count);
    if (!Number.isFinite(countValue) || countValue < 1 || countValue > 999) {
      setCompletionCreateError(t('adminUsers.countMustBeBetween'));
      return;
    }

    const payload = {
      task_id: Number(newCompletionForm.taskId),
      count: countValue,
      status: newCompletionForm.status,
      member_note: newCompletionForm.memberNote.trim() || null,
      admin_note: newCompletionForm.adminNote.trim() || null,
    };

    if (newCompletionForm.variantId && selectedTaskForCompletion?.variants?.length > 0) {
      payload.variant_id = Number(newCompletionForm.variantId);
    }

    createCompletionMutation.mutate(payload);
  };

  const handleResetCompletionFilters = () => {
    setCompletionTaskFilter("all");
    setCompletionFrom("");
    setCompletionTo("");
    setCompletionError(null);
  };

  const availableTasks = useMemo(() => {
    const map = new Map();
    userCompletions.forEach((item) => {
      if (item.task) {
        map.set(item.task.id, item.task.name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ value: String(id), label: name }));
  }, [userCompletions]);

  const filteredCompletions = useMemo(() => {
    return userCompletions.filter((item) => {
      if (completionTaskFilter !== "all") {
        if (!item.task || String(item.task.id) !== completionTaskFilter) {
          return false;
        }
      }
      const submitted = parseServerDate(item.submitted_at);
      if (completionFrom) {
        const fromDate = new Date(completionFrom);
        if (submitted < fromDate) {
          return false;
        }
      }
      if (completionTo) {
        const toDate = new Date(completionTo);
        toDate.setHours(23, 59, 59, 999);
        if (submitted > toDate) {
          return false;
        }
      }
      return true;
    });
  }, [userCompletions, completionTaskFilter, completionFrom, completionTo]);

  const completionPages = Math.max(1, Math.ceil(filteredCompletions.length / COMPLETIONS_PAGE_SIZE));
  const visibleCompletionPage = Math.min(completionPage, completionPages);
  const paginatedCompletions = useMemo(() => {
    const start = (visibleCompletionPage - 1) * COMPLETIONS_PAGE_SIZE;
    return filteredCompletions.slice(start, start + COMPLETIONS_PAGE_SIZE);
  }, [filteredCompletions, visibleCompletionPage]);

  const totalPoints = useMemo(() => {
    return filteredCompletions
      .filter((item) => item.status === "approved")
      .reduce((sum, item) => sum + (item.points_awarded || 0), 0);
  }, [filteredCompletions]);

  const pointsByTask = useMemo(() => {
    const result = new Map();
    filteredCompletions.forEach((item) => {
      if (item.status !== "approved") return;
      const key = item.task ? item.task.name : `Task #${item.task_id}`;
      result.set(key, (result.get(key) || 0) + (item.points_awarded || 0));
    });
    return Array.from(result.entries()).map(([task, points]) => ({ task, points }));
  }, [filteredCompletions]);

  if (!selectedUserId) {
    return null;
  }

  return (
    <>
      <AdminPanel
        className="competition-audit-history"
        title={<><span>{t('adminUsers.completionHistory')}</span><span className="badge bg-secondary ms-2">{filteredCompletions.length}</span></>}
        action={<button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={openCreateCompletionModal}
            disabled={!assignableTasks.length || tasksLoading}
          >
            {t('adminUsers.addCompletionBtn')}
          </button>}
        bodyClassName="p-0"
      >
          {completionError && (
            <div className="alert alert-danger rounded-0 mb-0" role="alert">
              {completionError}
            </div>
          )}
          <div className="p-3 border-bottom d-flex flex-wrap gap-3 align-items-end">
            <div>
              <label className="form-label mb-1">{t('leaderboard.taskColumn')}</label>
              <select
                className="form-select form-select-sm"
                value={completionTaskFilter}
                onChange={(event) => setCompletionTaskFilter(event.target.value)}
              >
                <option value="all">{t('adminUsers.allTasks')}</option>
                {availableTasks.map((task) => (
                  <option key={task.value} value={task.value}>
                    {task.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="form-label mb-1">{t('adminUsers.dateFrom')}</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={completionFrom}
                onChange={(event) => setCompletionFrom(event.target.value)}
              />
            </div>
            <div>
              <label className="form-label mb-1">{t('adminUsers.dateTo')}</label>
              <input
                type="date"
                className="form-control form-control-sm"
                value={completionTo}
                onChange={(event) => setCompletionTo(event.target.value)}
              />
            </div>
            <div className="ms-auto d-flex gap-2 align-items-center">
              <div className="text-end">
                <div className="fw-semibold">{t('adminUsers.totalPoints')}</div>
                <div className="text-primary fs-5">{totalPoints.toFixed(2)}</div>
              </div>
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm"
                onClick={handleResetCompletionFilters}
              >
                {t('common.reset')}
              </button>
            </div>
          </div>
          {pointsByTask.length > 0 && (
            <div className="p-3 border-bottom">
              <div className="fw-semibold mb-2">{t('adminUsers.pointsByTask')}</div>
              <div className="table-responsive">
                <table className="table table-sm align-middle mb-0">
                  <thead className="table-light">
                    <tr>
                      <th>{t('leaderboard.taskColumn')}</th>
                      <th className="text-end">{t('leaderboard.pointsColumn')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pointsByTask.map((row) => (
                      <tr key={row.task}>
                        <td>{row.task}</td>
                        <td className="text-end">{row.points.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {completionsLoading ? (
            <div className="text-center text-muted py-3">{t('adminUsers.loading')}</div>
          ) : filteredCompletions.length === 0 ? (
            <p className="text-muted px-3 py-2 mb-0">{t('adminUsers.noCompletions')}</p>
          ) : (
            <div className="table-responsive">
              <table className="table table-sm align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    <th>{t('adminUsers.date')}</th>
                    <th>{t('leaderboard.taskColumn')}</th>
                    <th>{t('adminUsers.type')}</th>
                    <th>{t('adminUsers.status')}</th>
                    <th>{t('adminUsers.count')}</th>
                    <th>{t('adminUsers.adminNote')}</th>
                    <th className="text-end">{t('adminUsers.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedCompletions.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDateToLocal(item.submitted_at)}</td>
                      <td>{item.task?.name || `Task #${item.task_id}`}</td>
                      <td>
                        {(() => {
                          if (item.variant && item.variant.name) {
                            return (
                              <span className="badge bg-info text-dark px-2 py-1">
                                {item.variant.name}
                              </span>
                            );
                          }
                          if (item.variant_id && item.task?.variants) {
                            const variant = item.task.variants.find(v => v.id === item.variant_id);
                            if (variant && variant.name) {
                              return (
                                <span className="badge bg-info text-dark px-2 py-1">
                                  {variant.name}
                                </span>
                              );
                            }
                          }
                          return <span className="text-muted small">—</span>;
                        })()}
                      </td>
                      <td>
                        <select
                          className="form-select form-select-sm"
                          value={item.status}
                          onChange={(event) =>
                            handleCompletionStatusChange(item.id, event.target.value)
                          }
                        >
                          <option value="approved">{t('adminUsers.approved')}</option>
                          <option value="rejected">{t('adminUsers.rejected')}</option>
                          {item.status === "pending" && (
                            <option value="pending" disabled>
                              {t("adminUsers.pending")}
                            </option>
                          )}
                        </select>
                      </td>
                      <td>
                        <input
                          type="number"
                          min="1"
                          max="999"
                          className="form-control form-control-sm"
                          value={completionDrafts[item.id] ?? ""}
                          onChange={(event) =>
                            setCompletionDrafts((prev) => ({
                              ...prev,
                              [item.id]: event.target.value,
                            }))
                          }
                        />
                      </td>
                      <td className="small">
                        {item.admin_note ? item.admin_note : <span className="text-muted">—</span>}
                      </td>
                      <td className="text-end d-flex justify-content-end gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-primary btn-sm"
                          onClick={() => handleCompletionSave(item.id)}
                          disabled={updateCompletionMutation.isLoading}
                        >
                          {t('common.save')}
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-danger btn-sm"
                          onClick={() => handleCompletionDelete(item.id)}
                          disabled={deleteCompletionMutation.isLoading}
                        >
                          {t('common.delete')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {filteredCompletions.length > COMPLETIONS_PAGE_SIZE && (
            <div className="d-flex justify-content-between align-items-center gap-2 p-3 border-top">
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={visibleCompletionPage === 1} onClick={() => setCompletionPage((page) => page - 1)}>{t("adminUsers.prev")}</button>
              <span className="small text-muted">{t("adminUsers.page", { page: visibleCompletionPage, pages: completionPages })}</span>
              <button type="button" className="btn btn-outline-secondary btn-sm" disabled={visibleCompletionPage === completionPages} onClick={() => setCompletionPage((page) => page + 1)}>{t("adminUsers.next")}</button>
            </div>
          )}
      </AdminPanel>

      {showCreateCompletionModal && (
        <>
          <div
            className="modal fade show d-block"
            role="dialog"
            tabIndex="-1"
            onClick={closeCreateCompletionModal}
          >
            <div className="modal-dialog" role="document" onClick={(event) => event.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{t("adminUsers.addCompletionBtn")}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label={t("common.close")}
                    onClick={closeCreateCompletionModal}
                  ></button>
                </div>
                {tasksLoading ? (
                  <div className="modal-body">
                    <div className="text-center text-muted">{t("adminUsers.loadingTasks")}</div>
                  </div>
                ) : assignableTasks.length === 0 ? (
                  <div className="modal-body">
                    <div className="alert alert-warning mb-0" role="alert">
                      {t("adminUsers.noCompatibleTasks")}
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleCreateCompletion}>
                    <div className="modal-body">
                      {completionCreateError && (
                        <div className="alert alert-danger" role="alert">
                          {completionCreateError}
                        </div>
                      )}
                      <div className="mb-3">
                        <label className="form-label">{t("adminUsers.task")}</label>
                        <select
                          className="form-select"
                          value={newCompletionForm.taskId}
                          onChange={(event) =>
                            setNewCompletionForm((prev) => ({
                              ...prev,
                              taskId: event.target.value,
                              variantId: "",
                            }))
                          }
                          required
                        >
                          <option value="" disabled>
                            {t("adminUsers.selectTask")}
                          </option>
                          {assignableTasks.map((task) => (
                            <option key={task.value} value={task.value}>
                              {task.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {availableVariants.length > 0 && (
                        <div className="mb-3">
                          <label className="form-label">{t("adminUsers.taskType")}</label>
                          <select
                            className="form-select"
                            value={newCompletionForm.variantId}
                            onChange={(event) =>
                              setNewCompletionForm((prev) => ({
                                ...prev,
                                variantId: event.target.value,
                              }))
                            }
                            required
                          >
                            <option value="" disabled>
                              {t("adminUsers.selectTaskType")}
                            </option>
                            {availableVariants.map((variant) => (
                              <option key={variant.value} value={variant.value}>
                                {variant.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div className="row g-3">
                        <div className="col-12 col-md-6">
                          <label className="form-label">{t("adminUsers.count")}</label>
                          <input
                            className="form-control"
                            type="number"
                            min="1"
                            max="999"
                            value={newCompletionForm.count}
                            onChange={(event) =>
                              setNewCompletionForm((prev) => ({
                                ...prev,
                                count: event.target.value,
                              }))
                            }
                            required
                          />
                        </div>
                        <div className="col-12 col-md-6">
                          <label className="form-label">{t("adminUsers.status")}</label>
                          <select
                            className="form-select"
                            value={newCompletionForm.status}
                            onChange={(event) =>
                              setNewCompletionForm((prev) => ({
                                ...prev,
                                status: event.target.value,
                              }))
                            }
                          >
                            <option value="approved">{t("adminUsers.approved")}</option>
                            <option value="rejected">{t("adminUsers.rejected")}</option>
                          </select>
                        </div>
                      </div>
                      <div className="mb-3 mt-3">
                        <label className="form-label">{t("adminUsers.memberNote")}</label>
                        <textarea
                          className="form-control"
                          rows={2}
                          value={newCompletionForm.memberNote}
                          onChange={(event) =>
                            setNewCompletionForm((prev) => ({
                              ...prev,
                              memberNote: event.target.value,
                            }))
                          }
                        ></textarea>
                      </div>
                      <div className="mb-0">
                        <label className="form-label">{t("adminUsers.adminNote")}</label>
                        <textarea
                          className="form-control"
                          rows={2}
                          value={newCompletionForm.adminNote}
                          onChange={(event) =>
                            setNewCompletionForm((prev) => ({
                              ...prev,
                              adminNote: event.target.value,
                            }))
                          }
                        ></textarea>
                      </div>
                    </div>
                    <div className="modal-footer">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={closeCreateCompletionModal}
                        disabled={createCompletionMutation.isLoading}
                      >
                        {t("common.cancel")}
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={createCompletionMutation.isLoading}
                      >
                        {t("adminUsers.addCompletionBtn")}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </>
  );
}

UserCompetitionHistory.propTypes = {
  selectedUserId: PropTypes.number,
  userTeamId: PropTypes.number,
};
