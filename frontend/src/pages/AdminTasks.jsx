import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { convertLocalToUTC, isDateExpired } from "../utils/dateUtils";

const getPeriodUnits = (t) => [
  { value: "hour", label: t("adminTasks.periodUnits.hour") },
  { value: "day", label: t("adminTasks.periodUnits.day") },
  { value: "week", label: t("adminTasks.periodUnits.week") },
  { value: "month", label: t("adminTasks.periodUnits.month") },
];

marked.setOptions({ breaks: true });

const emptyTaskForm = {
  name: "",
  description: "",
  points_per_completion: "",
  requires_approval: false,
  hot_deal: false,
  max_per_period: "",
  period_unit: "day",
  period_count: "",
  start_time: "",
  end_time: "",
  team_id: "",
};

const mapTaskToForm = (task) => ({
  name: task.name,
  description: task.description || "",
  points_per_completion: String(task.points_per_completion || ""),
  requires_approval: Boolean(task.requires_approval),
  hot_deal: Boolean(task.hot_deal),
  max_per_period: task.max_per_period ? String(task.max_per_period) : "",
  period_unit: task.period_unit || "day",
  period_count: task.period_count ? String(task.period_count) : "",
  start_time: task.start_time ? task.start_time.slice(0, 16) : "",
  end_time: task.end_time ? task.end_time.slice(0, 16) : "",
  team_id: task.team_id ? String(task.team_id) : "",
});

const buildPayload = (form) => {
  const payload = {
    name: form.name,
    description: form.description || null,
    points_per_completion: parseFloat(form.points_per_completion),
    requires_approval: form.requires_approval,
    hot_deal: form.hot_deal,
    team_id: form.team_id ? Number(form.team_id) : null,
  };

  if (form.start_time) {
    payload.start_time = convertLocalToUTC(form.start_time);
  }
  if (form.end_time) {
    payload.end_time = convertLocalToUTC(form.end_time);
  }
  if (form.max_per_period) {
    payload.max_per_period = Number(form.max_per_period);
    payload.period_unit = form.period_unit;
    payload.period_count = form.period_count ? Number(form.period_count) : 1;
  } else {
    payload.max_per_period = null;
    payload.period_unit = null;
    payload.period_count = null;
  }

  return payload;
};

const formatStatus = (task, t) => {
  if (task.is_archived) return t("adminTasks.status.archived");
  if (task.end_time && isDateExpired(task.end_time)) return t("adminTasks.status.expired");
  return t("adminTasks.status.active");
};

const renderMarkdown = (markdown) => ({
  __html: DOMPurify.sanitize(marked.parse(markdown || "")),
});

export default function AdminTasks() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [createForm, setCreateForm] = useState(emptyTaskForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState(emptyTaskForm);
  const [variantManagementTaskId, setVariantManagementTaskId] = useState(null);
  const [variantForm, setVariantForm] = useState({ name: "", description: "", points: "", position: "" });
  const [editVariantModalOpen, setEditVariantModalOpen] = useState(false);
  const [editingVariant, setEditingVariant] = useState(null);
  const [editVariantForm, setEditVariantForm] = useState({ name: "", description: "", points: "", position: "" });

  const handleOpenEditModal = (task) => {
    setEditingTaskId(task.id);
    setEditForm(mapTaskToForm(task));
  };

  const handleCloseEditModal = () => {
    setEditingTaskId(null);
    setEditForm(emptyTaskForm);
  };

  const handleOpenVariantModal = (task) => {
    setVariantManagementTaskId(task.id);
  };

  const handleCloseVariantModal = () => {
    setVariantManagementTaskId(null);
    setVariantForm({ name: "", description: "", points: "", position: "" });
    setEditVariantModalOpen(false);
    setEditingVariant(null);
    setEditVariantForm({ name: "", description: "", points: "", position: "" });
  };

  const handleCreateVariant = (e) => {
    e.preventDefault();
    if (!variantManagementTaskId) return;
    const payload = {
      name: variantForm.name,
      description: variantForm.description || null,
      points: parseFloat(variantForm.points),
      position: variantForm.position ? parseInt(variantForm.position) : undefined,
    };
    createVariantMutation.mutate({ taskId: variantManagementTaskId, payload });
  };

  const handleDeleteVariant = (variantId) => {
    if (!variantManagementTaskId) return;
    if (!window.confirm(t('adminTasks.confirmDeleteVariant'))) return;
    deleteVariantMutation.mutate({ taskId: variantManagementTaskId, variantId });
  };

  const handleOpenEditVariantModal = (variant) => {
    setEditingVariant(variant);
    setEditVariantForm({
      name: variant.name,
      description: variant.description || "",
      points: variant.points.toString(),
      position: variant.position?.toString() || ""
    });
    setEditVariantModalOpen(true);
  };

  const handleCloseEditVariantModal = () => {
    setEditVariantModalOpen(false);
    setEditingVariant(null);
    setEditVariantForm({ name: "", description: "", points: "", position: "" });
  };

  const handleSaveVariantEdit = (e) => {
    e.preventDefault();
    if (!variantManagementTaskId || !editingVariant) return;
    const payload = {
      name: editVariantForm.name,
      description: editVariantForm.description || null,
      points: parseFloat(editVariantForm.points),
      position: editVariantForm.position ? parseInt(editVariantForm.position) : undefined,
    };
    updateVariantMutation.mutate({ taskId: variantManagementTaskId, variantId: editingVariant.id, payload });
  };

  const { data: tasks = [], isLoading, isError, error } = useQuery({
    queryKey: ["admin", "tasks"],
    queryFn: async () => {
      const { data } = await api.get("/tasks", { params: { include_archived: true } });
      return data;
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const { data: teams = [] } = useQuery({
    queryKey: ["admin", "teams"],
    queryFn: async () => {
      const { data } = await api.get("/teams");
      return data;
    },
    enabled: isAdmin,
    staleTime: 60_000,
  });

  const createMutation = useMutation({
    mutationFn: async (payload) => api.post("/tasks", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
      setCreateForm(emptyTaskForm);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, payload }) => api.patch(`/tasks/${id}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
      handleCloseEditModal();
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async (id) => api.delete(`/tasks/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
    },
  });

  const unarchiveMutation = useMutation({
    mutationFn: async (id) => api.post(`/tasks/${id}/unarchive`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => api.delete(`/tasks/${id}/force`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
      handleCloseEditModal();
    },
  });

  const createVariantMutation = useMutation({
    mutationFn: async ({ taskId, payload }) => api.post(`/tasks/${taskId}/variants`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
      setVariantForm({ name: "", description: "", points: "", position: "" });
    },
  });


  const deleteVariantMutation = useMutation({
    mutationFn: async ({ taskId, variantId }) => api.delete(`/tasks/${taskId}/variants/${variantId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
    },
  });

  const updateVariantMutation = useMutation({
    mutationFn: async ({ taskId, variantId, payload }) => api.patch(`/tasks/${taskId}/variants/${variantId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "tasks"] });
      handleCloseEditVariantModal();
    },
  });

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [tasks]);

  const activeEditingTask = editingTaskId
    ? tasks.find((task) => task.id === editingTaskId)
    : null;

  const handleDeleteTask = () => {
    if (!activeEditingTask) return;
    if (!window.confirm(t('adminTasks.confirmDeleteTask', { taskName: activeEditingTask.name }))) {
      return;
    }
    deleteMutation.mutate(activeEditingTask.id);
  };

  return (
    <div className="container px-0">
      <div className="row g-4">
        <div className="col-12 col-xl-5">
          <div className="card shadow-sm h-100">
            <div className="card-header">{t('adminTasks.createTask')}</div>
            <div className="card-body">
              <form
                className="row g-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const payload = buildPayload(createForm);
                  createMutation.mutate(payload);
                }}
              >
                <div className="col-12 col-md-6">
                  <label className="form-label">{t('adminTasks.name')}</label>
                  <input
                    className="form-control"
                    value={createForm.name}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                    required
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">{t('adminTasks.pointsPerCompletion')}</label>
                  <input
                    className="form-control"
                    type="number"
                    step="0.1"
                    value={createForm.points_per_completion}
                    onChange={(event) =>
                      setCreateForm((prev) => ({
                        ...prev,
                        points_per_completion: event.target.value,
                      }))
                    }
                    required
                  />
                </div>
                <div className="col-12">
                  <label className="form-label">{t('adminTasks.description')}</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={createForm.description}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder={t('adminTasks.markdownPlaceholder')}
                  ></textarea>
                  <div className="form-text">{t('adminTasks.preview')}</div>
                  <div
                    className="border rounded bg-light p-3"
                    dangerouslySetInnerHTML={renderMarkdown(
                      createForm.description || t('adminTasks.noDescriptionYet')
                    )}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">{t('adminTasks.teamOptional')}</label>
                  <select
                    className="form-select"
                    value={createForm.team_id}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, team_id: event.target.value }))
                    }
                  >
                    <option value="">{t('adminTasks.allTeams')}</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-6">
                  <div className="form-check mb-2">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="createRequiresApproval"
                      checked={createForm.requires_approval}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          requires_approval: event.target.checked,
                        }))
                      }
                    />
                    <label className="form-check-label" htmlFor="createRequiresApproval">
                      {t('adminTasks.requiresApproval')}
                    </label>
                  </div>
                  <div className="form-check">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      id="createHotDeal"
                      checked={createForm.hot_deal}
                      onChange={(event) =>
                        setCreateForm((prev) => ({
                          ...prev,
                          hot_deal: event.target.checked,
                        }))
                      }
                    />
                    <label className="form-check-label" htmlFor="createHotDeal">
                      {t('adminTasks.hotDeal')}
                    </label>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label">{t('adminTasks.maxPerPeriod')}</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    value={createForm.max_per_period}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, max_per_period: event.target.value }))
                    }
                  />
                </div>
                <div className="col-6 col-md-4">
                  <label className="form-label">{t('adminTasks.periodCount')}</label>
                  <input
                    className="form-control"
                    type="number"
                    min="1"
                    value={createForm.period_count}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, period_count: event.target.value }))
                    }
                    disabled={!createForm.max_per_period}
                  />
                </div>
                <div className="col-6 col-md-4">
                  <label className="form-label">{t('adminTasks.periodUnit')}</label>
                  <select
                    className="form-select"
                    value={createForm.period_unit}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, period_unit: event.target.value }))
                    }
                    disabled={!createForm.max_per_period}
                  >
                    {getPeriodUnits(t).map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label">{t('adminTasks.startTime')}</label>
                  <input
                    className="form-control"
                    type="datetime-local"
                    value={createForm.start_time}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, start_time: event.target.value }))
                    }
                  />
                </div>
                <div className="col-6">
                  <label className="form-label">{t('adminTasks.endTime')}</label>
                  <input
                    className="form-control"
                    type="datetime-local"
                    value={createForm.end_time}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, end_time: event.target.value }))
                    }
                  />
                </div>
                <div className="col-12">
                  {createMutation.isError && (
                    <div className="alert alert-danger" role="alert">
                      {createMutation.error?.response?.data?.detail || t('adminTasks.failedToCreate')}
                    </div>
                  )}
                  <button className="btn btn-primary" type="submit" disabled={createMutation.isLoading}>
                    {t('adminTasks.createTask')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-7">
          <div className="card shadow-sm h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span>{t('adminTasks.existingTasks')}</span>
              <span className="badge bg-secondary">{tasks.length}</span>
            </div>
            <div className="card-body">
              {isLoading ? (
                <div className="text-center text-muted py-4">{t('adminTasks.loading')}</div>
              ) : isError ? (
                <div className="alert alert-danger" role="alert">
                  {error?.response?.data?.detail || t('adminTasks.failedToLoad')}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-striped align-middle">
                    <thead>
                      <tr>
                        <th>{t('adminTasks.name')}</th>
                        <th>{t('adminTasks.pointsVariants')}</th>
                        <th>{t('adminTasks.periodLimit')}</th>
                        <th>{t('adminTasks.status.label')}</th>
                        <th>{t('adminTasks.team')}</th>
                        <th className="text-end">{t('adminTasks.actions')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTasks.map((task) => (
                        <tr key={task.id}>
                          <td>
                            <div className="fw-semibold">{task.name}</div>
                            {task.description && (
                              <div
                                className="text-muted small"
                                dangerouslySetInnerHTML={renderMarkdown(task.description)}
                              />
                            )}
                          </td>
                          <td>
                            {task.variants && task.variants.length > 0 ? (
                              <div>
                                <div className="fw-semibold small text-primary">
                                  {t('adminTasks.variantCount', { count: task.variants.length })}
                                </div>
                                <div className="small text-muted">
                                  {Math.min(...task.variants.map(v => v.points))}-{Math.max(...task.variants.map(v => v.points))} {t("tasks.pts")}
                                </div>
                              </div>
                            ) : (
                              <div className="text-muted small">{task.points_per_completion} {t("tasks.pts")}</div>
                            )}
                          </td>
                          <td>
                            {task.max_per_period
                              ? `${task.max_per_period} / ${task.period_count} ${t(`adminTasks.periodUnits.${task.period_unit}`)}`
                              : "—"}
                          </td>
                          <td>
                            <span className={`badge ${task.is_archived ? "bg-secondary" : formatStatus(task, t) === t('adminTasks.status.expired') ? "bg-warning text-dark" : "bg-success"}`}>
                              {formatStatus(task, t)}
                            </span>
                          </td>
                          <td>
                            {task.team_id
                              ? teams.find((team) => team.id === task.team_id)?.name || `#${task.team_id}`
                              : t('adminTasks.allTeams')}
                          </td>
                          <td className="text-end">
                            <div className="d-inline-flex flex-column gap-2">
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => handleOpenEditModal(task)}
                              >
                                {t('adminTasks.edit')}
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-info btn-sm"
                                onClick={() => handleOpenVariantModal(task)}
                              >
                                {t('adminTasks.variants', { count: task.variants?.length || 0 })}
                              </button>
                              {task.is_archived ? (
                                <button
                                  type="button"
                                  className="btn btn-outline-success btn-sm"
                                  onClick={() => unarchiveMutation.mutate(task.id)}
                                >
                                  {t('adminTasks.unarchive')}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => archiveMutation.mutate(task.id)}
                                >
                                  {t('adminTasks.archive')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {activeEditingTask && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog modal-xl" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{t('adminTasks.editTask', { taskName: activeEditingTask.name })}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={handleCloseEditModal}
                  ></button>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!activeEditingTask) return;
                    const payload = buildPayload(editForm);
                    updateMutation.mutate({ id: activeEditingTask.id, payload });
                  }}
                >
                  <div className="modal-body">
                    <div className="row g-3">
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminTasks.name')}</label>
                        <input
                          className="form-control"
                          value={editForm.name}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                          required
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminTasks.pointsPerCompletion')}</label>
                        <input
                          className="form-control"
                          type="number"
                          step="0.1"
                          value={editForm.points_per_completion}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, points_per_completion: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label">{t('adminTasks.description')}</label>
                        <textarea
                          className="form-control"
                          rows={4}
                          value={editForm.description}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, description: event.target.value }))
                          }
                          placeholder={t('adminTasks.markdownPlaceholder')}
                        ></textarea>
                        <div className="form-text">{t('adminTasks.preview')}</div>
                        <div
                          className="border rounded bg-light p-3"
                          dangerouslySetInnerHTML={renderMarkdown(
                            editForm.description || t('adminTasks.noDescriptionYet')
                          )}
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminTasks.teamOptional')}</label>
                        <select
                          className="form-select"
                          value={editForm.team_id}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, team_id: event.target.value }))}
                        >
                          <option value="">{t('adminTasks.allTeams')}</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12 col-md-6 d-flex align-items-center">
                        <div className="form-check mb-2">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="editRequiresApproval"
                            checked={editForm.requires_approval}
                            onChange={(event) =>
                              setEditForm((prev) => ({
                                ...prev,
                                requires_approval: event.target.checked,
                              }))
                            }
                          />
                          <label className="form-check-label" htmlFor="editRequiresApproval">
                            {t('adminTasks.requiresApproval')}
                          </label>
                        </div>
                        <div className="form-check">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="editHotDeal"
                            checked={editForm.hot_deal}
                            onChange={(event) =>
                              setEditForm((prev) => ({
                                ...prev,
                                hot_deal: event.target.checked,
                              }))
                            }
                          />
                          <label className="form-check-label" htmlFor="editHotDeal">
                            {t('adminTasks.hotDeal')}
                          </label>
                        </div>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">{t('adminTasks.maxPerPeriod')}</label>
                        <input
                          className="form-control"
                          type="number"
                          min="1"
                          value={editForm.max_per_period}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, max_per_period: event.target.value }))
                          }
                        />
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">{t('adminTasks.periodCount')}</label>
                        <input
                          className="form-control"
                          type="number"
                          min="1"
                          value={editForm.period_count}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, period_count: event.target.value }))
                          }
                          disabled={!editForm.max_per_period}
                        />
                      </div>
                      <div className="col-6 col-md-4">
                        <label className="form-label">{t('adminTasks.periodUnit')}</label>
                        <select
                          className="form-select"
                          value={editForm.period_unit}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, period_unit: event.target.value }))
                          }
                          disabled={!editForm.max_per_period}
                        >
                          {getPeriodUnits(t).map((unit) => (
                            <option key={unit.value} value={unit.value}>
                              {unit.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-6">
                        <label className="form-label">{t('adminTasks.startTime')}</label>
                        <input
                          className="form-control"
                          type="datetime-local"
                          value={editForm.start_time}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, start_time: event.target.value }))
                          }
                        />
                      </div>
                      <div className="col-6">
                        <label className="form-label">{t('adminTasks.endTime')}</label>
                        <input
                          className="form-control"
                          type="datetime-local"
                          value={editForm.end_time}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, end_time: event.target.value }))
                          }
                        />
                      </div>
                      {updateMutation.isError && (
                        <div className="col-12">
                          <div className="alert alert-danger" role="alert">
                            {updateMutation.error?.response?.data?.detail || t('adminTasks.failedToUpdate')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="modal-footer d-flex justify-content-between">
                    <button
                      type="button"
                      className="btn btn-danger"
                      onClick={handleDeleteTask}
                      disabled={updateMutation.isLoading || deleteMutation.isLoading}
                    >
                      {t('adminTasks.deleteTask')}
                    </button>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={handleCloseEditModal}
                        disabled={updateMutation.isLoading || deleteMutation.isLoading}
                      >
                        {t('adminTasks.cancel')}
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={updateMutation.isLoading || deleteMutation.isLoading}
                      >
                        {t('adminTasks.saveChanges')}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Variant Management Modal */}
      {variantManagementTaskId && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog modal-lg" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    {t('adminTasks.manageVariants', { taskName: tasks.find(t => t.id === variantManagementTaskId)?.name })}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={handleCloseVariantModal}
                  ></button>
                </div>
                <div className="modal-body">
                  {/* Create New Variant Form */}
                  <div className="card mb-4">
                    <div className="card-header">{t('adminTasks.addNewVariant')}</div>
                    <div className="card-body">
                      <form onSubmit={handleCreateVariant} className="row g-3">
                        <div className="col-md-6">
                          <label className="form-label">{t('adminTasks.variantName')}</label>
                          <input
                            type="text"
                            className="form-control"
                            value={variantForm.name}
                            onChange={(e) => setVariantForm(prev => ({ ...prev, name: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">{t('adminTasks.points')}</label>
                          <input
                            type="number"
                            step="0.1"
                            className="form-control"
                            value={variantForm.points}
                            onChange={(e) => setVariantForm(prev => ({ ...prev, points: e.target.value }))}
                            required
                          />
                        </div>
                        <div className="col-md-3">
                          <label className="form-label">{t('adminTasks.positionOptional')}</label>
                          <input
                            type="number"
                            className="form-control"
                            value={variantForm.position}
                            onChange={(e) => setVariantForm(prev => ({ ...prev, position: e.target.value }))}
                          />
                        </div>
                        <div className="col-12">
                          <label className="form-label">{t('adminTasks.descriptionOptional')}</label>
                          <textarea
                            className="form-control"
                            rows={3}
                            value={variantForm.description}
                            onChange={(e) => setVariantForm(prev => ({ ...prev, description: e.target.value }))}
                            placeholder={t('adminTasks.supportsMarkdown')}
                          />
                        </div>
                        <div className="col-12">
                          <button
                            type="submit"
                            className="btn btn-primary"
                            disabled={createVariantMutation.isLoading}
                          >
                            {t('adminTasks.addVariant')}
                          </button>
                          {createVariantMutation.isError && (
                            <div className="text-danger mt-2 small">
                              {createVariantMutation.error?.response?.data?.detail || t('adminTasks.failedToCreateVariant')}
                            </div>
                          )}
                        </div>
                      </form>
                    </div>
                  </div>

                  {/* Existing Variants List */}
                  <div className="card">
                    <div className="card-header">{t('adminTasks.existingVariants')}</div>
                    <div className="card-body">
                      {(() => {
                        const currentTask = tasks.find(t => t.id === variantManagementTaskId);
                        const variants = currentTask?.variants || [];

                        if (variants.length === 0) {
                          return <p className="text-muted">{t('adminTasks.noVariantsYet')}</p>;
                        }

                        return (
                          <div className="table-responsive">
                            <table className="table table-sm">
                              <thead>
                                <tr>
                                  <th>{t('adminTasks.position')}</th>
                                  <th>{t('adminTasks.name')}</th>
                                  <th>{t('adminTasks.points')}</th>
                                  <th>{t('adminTasks.description')}</th>
                                  <th>{t('adminTasks.actions')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {variants
                                  .sort((a, b) => a.position - b.position)
                                  .map((variant) => (
                                    <tr key={variant.id}>
                                      <td>{variant.position}</td>
                                      <td className="fw-medium">{variant.name}</td>
                                      <td>{variant.points}</td>
                                      <td className="text-muted small">
                                        {variant.description ? (
                                          <div
                                            dangerouslySetInnerHTML={{
                                              __html: DOMPurify.sanitize(marked.parse(variant.description))
                                            }}
                                          />
                                        ) : (
                                          <em>{t('adminTasks.noDescription')}</em>
                                        )}
                                      </td>
                                      <td>
                                        <div className="btn-group-sm">
                                          <button
                                            type="button"
                                            className="btn btn-outline-primary btn-sm me-1"
                                            onClick={() => handleOpenEditVariantModal(variant)}
                                          >
                                            {t('adminTasks.edit')}
                                          </button>
                                          <button
                                            type="button"
                                            className="btn btn-outline-danger btn-sm"
                                            onClick={() => handleDeleteVariant(variant.id)}
                                            disabled={deleteVariantMutation.isLoading}
                                          >
                                            {t('adminTasks.delete')}
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  ))
                                }
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  {updateVariantMutation.isError && (
                    <div className="text-danger me-auto small">
                      {updateVariantMutation.error?.response?.data?.detail || t('adminTasks.failedToUpdate')}
                    </div>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={handleCloseVariantModal}
                  >
                    {t('adminTasks.close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Edit Variant Modal */}
      {editVariantModalOpen && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    {t('adminTasks.edit')} {editingVariant?.name}
                  </h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={handleCloseEditVariantModal}
                  />
                </div>
                <form onSubmit={handleSaveVariantEdit}>
                  <div className="modal-body">
                    <div className="row g-3">
                      <div className="col-md-8">
                        <label className="form-label">
                          {t('adminTasks.variantName')} <span className="text-danger">*</span>
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={editVariantForm.name}
                          onChange={(e) => setEditVariantForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder={t('adminTasks.variantName')}
                          required
                        />
                      </div>
                      <div className="col-md-4">
                        <label className="form-label">
                          {t('adminTasks.points')} <span className="text-danger">*</span>
                        </label>
                        <input
                          type="number"
                          className="form-control"
                          step="0.1"
                          value={editVariantForm.points}
                          onChange={(e) => setEditVariantForm(prev => ({ ...prev, points: e.target.value }))}
                          placeholder={t('adminTasks.points')}
                          required
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label">{t('adminTasks.positionOptional')}</label>
                        <input
                          type="number"
                          className="form-control"
                          value={editVariantForm.position}
                          onChange={(e) => setEditVariantForm(prev => ({ ...prev, position: e.target.value }))}
                          placeholder={t('adminTasks.positionOptional')}
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label">{t('adminTasks.descriptionOptional')}</label>
                        <textarea
                          className="form-control"
                          rows="4"
                          value={editVariantForm.description}
                          onChange={(e) => setEditVariantForm(prev => ({ ...prev, description: e.target.value }))}
                          placeholder={t('adminTasks.supportsMarkdown')}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    {updateVariantMutation.isError && (
                      <div className="text-danger me-auto small">
                        {updateVariantMutation.error?.response?.data?.detail || t('adminTasks.failedToUpdate')}
                      </div>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleCloseEditVariantModal}
                      disabled={updateVariantMutation.isLoading}
                    >
                      {t('adminTasks.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updateVariantMutation.isLoading || !editVariantForm.name || !editVariantForm.points}
                    >
                      {updateVariantMutation.isLoading ? t('adminTasks.loading') : t('adminTasks.saveChanges')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

    </div>
  );
}
