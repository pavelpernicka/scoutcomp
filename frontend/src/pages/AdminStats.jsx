import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

const ICON_FILE_ACCEPT = "image/png,image/jpeg,image/svg+xml,image/webp,image/gif";
const MAX_ICON_BYTES = 150 * 1024;

const isImageDataUrl = (value) => typeof value === "string" && value.startsWith("data:image/");

const normalizeIconForPayload = (value) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const readFileAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Unexpected file reader result"));
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });

const emptyCategoryForm = {
  name: "",
  description: "",
  icon: "",
  iconFilename: "",
};

const emptyComponentForm = {
  taskId: "",
  metric: "points",
  weight: "1",
  position: "",
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

export default function AdminStats() {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [createForm, setCreateForm] = useState(emptyCategoryForm);
  const [categoryEditForm, setCategoryEditForm] = useState(emptyCategoryForm);
  const [componentForm, setComponentForm] = useState(emptyComponentForm);
  const [componentDrafts, setComponentDrafts] = useState({});
  const [feedback, setFeedback] = useState(null);

  const createIconInputRef = useRef(null);
  const editIconInputRef = useRef(null);

  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["admin", "stat-categories"],
    queryFn: async () => {
      const { data } = await api.get("/stats-categories/manage");
      return data;
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["admin", "tasks", "for-stats"],
    queryFn: async () => {
      const { data } = await api.get("/tasks", { params: { include_archived: true } });
      return data;
    },
    enabled: isAdmin,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!feedback) return;
    const timer = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    if (!categories.length) {
      setSelectedCategoryId(null);
      return;
    }
    if (!selectedCategoryId || !categories.some((category) => category.id === selectedCategoryId)) {
      setSelectedCategoryId(categories[0].id);
    }
  }, [categories, selectedCategoryId]);

  const selectedCategory = useMemo(
    () => categories.find((category) => category.id === selectedCategoryId) || null,
    [categories, selectedCategoryId]
  );

  useEffect(() => {
    if (!selectedCategory) {
      setCategoryEditForm({ ...emptyCategoryForm });
      setComponentDrafts({});
      setComponentForm((prev) => ({
        ...prev,
        taskId: tasks.length > 0 ? String(tasks[0].id) : "",
      }));
      return;
    }
    setCategoryEditForm({
      name: selectedCategory.name,
      description: selectedCategory.description || "",
      icon: selectedCategory.icon || "",
      iconFilename: "",
    });
    const drafts = {};
    selectedCategory.components
      .slice()
      .sort((a, b) => a.position - b.position || a.id - b.id)
      .forEach((component) => {
        drafts[component.id] = {
          taskId: String(component.task_id),
          metric: component.metric,
          weight: String(component.weight),
          position: component.position !== null ? String(component.position) : "",
        };
      });
    setComponentDrafts(drafts);
    setComponentForm((prev) => ({
      ...prev,
      taskId: tasks.length > 0 ? String(tasks[0].id) : "",
    }));
  }, [selectedCategory, tasks]);

  const createCategoryMutation = useMutation({
    mutationFn: async (payload) => api.post("/stats-categories", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "stat-categories"] });
      setCreateForm({ ...emptyCategoryForm });
      setFeedback({ type: "success", message: "Category created." });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: getErrorMessage(error, "Failed to create category.") });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: async ({ categoryId, payload }) => api.patch(`/stats-categories/${categoryId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "stat-categories"] });
      setFeedback({ type: "success", message: "Category updated." });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: getErrorMessage(error, "Failed to update category.") });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (categoryId) => api.delete(`/stats-categories/${categoryId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "stat-categories"] });
      setSelectedCategoryId(null);
      setFeedback({ type: "success", message: "Category deleted." });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: getErrorMessage(error, "Failed to delete category.") });
    },
  });

  const createComponentMutation = useMutation({
    mutationFn: async ({ categoryId, payload }) => api.post(`/stats-categories/${categoryId}/components`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "stat-categories"] });
      setComponentForm((prev) => ({ ...prev, weight: "1", position: "" }));
      setFeedback({ type: "success", message: "Component added." });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: getErrorMessage(error, "Failed to add component.") });
    },
  });

  const updateComponentMutation = useMutation({
    mutationFn: async ({ componentId, payload }) =>
      api.patch(`/stats-categories/components/${componentId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "stat-categories"] });
      setFeedback({ type: "success", message: "Component updated." });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: getErrorMessage(error, "Failed to update component.") });
    },
  });

  const deleteComponentMutation = useMutation({
    mutationFn: async (componentId) => api.delete(`/stats-categories/components/${componentId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "stat-categories"] });
      setFeedback({ type: "success", message: "Component removed." });
    },
    onError: (error) => {
      setFeedback({ type: "danger", message: getErrorMessage(error, "Failed to remove component.") });
    },
  });

  const tasksOptions = useMemo(
    () =>
      tasks.map((task) => ({
        value: String(task.id),
        label: task.team_id ? `${task.name} (team #${task.team_id})` : task.name,
      })),
    [tasks]
  );

  const handleCreateCategory = (event) => {
    event.preventDefault();
    const name = createForm.name.trim();
    const description = createForm.description.trim();
    const iconValue = normalizeIconForPayload(createForm.icon);
    if (!name) {
      setFeedback({ type: "warning", message: "Name is required." });
      return;
    }
    createCategoryMutation.mutate({
      name,
      description: description ? description : null,
      icon: iconValue,
    });
  };

  const handleUpdateCategory = (event) => {
    event.preventDefault();
    if (!selectedCategory) return;
    const draftName = categoryEditForm.name.trim();
    const draftDescription = categoryEditForm.description.trim();
    const draftIcon = normalizeIconForPayload(categoryEditForm.icon);
    const currentIcon = normalizeIconForPayload(selectedCategory.icon || "");

    const payload = {};
    if (draftName && draftName !== selectedCategory.name) {
      payload.name = draftName;
    }
    if (draftDescription !== (selectedCategory.description || "")) {
      payload.description = draftDescription ? draftDescription : null;
    }
    if (draftIcon !== currentIcon) {
      payload.icon = draftIcon;
    }
    if (Object.keys(payload).length === 0) {
      setFeedback({ type: "info", message: "Nothing to update." });
      return;
    }
    updateCategoryMutation.mutate({ categoryId: selectedCategory.id, payload });
  };

  const handleDeleteCategory = (categoryId, name) => {
    if (!window.confirm(`Delete category "${name}"? This cannot be undone.`)) {
      return;
    }
    deleteCategoryMutation.mutate(categoryId);
  };

  const handleAddComponent = (event) => {
    event.preventDefault();
    if (!selectedCategory) return;
    if (!componentForm.taskId) {
      setFeedback({ type: "warning", message: "Select a task." });
      return;
    }
    const weightValue = Number(componentForm.weight);
    if (!Number.isFinite(weightValue)) {
      setFeedback({ type: "warning", message: "Weight must be a number." });
      return;
    }
    const payload = {
      task_id: Number(componentForm.taskId),
      metric: componentForm.metric,
      weight: weightValue,
    };
    if (componentForm.position.trim()) {
      const posValue = Number(componentForm.position);
      if (!Number.isFinite(posValue) || posValue < 0) {
        setFeedback({ type: "warning", message: "Position must be a non-negative number." });
        return;
      }
      payload.position = posValue;
    }
    createComponentMutation.mutate({ categoryId: selectedCategory.id, payload });
  };

  const handleComponentDraftChange = (componentId, key, value) => {
    setComponentDrafts((prev) => ({
      ...prev,
      [componentId]: {
        ...prev[componentId],
        [key]: value,
      },
    }));
  };

  const handleUpdateComponent = (componentId) => {
    if (!selectedCategory) return;
    const draft = componentDrafts[componentId];
    const original = selectedCategory.components.find((component) => component.id === componentId);
    if (!draft || !original) {
      setFeedback({ type: "danger", message: "Component not found." });
      return;
    }

    const payload = {};
    if (draft.taskId && Number(draft.taskId) !== original.task_id) {
      payload.task_id = Number(draft.taskId);
    }
    if (draft.metric && draft.metric !== original.metric) {
      payload.metric = draft.metric;
    }
    if (draft.weight !== undefined && draft.weight !== null) {
      const weightValue = Number(draft.weight);
      if (!Number.isFinite(weightValue)) {
        setFeedback({ type: "warning", message: "Weight must be a number." });
        return;
      }
      if (weightValue !== original.weight) {
        payload.weight = weightValue;
      }
    }
    if (draft.position !== undefined && draft.position !== null) {
      if (draft.position === "") {
        // no update if empty string
      } else {
        const posValue = Number(draft.position);
        if (!Number.isFinite(posValue) || posValue < 0) {
          setFeedback({ type: "warning", message: "Position must be a non-negative number." });
          return;
        }
        if (posValue !== original.position) {
          payload.position = posValue;
        }
      }
    }

    if (Object.keys(payload).length === 0) {
      setFeedback({ type: "info", message: "Nothing to update." });
      return;
    }

    updateComponentMutation.mutate({ componentId, payload });
  };

  const handleDeleteComponent = (componentId) => {
    if (!window.confirm("Remove this component?")) {
      return;
    }
    deleteComponentMutation.mutate(componentId);
  };

  if (!isAdmin) {
    return <div className="alert alert-danger">You do not have access to manage statistics.</div>;
  }

  const isWorking =
    createCategoryMutation.isLoading ||
    updateCategoryMutation.isLoading ||
    deleteCategoryMutation.isLoading ||
    createComponentMutation.isLoading ||
    updateComponentMutation.isLoading ||
    deleteComponentMutation.isLoading;

  const renderIconPreview = (icon, size = 40) => {
    if (!icon) return null;
    if (isImageDataUrl(icon)) {
      return (
        <img
          src={icon}
          alt=""
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            borderRadius: "0.5rem",
            border: "1px solid rgba(15, 23, 42, 0.1)",
            backgroundColor: "#ffffff",
          }}
        />
      );
    }
    return (
      <span style={{ fontSize: `${Math.max(size * 0.6, 18)}px`, lineHeight: 1 }}>{icon}</span>
    );
  };

  const handleIconFileSelection = async (file, apply) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFeedback({
        type: "danger",
        message: "Icon must be an image file (PNG, JPG, SVG, GIF, WEBP).",
      });
      return;
    }
    if (file.size > MAX_ICON_BYTES) {
      setFeedback({
        type: "danger",
        message: `Icon is too large. Maximum size is ${Math.round(MAX_ICON_BYTES / 1024)} KB.`,
      });
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      apply(dataUrl, file.name);
    } catch (error) {
      setFeedback({
        type: "danger",
        message: error?.message || "Failed to read icon file.",
      });
    }
  };

  const handleCreateIconUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await handleIconFileSelection(file, (dataUrl, filename) => {
      setCreateForm((prev) => ({
        ...prev,
        icon: dataUrl,
        iconFilename: filename,
      }));
    });
  };

  const handleEditIconUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    await handleIconFileSelection(file, (dataUrl, filename) => {
      setCategoryEditForm((prev) => ({
        ...prev,
        icon: dataUrl,
        iconFilename: filename,
      }));
    });
  };

  return (
    <div className="container px-0">
      {feedback && (
        <div className={`alert alert-${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <div className="row g-4">
        <div className="col-12 col-xl-4">
          <div className="card shadow-sm h-100">
            <div className="card-header">Create category</div>
            <div className="card-body">
              <form className="row g-3" onSubmit={handleCreateCategory}>
                <div className="col-12">
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
                <div className="col-12">
                  <label className="form-label">Description</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={createForm.description}
                    onChange={(event) =>
                      setCreateForm((prev) => ({ ...prev, description: event.target.value }))
                    }
                  ></textarea>
                </div>
                <div className="col-12">
                  <label className="form-label">Icon</label>
                  <div className="d-flex flex-column gap-2">
                    <div className="d-flex flex-wrap gap-2">
                      <input
                        className="form-control"
                        value={createForm.icon}
                        onChange={(event) =>
                          setCreateForm((prev) => ({
                            ...prev,
                            icon: event.target.value,
                            iconFilename: "",
                          }))
                        }
                        placeholder="🔥 or paste data URL"
                      />
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() => createIconInputRef.current?.click()}
                      >
                        Upload file
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() =>
                          setCreateForm((prev) => ({
                            ...prev,
                            icon: "",
                            iconFilename: "",
                          }))
                        }
                        disabled={!createForm.icon}
                      >
                        Clear
                      </button>
                    </div>
                    <input
                      ref={createIconInputRef}
                      type="file"
                      accept={ICON_FILE_ACCEPT}
                      className="d-none"
                      onChange={handleCreateIconUpload}
                    />
                    {createForm.icon ? (
                      <div className="d-flex align-items-center gap-2">
                        {renderIconPreview(createForm.icon, 40)}
                        <span className="text-muted small">
                          {isImageDataUrl(createForm.icon)
                            ? createForm.iconFilename || "Uploaded image"
                            : "Text or emoji icon"}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted small">
                        PNG, JPG, SVG, GIF or WEBP up to 150 KB. You can also use an emoji.
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-12 d-grid">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={createCategoryMutation.isLoading}
                  >
                    Create category
                  </button>
                </div>
              </form>
              <hr />
              <div>
                <h6>Categories</h6>
                {categoriesLoading ? (
                  <div className="text-muted">Loading…</div>
                ) : categories.length === 0 ? (
                  <p className="text-muted mb-0">No categories yet.</p>
                ) : (
                  <div className="list-group">
                    {categories.map((category) => {
                      const iconPreview = renderIconPreview(category.icon, 28);
                      return (
                        <button
                          key={category.id}
                          type="button"
                          className={`list-group-item list-group-item-action ${
                            category.id === selectedCategoryId ? "active" : ""
                          }`}
                          onClick={() => setSelectedCategoryId(category.id)}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <span className="d-inline-flex align-items-center gap-2">
                              {iconPreview ? (
                                <span className="d-inline-flex align-items-center">{iconPreview}</span>
                              ) : null}
                              <span>{category.name}</span>
                            </span>
                            <span className="badge bg-light text-dark">
                              {category.components.length}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-8">
          {!selectedCategory ? (
            <div className="card shadow-sm h-100">
              <div className="card-body text-muted">Select a category to manage.</div>
            </div>
          ) : (
            <div className="card shadow-sm h-100">
              <div className="card-header d-flex justify-content-between align-items-center">
                <span>Category detail</span>
                <button
                  type="button"
                  className="btn btn-outline-danger btn-sm"
                  onClick={() => handleDeleteCategory(selectedCategory.id, selectedCategory.name)}
                  disabled={deleteCategoryMutation.isLoading}
                >
                  Delete
                </button>
              </div>
              <div className="card-body">
                <form className="row g-3" onSubmit={handleUpdateCategory}>
                  <div className="col-12 col-md-6">
                    <label className="form-label">Name</label>
                    <input
                      className="form-control"
                      value={categoryEditForm.name}
                      onChange={(event) =>
                        setCategoryEditForm((prev) => ({
                          ...prev,
                          name: event.target.value,
                        }))
                      }
                      required
                    />
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label">Component count</label>
                    <input
                      className="form-control"
                      value={selectedCategory.components.length}
                      disabled
                    />
                  </div>
                  <div className="col-12">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-control"
                      rows={3}
                      value={categoryEditForm.description}
                      onChange={(event) =>
                        setCategoryEditForm((prev) => ({
                          ...prev,
                          description: event.target.value,
                        }))
                      }
                    ></textarea>
                  </div>
                  <div className="col-12 col-md-6">
                    <label className="form-label">Icon</label>
                    <div className="d-flex flex-column gap-2">
                      <div className="d-flex flex-wrap gap-2">
                        <input
                          className="form-control"
                          value={categoryEditForm.icon}
                          onChange={(event) =>
                            setCategoryEditForm((prev) => ({
                              ...prev,
                              icon: event.target.value,
                              iconFilename: "",
                            }))
                          }
                          placeholder="🔥 or paste data URL"
                        />
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => editIconInputRef.current?.click()}
                        >
                          Upload file
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() =>
                            setCategoryEditForm((prev) => ({
                              ...prev,
                              icon: "",
                              iconFilename: "",
                            }))
                          }
                          disabled={!categoryEditForm.icon}
                        >
                          Clear
                        </button>
                      </div>
                      <input
                        ref={editIconInputRef}
                        type="file"
                        accept={ICON_FILE_ACCEPT}
                        className="d-none"
                        onChange={handleEditIconUpload}
                      />
                      {categoryEditForm.icon ? (
                        <div className="d-flex align-items-center gap-2">
                          {renderIconPreview(categoryEditForm.icon, 40)}
                          <span className="text-muted small">
                            {isImageDataUrl(categoryEditForm.icon)
                              ? categoryEditForm.iconFilename || "Uploaded image (save to apply)"
                              : "Text or emoji icon"}
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted small">
                          Leave empty to remove the icon. Changes apply after saving.
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="col-12 d-flex justify-content-end gap-2">
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updateCategoryMutation.isLoading}
                    >
                      Save changes
                    </button>
                  </div>
                </form>
                <hr />
                <div>
                  <h6>Components</h6>
                  {selectedCategory.components.length === 0 ? (
                    <p className="text-muted">No components yet. Add at least one task below.</p>
                  ) : (
                    <div className="table-responsive">
                      <table className="table table-sm align-middle">
                        <thead className="table-light">
                          <tr>
                            <th>Task</th>
                            <th>Metric</th>
                            <th>Weight</th>
                            <th>Position</th>
                            <th className="text-end">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedCategory.components
                            .slice()
                            .sort((a, b) => a.position - b.position || a.id - b.id)
                            .map((component) => {
                              const draft = componentDrafts[component.id] || {
                                taskId: String(component.task_id),
                                metric: component.metric,
                                weight: String(component.weight),
                                position: component.position !== null ? String(component.position) : "",
                              };
                              return (
                                <tr key={component.id}>
                                  <td style={{ minWidth: "180px" }}>
                                    <select
                                      className="form-select form-select-sm"
                                      value={draft.taskId}
                                      onChange={(event) =>
                                        handleComponentDraftChange(component.id, "taskId", event.target.value)
                                      }
                                    >
                                      {tasksOptions.map((taskOption) => (
                                        <option key={taskOption.value} value={taskOption.value}>
                                          {taskOption.label}
                                        </option>
                                      ))}
                                    </select>
                                  </td>
                                  <td>
                                    <select
                                      className="form-select form-select-sm"
                                      value={draft.metric}
                                      onChange={(event) =>
                                        handleComponentDraftChange(component.id, "metric", event.target.value)
                                      }
                                    >
                                      <option value="points">Points</option>
                                      <option value="completions">Completions</option>
                                    </select>
                                  </td>
                                  <td style={{ width: "100px" }}>
                                    <input
                                      className="form-control form-control-sm"
                                      type="number"
                                      step="0.1"
                                      value={draft.weight}
                                      onChange={(event) =>
                                        handleComponentDraftChange(component.id, "weight", event.target.value)
                                      }
                                    />
                                  </td>
                                  <td style={{ width: "90px" }}>
                                    <input
                                      className="form-control form-control-sm"
                                      type="number"
                                      min="0"
                                      value={draft.position}
                                      onChange={(event) =>
                                        handleComponentDraftChange(component.id, "position", event.target.value)
                                      }
                                    />
                                  </td>
                                  <td className="text-end">
                                    <div className="btn-group btn-group-sm" role="group">
                                      <button
                                        type="button"
                                        className="btn btn-outline-primary"
                                        onClick={() => handleUpdateComponent(component.id)}
                                        disabled={updateComponentMutation.isLoading}
                                      >
                                        Update
                                      </button>
                                      <button
                                        type="button"
                                        className="btn btn-outline-danger"
                                        onClick={() => handleDeleteComponent(component.id)}
                                        disabled={deleteComponentMutation.isLoading}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                <hr />
                <div>
                  <h6>Add component</h6>
                  <form className="row g-3" onSubmit={handleAddComponent}>
                    <div className="col-12 col-md-6">
                      <label className="form-label">Task</label>
                      <select
                        className="form-select"
                        value={componentForm.taskId}
                        onChange={(event) =>
                          setComponentForm((prev) => ({ ...prev, taskId: event.target.value }))
                        }
                        required
                      >
                        <option value="" disabled>
                          Select task
                        </option>
                        {tasksOptions.map((taskOption) => (
                          <option key={taskOption.value} value={taskOption.value}>
                            {taskOption.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label">Metric</label>
                      <select
                        className="form-select"
                        value={componentForm.metric}
                        onChange={(event) =>
                          setComponentForm((prev) => ({ ...prev, metric: event.target.value }))
                        }
                      >
                        <option value="points">Points</option>
                        <option value="completions">Completions</option>
                      </select>
                    </div>
                    <div className="col-6 col-md-3">
                      <label className="form-label">Weight</label>
                      <input
                        className="form-control"
                        type="number"
                        step="0.1"
                        value={componentForm.weight}
                        onChange={(event) =>
                          setComponentForm((prev) => ({ ...prev, weight: event.target.value }))
                        }
                        required
                      />
                    </div>
                    <div className="col-12 col-md-3">
                      <label className="form-label">Position</label>
                      <input
                        className="form-control"
                        type="number"
                        min="0"
                        value={componentForm.position}
                        onChange={(event) =>
                          setComponentForm((prev) => ({ ...prev, position: event.target.value }))
                        }
                        placeholder="Auto"
                      />
                    </div>
                    <div className="col-12 d-flex justify-content-end gap-2">
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={() =>
                          setComponentForm({
                            ...emptyComponentForm,
                            taskId: tasksOptions.length > 0 ? tasksOptions[0].value : "",
                          })
                        }
                        disabled={isWorking}
                      >
                        Clear
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={isWorking}>
                        Add component
                      </button>
                    </div>
                  </form>
                  <p className="text-muted small mt-3 mb-0">
                    Define heuristics by combining task metrics. Positive weights add points, negative weights subtract.
                    If only one task is used, choose between points or completions via the metric selector.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
