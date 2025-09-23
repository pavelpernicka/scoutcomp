import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import DOMPurify from "dompurify";
import { marked } from "marked";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

const periodUnits = [
  { value: "hour", label: "Hour" },
  { value: "day", label: "Day" },
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
];

marked.setOptions({ breaks: true });

const emptyTaskForm = {
  name: "",
  description: "",
  points_per_completion: "",
  requires_approval: false,
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
    team_id: form.team_id ? Number(form.team_id) : null,
  };

  if (form.start_time) {
    payload.start_time = new Date(form.start_time).toISOString();
  }
  if (form.end_time) {
    payload.end_time = new Date(form.end_time).toISOString();
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

const formatStatus = (task) => {
  if (task.is_archived) return "Archived";
  if (task.end_time && new Date(task.end_time) < new Date()) return "Expired";
  return "Active";
};

const renderMarkdown = (markdown) => ({
  __html: DOMPurify.sanitize(marked.parse(markdown || "")),
});

export default function AdminTasks() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();
  const [createForm, setCreateForm] = useState(emptyTaskForm);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState(emptyTaskForm);

  const handleOpenEditModal = (task) => {
    setEditingTaskId(task.id);
    setEditForm(mapTaskToForm(task));
  };

  const handleCloseEditModal = () => {
    setEditingTaskId(null);
    setEditForm(emptyTaskForm);
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

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }, [tasks]);

  const activeEditingTask = editingTaskId
    ? tasks.find((task) => task.id === editingTaskId)
    : null;

  const handleDeleteTask = () => {
    if (!activeEditingTask) return;
    if (!window.confirm(`Are you sure you want to permanently delete "${activeEditingTask.name}"?\n\nThis will delete all completions associated with this task and cannot be undone.`)) {
      return;
    }
    deleteMutation.mutate(activeEditingTask.id);
  };

  return (
    <div className="container px-0">
      <div className="row g-4">
        <div className="col-12 col-xl-5">
          <div className="card shadow-sm h-100">
            <div className="card-header">Create Task</div>
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
                  <label className="form-label">Name</label>
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
                  <label className="form-label">Points per completion</label>
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
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows={4}
                    value={createForm.description}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                    placeholder="Supports Markdown (e.g., **bold**, _italic_, lists)"
                  ></textarea>
                  <div className="form-text">Preview:</div>
                  <div
                    className="border rounded bg-light p-3"
                    dangerouslySetInnerHTML={renderMarkdown(
                      createForm.description || "_No description yet_"
                    )}
                  />
                </div>
                <div className="col-12 col-md-6">
                  <label className="form-label">Team (optional)</label>
                  <select
                    className="form-select"
                    value={createForm.team_id}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, team_id: event.target.value }))
                    }
                  >
                    <option value="">All teams</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-12 col-md-6 d-flex align-items-center">
                  <div className="form-check">
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
                      Requires approval
                    </label>
                  </div>
                </div>
                <div className="col-12 col-md-4">
                  <label className="form-label">Max per period</label>
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
                  <label className="form-label">Period count</label>
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
                  <label className="form-label">Period unit</label>
                  <select
                    className="form-select"
                    value={createForm.period_unit}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, period_unit: event.target.value }))
                    }
                    disabled={!createForm.max_per_period}
                  >
                    {periodUnits.map((unit) => (
                      <option key={unit.value} value={unit.value}>
                        {unit.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="col-6">
                  <label className="form-label">Start time</label>
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
                  <label className="form-label">End time</label>
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
                      {createMutation.error?.response?.data?.detail || "Failed to create task."}
                    </div>
                  )}
                  <button className="btn btn-primary" type="submit" disabled={createMutation.isLoading}>
                    Create task
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-7">
          <div className="card shadow-sm h-100">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span>Existing Tasks</span>
              <span className="badge bg-secondary">{tasks.length}</span>
            </div>
            <div className="card-body">
              {isLoading ? (
                <div className="text-center text-muted py-4">Loading…</div>
              ) : isError ? (
                <div className="alert alert-danger" role="alert">
                  {error?.response?.data?.detail || "Unable to load tasks."}
                </div>
              ) : (
                <div className="table-responsive">
                  <table className="table table-striped align-middle">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Period limit</th>
                        <th>Status</th>
                        <th>Team</th>
                        <th className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedTasks.map((task) => (
                        <tr key={task.id}>
                          <td>
                          <div className="fw-semibold">{task.name}</div>
                          <div className="text-muted small">{task.points_per_completion} pts</div>
                          {task.description && (
                            <div
                              className="text-muted small"
                              dangerouslySetInnerHTML={renderMarkdown(task.description)}
                            />
                          )}
                          </td>
                          <td>
                            {task.max_per_period
                              ? `${task.max_per_period} / ${task.period_count} ${task.period_unit}`
                              : "—"}
                          </td>
                          <td>
                            <span className={`badge ${task.is_archived ? "bg-secondary" : formatStatus(task) === "Expired" ? "bg-warning text-dark" : "bg-success"}`}>
                              {formatStatus(task)}
                            </span>
                          </td>
                          <td>
                            {task.team_id
                              ? teams.find((team) => team.id === task.team_id)?.name || `#${task.team_id}`
                              : "All"}
                          </td>
                          <td className="text-end">
                            <div className="d-inline-flex flex-column gap-2">
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                onClick={() => handleOpenEditModal(task)}
                              >
                                Edit
                              </button>
                              {task.is_archived ? (
                                <button
                                  type="button"
                                  className="btn btn-outline-success btn-sm"
                                  onClick={() => unarchiveMutation.mutate(task.id)}
                                >
                                  Unarchive
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  className="btn btn-outline-danger btn-sm"
                                  onClick={() => archiveMutation.mutate(task.id)}
                                >
                                  Archive
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
                  <h5 className="modal-title">Edit task – {activeEditingTask.name}</h5>
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
                        <label className="form-label">Name</label>
                        <input
                          className="form-control"
                          value={editForm.name}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))}
                          required
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Points per completion</label>
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
                        <label className="form-label">Description</label>
                        <textarea
                          className="form-control"
                          rows={4}
                          value={editForm.description}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, description: event.target.value }))
                          }
                          placeholder="Supports Markdown (e.g., **bold**, _italic_, lists)"
                        ></textarea>
                        <div className="form-text">Preview:</div>
                        <div
                          className="border rounded bg-light p-3"
                          dangerouslySetInnerHTML={renderMarkdown(
                            editForm.description || "_No description yet_"
                          )}
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Team (optional)</label>
                        <select
                          className="form-select"
                          value={editForm.team_id}
                          onChange={(event) => setEditForm((prev) => ({ ...prev, team_id: event.target.value }))}
                        >
                          <option value="">All teams</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-12 col-md-6 d-flex align-items-center">
                        <div className="form-check">
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
                            Requires approval
                          </label>
                        </div>
                      </div>
                      <div className="col-12 col-md-4">
                        <label className="form-label">Max per period</label>
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
                        <label className="form-label">Period count</label>
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
                        <label className="form-label">Period unit</label>
                        <select
                          className="form-select"
                          value={editForm.period_unit}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, period_unit: event.target.value }))
                          }
                          disabled={!editForm.max_per_period}
                        >
                          {periodUnits.map((unit) => (
                            <option key={unit.value} value={unit.value}>
                              {unit.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-6">
                        <label className="form-label">Start time</label>
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
                        <label className="form-label">End time</label>
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
                            {updateMutation.error?.response?.data?.detail || "Failed to update task."}
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
                      Delete Task
                    </button>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={handleCloseEditModal}
                        disabled={updateMutation.isLoading || deleteMutation.isLoading}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={updateMutation.isLoading || deleteMutation.isLoading}
                      >
                        Save changes
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

    </div>
  );
}
