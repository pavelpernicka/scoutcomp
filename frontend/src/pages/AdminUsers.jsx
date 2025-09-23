import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

const emptyCreateForm = {
  username: "",
  email: "",
  password: "",
  preferredLanguage: "cs",
  role: "member",
  teamId: "",
  managedTeamIds: [],
};

const emptyEditForm = {
  username: "",
  email: "",
  preferredLanguage: "cs",
  teamId: "",
  role: "member",
  isActive: true,
  managedTeamIds: [],
  password: "",
};

const emptyCompletionForm = {
  taskId: "",
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

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const { isAdmin, canManageUsers, managedTeamIds, userId } = useAuth();

  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [messageText, setMessageText] = useState("");
  const [completionDrafts, setCompletionDrafts] = useState({});
  const [completionError, setCompletionError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [completionTaskFilter, setCompletionTaskFilter] = useState("all");
  const [completionFrom, setCompletionFrom] = useState("");
  const [completionTo, setCompletionTo] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateCompletionModal, setShowCreateCompletionModal] = useState(false);
  const [newCompletionForm, setNewCompletionForm] = useState(emptyCompletionForm);
  const [completionCreateError, setCompletionCreateError] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const anyModalOpen = showCreateModal || showCreateCompletionModal;
    if (anyModalOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [showCreateModal, showCreateCompletionModal]);

  const { data: teams = [] } = useQuery({
    queryKey: ["admin", "teams", "for-users"],
    queryFn: async () => {
      const { data } = await api.get("/teams");
      return data;
    },
    enabled: canManageUsers,
    staleTime: 30_000,
  });

  const { data: activeTasks = [], isLoading: tasksLoading } = useQuery({
    queryKey: ["admin", "tasks", "for-completions"],
    queryFn: async () => {
      const { data } = await api.get("/tasks", { params: { status: "active" } });
      return data;
    },
    enabled: canManageUsers,
    staleTime: 30_000,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: async () => {
      const { data } = await api.get("/users");
      return data;
    },
    enabled: canManageUsers,
    staleTime: 30_000,
  });

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId) || null,
    [users, selectedUserId]
  );

  useEffect(() => {
    if (!selectedUserId && users.length > 0) {
      setSelectedUserId(users[0].id);
    }
  }, [selectedUserId, users]);

  useEffect(() => {
    setCompletionTaskFilter("all");
    setCompletionFrom("");
    setCompletionTo("");
    setCompletionError(null);
    setMessageText("");
  }, [selectedUserId]);

  useEffect(() => {
    if (!selectedUser) {
      setEditForm(emptyEditForm);
      setCompletionDrafts({});
      return;
    }
    setEditForm({
      username: selectedUser.username,
      email: selectedUser.email,
      preferredLanguage: selectedUser.preferred_language,
      teamId: selectedUser.team_id ? String(selectedUser.team_id) : "",
      role: selectedUser.role,
      isActive: selectedUser.is_active,
      managedTeamIds: selectedUser.managed_team_ids.map((id) => String(id)),
      password: "",
    });
  }, [selectedUser]);

  const availableTeamsForSelect = useMemo(() => {
    if (isAdmin) return teams;
    return teams.filter((team) => managedTeamIds.includes(team.id));
  }, [isAdmin, managedTeamIds, teams]);

  const assignableTasks = useMemo(() => {
    if (!selectedUser) return [];
    const userTeamId = selectedUser.team_id;
    const allowedTasks = activeTasks.filter((task) => {
      if (!task) return false;
      if (task.team_id == null) {
        return true;
      }
      if (isAdmin) {
        return userTeamId != null && task.team_id === userTeamId;
      }
      return managedTeamIds.includes(task.team_id) && userTeamId === task.team_id;
    });
    return allowedTasks
      .map((task) => ({ value: String(task.id), label: task.name, task }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [activeTasks, isAdmin, managedTeamIds, selectedUser]);

  useEffect(() => {
    if (!selectedUser) {
      setNewCompletionForm(emptyCompletionForm);
      return;
    }
    setNewCompletionForm((prev) => {
      const defaultTaskId = assignableTasks[0]?.value || "";
      const nextTaskId = assignableTasks.some((task) => task.value === prev.taskId)
        ? prev.taskId
        : defaultTaskId;
      return {
        ...prev,
        taskId: nextTaskId,
      };
    });
  }, [assignableTasks, selectedUser]);

  const { data: userCompletions = [], isFetching: completionsLoading } = useQuery({
    queryKey: ["admin", "user-completions", selectedUserId],
    queryFn: async () => {
      if (!selectedUserId) return [];
      const { data } = await api.get(`/completions/users/${selectedUserId}`);
      return data;
    },
    enabled: Boolean(selectedUserId && canManageUsers),
  });

  useEffect(() => {
    if (!userCompletions.length) {
      setCompletionDrafts({});
      return;
    }
    setCompletionDrafts(
      userCompletions.reduce((acc, item) => {
        acc[item.id] = String(item.count);
        return acc;
      }, {})
    );
  }, [userCompletions]);

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        username: createForm.username.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        preferred_language: createForm.preferredLanguage || "cs",
        role: createForm.role,
        team_id: createForm.teamId ? Number(createForm.teamId) : null,
      };
      if (createForm.role === "group_admin") {
        payload.managed_team_ids = createForm.managedTeamIds.map((id) => Number(id));
      }
      return api.post("/users", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setCreateForm(emptyCreateForm);
      setFeedback({ type: "success", message: "User created successfully." });
      setShowCreateModal(false);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, "Failed to create user."),
      });
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (payload) => api.patch(`/users/${selectedUserId}`, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      if (selectedUserId) {
        queryClient.invalidateQueries({
          queryKey: ["admin", "user-completions", selectedUserId],
        });
      }
      setEditForm((prev) => ({ ...prev, password: "" }));
      setFeedback({ type: "success", message: "User updated." });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, "Failed to update user."),
      });
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => api.delete(`/users/${userId}`),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      if (selectedUserId === deletedId) {
        setSelectedUserId(null);
      }
      setFeedback({ type: "success", message: "User deleted." });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, "Failed to delete user."),
      });
    },
  });

  const updateCompletionMutation = useMutation({
    mutationFn: async ({ completionId, payload }) =>
      api.patch(`/completions/users/${selectedUserId}/${completionId}`, payload),
    onSuccess: () => {
      if (selectedUserId) {
        queryClient.invalidateQueries({
          queryKey: ["admin", "user-completions", selectedUserId],
        });
      }
      setCompletionError(null);
      setFeedback({ type: "success", message: "Completion updated." });
    },
    onError: (error) => {
      setCompletionError(getErrorMessage(error, "Unable to update completion."));
    },
  });

  const deleteCompletionMutation = useMutation({
    mutationFn: async (completionId) =>
      api.delete(`/completions/users/${selectedUserId}/${completionId}`),
    onSuccess: () => {
      if (selectedUserId) {
        queryClient.invalidateQueries({
          queryKey: ["admin", "user-completions", selectedUserId],
        });
      }
      setCompletionError(null);
      setFeedback({ type: "success", message: "Completion removed." });
    },
    onError: (error) => {
      setCompletionError(getErrorMessage(error, "Unable to delete completion."));
    },
  });

  const createCompletionMutation = useMutation({
    mutationFn: async (payload) => api.post(`/completions/users/${selectedUserId}`, payload),
    onMutate: () => {
      setCompletionCreateError(null);
    },
    onSuccess: () => {
      if (selectedUserId) {
        queryClient.invalidateQueries({
          queryKey: ["admin", "user-completions", selectedUserId],
        });
      }
      setShowCreateCompletionModal(false);
      setNewCompletionForm(emptyCompletionForm);
      setFeedback({ type: "success", message: "Completion recorded." });
    },
    onError: (error) => {
      setCompletionCreateError(getErrorMessage(error, "Unable to create completion."));
    },
  });

  const openCreateModal = () => {
    createUserMutation.reset();
    setCreateForm(emptyCreateForm);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    createUserMutation.reset();
    setShowCreateModal(false);
    setCreateForm(emptyCreateForm);
  };

  const openCreateCompletionModal = () => {
    setCompletionCreateError(null);
    setNewCompletionForm({
      ...emptyCompletionForm,
      taskId: assignableTasks[0]?.value || "",
    });
    setShowCreateCompletionModal(true);
  };

  const closeCreateCompletionModal = () => {
    setShowCreateCompletionModal(false);
    setCompletionCreateError(null);
    setNewCompletionForm(emptyCompletionForm);
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (message) => api.post(`/notifications/users/${selectedUserId}`, { message }),
    onSuccess: () => {
      setMessageText("");
      setFeedback({ type: "success", message: "Message sent." });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, "Failed to send message."),
      });
    },
  });

  const handleCreateUser = (event) => {
    event.preventDefault();
    createUserMutation.mutate();
  };

  const handleEditUser = (event) => {
    event.preventDefault();
    if (!selectedUser) return;
    const payload = {};

    if (isAdmin) {
      if (editForm.username.trim() !== selectedUser.username) {
        payload.username = editForm.username.trim();
      }
      if (editForm.email.trim() !== selectedUser.email) {
        payload.email = editForm.email.trim();
      }
      if (editForm.role !== selectedUser.role) {
        payload.role = editForm.role;
      }
      if (editForm.isActive !== selectedUser.is_active) {
        payload.is_active = editForm.isActive;
      }
    }

    if (editForm.preferredLanguage !== selectedUser.preferred_language) {
      payload.preferred_language = editForm.preferredLanguage || "cs";
    }

    if (editForm.teamId !== (selectedUser.team_id ? String(selectedUser.team_id) : "")) {
      payload.team_id = editForm.teamId ? Number(editForm.teamId) : null;
    }

    if (isAdmin && selectedUser.role === "group_admin") {
      const currentManaged = selectedUser.managed_team_ids.map(String).sort().join(",");
      const nextManaged = [...editForm.managedTeamIds].sort().join(",");
      if (currentManaged !== nextManaged) {
        payload.managed_team_ids = editForm.managedTeamIds.map((id) => Number(id));
      }
    }

    if (editForm.password.trim()) {
      payload.password = editForm.password.trim();
    }

    if (Object.keys(payload).length === 0) {
      setFeedback({ type: "info", message: "Nothing to update." });
      return;
    }

    updateUserMutation.mutate(payload);
  };

  const handleDeleteUser = (userIdToDelete) => {
    if (userIdToDelete === userId) {
      setFeedback({ type: "warning", message: "You cannot delete your own account." });
      return;
    }
    if (!window.confirm("Delete this user? This cannot be undone.")) {
      return;
    }
    deleteUserMutation.mutate(userIdToDelete);
  };

  const handleCompletionSave = (completionId) => {
    const countValue = completionDrafts[completionId];
    if (!selectedUserId || !countValue) return;
    const parsed = Number(countValue);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
      setCompletionError("Count must be between 1 and 50.");
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
    if (!window.confirm("Remove this completion record?")) {
      return;
    }
    deleteCompletionMutation.mutate(completionId);
  };

  const handleCreateCompletion = (event) => {
    event.preventDefault();
    if (!selectedUserId) {
      setCompletionCreateError("Select a user first.");
      return;
    }
    if (!newCompletionForm.taskId) {
      setCompletionCreateError("Select a task.");
      return;
    }
    const countValue = Number(newCompletionForm.count);
    if (!Number.isFinite(countValue) || countValue < 1 || countValue > 50) {
      setCompletionCreateError("Count must be between 1 and 50.");
      return;
    }

    const payload = {
      task_id: Number(newCompletionForm.taskId),
      count: countValue,
      status: newCompletionForm.status,
      member_note: newCompletionForm.memberNote.trim() || null,
      admin_note: newCompletionForm.adminNote.trim() || null,
    };

    createCompletionMutation.mutate(payload);
  };

  const handleSendMessage = (event) => {
    event.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed) {
      setFeedback({ type: "warning", message: "Message cannot be empty." });
      return;
    }
    sendMessageMutation.mutate(trimmed);
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
      const submitted = new Date(item.submitted_at);
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

  const teamOptions = availableTeamsForSelect.map((team) => ({
    value: String(team.id),
    label: team.name,
  }));

  const teamNameById = useMemo(() => {
    const map = new Map();
    teams.forEach((team) => map.set(team.id, team.name));
    return map;
  }, [teams]);

  if (!canManageUsers) {
    return <div className="alert alert-danger">You do not have access to manage users.</div>;
  }

  return (
    <div className="container px-0">
      {feedback && (
        <div className={`alert alert-${feedback.type}`} role="alert">
          {feedback.message}
        </div>
      )}

      <div className="row g-4">
        <div className="col-12">
          <div className="card shadow-sm mb-4">
            <div className="card-header d-flex justify-content-between align-items-center">
              <span>Users</span>
              {isAdmin && (
                <button type="button" className="btn btn-primary btn-sm" onClick={openCreateModal}>
                  Add user
                </button>
              )}
            </div>
            <div className="card-body p-0">
              {usersLoading ? (
                <div className="text-center text-muted py-3">Loading…</div>
              ) : users.length === 0 ? (
                <p className="text-muted px-3 py-2 mb-0">No users yet.</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover table-sm align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Username</th>
                        <th>Email</th>
                        <th>Role</th>
                        <th>Team</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className={user.id === selectedUserId ? "table-primary" : ""}>
                          <td>{user.username}</td>
                          <td>{user.email}</td>
                          <td className="text-capitalize">{user.role.replace("_", " ")}</td>
                          <td>
                            {user.team_id
                              ? teamNameById.get(user.team_id) || "—"
                              : "—"}
                          </td>
                          <td className="text-end">
                            <button
                              type="button"
                              className="btn btn-outline-primary btn-sm"
                              onClick={() => setSelectedUserId(user.id)}
                            >
                              Manage
                            </button>
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

        {selectedUser && (
          <div className="col-12 col-xl-6">
            <div className="card shadow-sm mb-4">
              <div className="card-header">Edit user – {selectedUser.username}</div>
              <div className="card-body">
                <form className="row g-3" onSubmit={handleEditUser}>
                  {isAdmin && (
                    <>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Username</label>
                        <input
                          className="form-control"
                          value={editForm.username}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, username: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Email</label>
                        <input
                          className="form-control"
                          type="email"
                          value={editForm.email}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                          required
                        />
                      </div>
                    </>
                  )}

                  <div className="col-12 col-md-6">
                    <label className="form-label">Preferred language</label>
                    <select
                      className="form-select"
                      value={editForm.preferredLanguage}
                      onChange={(event) =>
                        setEditForm((prev) => ({
                          ...prev,
                          preferredLanguage: event.target.value,
                        }))
                      }
                    >
                      <option value="cs">Čeština</option>
                      <option value="en">English</option>
                    </select>
                  </div>

                  <div className="col-12 col-md-6">
                    <label className="form-label">Team</label>
                    <select
                      className="form-select"
                      value={editForm.teamId}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, teamId: event.target.value }))
                      }
                    >
                      <option value="">No team</option>
                      {teamOptions.map((team) => (
                        <option key={team.value} value={team.value}>
                          {team.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {isAdmin && (
                    <>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Role</label>
                        <select
                          className="form-select"
                          value={editForm.role}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, role: event.target.value }))
                          }
                        >
                          <option value="member">Member</option>
                          <option value="group_admin">Group admin</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="col-12 col-md-6 d-flex align-items-center">
                        <div className="form-check mt-4">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            id="edit-user-active"
                            checked={editForm.isActive}
                            onChange={(event) =>
                              setEditForm((prev) => ({ ...prev, isActive: event.target.checked }))
                            }
                          />
                          <label className="form-check-label" htmlFor="edit-user-active">
                            Active
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  {isAdmin && editForm.role === "group_admin" && (
                    <div className="col-12">
                      <label className="form-label">Managed teams</label>
                      <select
                        className="form-select"
                        multiple
                        value={editForm.managedTeamIds}
                        onChange={(event) => {
                          const selected = Array.from(event.target.selectedOptions).map(
                            (option) => option.value
                          );
                          setEditForm((prev) => ({
                            ...prev,
                            managedTeamIds: selected,
                          }));
                        }}
                      >
                        {teams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div className="col-12">
                    <label className="form-label">Reset password</label>
                    <input
                      className="form-control"
                      type="password"
                      value={editForm.password}
                      placeholder="Leave blank to keep current password"
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, password: event.target.value }))
                      }
                    />
                  </div>

                  {updateUserMutation.isError && (
                    <div className="col-12">
                      <div className="alert alert-danger" role="alert">
                        {getErrorMessage(updateUserMutation.error, "Failed to update user.")}
                      </div>
                    </div>
                  )}

                  <div className="col-12 d-flex justify-content-between gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={() => setEditForm((prev) => ({ ...prev, password: "" }))}
                    >
                      Clear password
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updateUserMutation.isLoading}
                    >
                      Save changes
                    </button>
                  </div>
                </form>

                {(isAdmin || managedTeamIds.length > 0) && (
                  <>
                    <hr />
                    <form className="row g-3" onSubmit={handleSendMessage}>
                      <div className="col-12">
                        <label className="form-label">Send message</label>
                        <textarea
                          className="form-control"
                          rows={2}
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          placeholder="Write a short message to this user"
                        ></textarea>
                      </div>
                      <div className="col-12 d-flex justify-content-end gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => setMessageText("")}
                          disabled={sendMessageMutation.isLoading}
                        >
                          Clear
                        </button>
                        <button
                          type="submit"
                          className="btn btn-outline-primary"
                          disabled={sendMessageMutation.isLoading}
                        >
                          Send
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </div>
              {isAdmin && (
                <div className="card-footer d-flex justify-content-between align-items-center">
                  <span className="text-muted small">
                    {selectedUser.id === userId
                      ? "You cannot delete your own account."
                      : "Deleting a user cannot be undone."}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    disabled={deleteUserMutation.isLoading || selectedUser.id === userId}
                  >
                    Delete user
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedUser && (
          <div className="col-12 col-xl-6">
            <div className="card shadow-sm">
              <div className="card-header d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <span>Completion history</span>
                  <span className="badge bg-secondary">{filteredCompletions.length}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={openCreateCompletionModal}
                  disabled={!assignableTasks.length || tasksLoading}
                >
                  Add completion
                </button>
              </div>
              <div className="card-body p-0">
                {completionError && (
                  <div className="alert alert-danger rounded-0 mb-0" role="alert">
                    {completionError}
                  </div>
                )}
                <div className="p-3 border-bottom d-flex flex-wrap gap-3 align-items-end">
                  <div>
                    <label className="form-label mb-1">Task</label>
                    <select
                      className="form-select form-select-sm"
                      value={completionTaskFilter}
                      onChange={(event) => setCompletionTaskFilter(event.target.value)}
                    >
                      <option value="all">All tasks</option>
                      {availableTasks.map((task) => (
                        <option key={task.value} value={task.value}>
                          {task.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label mb-1">From</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={completionFrom}
                      onChange={(event) => setCompletionFrom(event.target.value)}
                    />
                  </div>
                  <div>
                    <label className="form-label mb-1">To</label>
                    <input
                      type="date"
                      className="form-control form-control-sm"
                      value={completionTo}
                      onChange={(event) => setCompletionTo(event.target.value)}
                    />
                  </div>
                  <div className="ms-auto d-flex gap-2 align-items-center">
                    <div className="text-end">
                      <div className="fw-semibold">Total points</div>
                      <div className="text-primary fs-5">{totalPoints.toFixed(2)}</div>
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm"
                      onClick={handleResetCompletionFilters}
                    >
                      Reset
                    </button>
                  </div>
                </div>
                {pointsByTask.length > 0 && (
                  <div className="p-3 border-bottom">
                    <div className="fw-semibold mb-2">Points by task</div>
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead className="table-light">
                          <tr>
                            <th>Task</th>
                            <th className="text-end">Points</th>
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
                  <div className="text-center text-muted py-3">Loading…</div>
                ) : filteredCompletions.length === 0 ? (
                  <p className="text-muted px-3 py-2 mb-0">No completions recorded.</p>
                ) : (
                  <div className="table-responsive">
                    <table className="table table-sm align-middle mb-0">
                      <thead className="table-light">
                        <tr>
                          <th>Date</th>
                          <th>Task</th>
                          <th>Status</th>
                          <th>Count</th>
                          <th>Admin note</th>
                          <th className="text-end">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredCompletions.map((item) => (
                          <tr key={item.id}>
                            <td>{new Date(item.submitted_at).toLocaleString()}</td>
                            <td>{item.task?.name || `Task #${item.task_id}`}</td>
                            <td>
                              <select
                                className="form-select form-select-sm"
                                value={item.status}
                                onChange={(event) =>
                                  handleCompletionStatusChange(item.id, event.target.value)
                                }
                              >
                                <option value="approved">Approved</option>
                                <option value="rejected">Rejected</option>
                                {item.status === "pending" && (
                                  <option value="pending" disabled>
                                    Pending
                                  </option>
                                )}
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                min="1"
                                max="50"
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
                                Save count
                              </button>
                              <button
                                type="button"
                                className="btn btn-outline-danger btn-sm"
                                onClick={() => handleCompletionDelete(item.id)}
                                disabled={deleteCompletionMutation.isLoading}
                              >
                                Remove
                              </button>
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
        )}
      </div>

      {isAdmin && showCreateModal && (
        <>
          <div
            className="modal fade show d-block"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onClick={closeCreateModal}
          >
            <div className="modal-dialog modal-lg modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">Add user</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeCreateModal}></button>
                </div>
                <form onSubmit={handleCreateUser}>
                  <div className="modal-body">
                    <div className="row g-3">
                      <div className="col-12 col-md-6">
                        <label className="form-label">Username</label>
                        <input
                          className="form-control"
                          value={createForm.username}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, username: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Email</label>
                        <input
                          className="form-control"
                          type="email"
                          value={createForm.email}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Password</label>
                        <input
                          className="form-control"
                          type="password"
                          value={createForm.password}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, password: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Preferred language</label>
                        <select
                          className="form-select"
                          value={createForm.preferredLanguage}
                          onChange={(event) =>
                            setCreateForm((prev) => ({
                              ...prev,
                              preferredLanguage: event.target.value,
                            }))
                          }
                        >
                          <option value="cs">Čeština</option>
                          <option value="en">English</option>
                        </select>
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Role</label>
                        <select
                          className="form-select"
                          value={createForm.role}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, role: event.target.value }))
                          }
                        >
                          <option value="member">Member</option>
                          <option value="group_admin">Group admin</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">Team</label>
                        <select
                          className="form-select"
                          value={createForm.teamId}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, teamId: event.target.value }))
                          }
                        >
                          <option value="">No team</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {createForm.role === "group_admin" && (
                        <div className="col-12">
                          <label className="form-label">Managed teams</label>
                          <select
                            className="form-select"
                            multiple
                            value={createForm.managedTeamIds}
                            onChange={(event) => {
                              const selected = Array.from(event.target.selectedOptions).map(
                                (option) => option.value
                              );
                              setCreateForm((prev) => ({
                                ...prev,
                                managedTeamIds: selected,
                              }));
                            }}
                          >
                            {teams.map((team) => (
                              <option key={team.id} value={team.id}>
                                {team.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                  {createUserMutation.isError && (
                    <div className="col-12">
                      <div className="alert alert-danger" role="alert">
                        {getErrorMessage(createUserMutation.error, "Failed to create user.")}
                      </div>
                    </div>
                  )}
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={closeCreateModal}
                      disabled={createUserMutation.isLoading}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={createUserMutation.isLoading}
                    >
                      Create user
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

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
                  <h5 className="modal-title">Add completion</h5>
                  <button
                    type="button"
                    className="btn-close"
                    aria-label="Close"
                    onClick={closeCreateCompletionModal}
                  ></button>
                </div>
                {tasksLoading ? (
                  <div className="modal-body">
                    <div className="text-center text-muted">Loading tasks…</div>
                  </div>
                ) : assignableTasks.length === 0 ? (
                  <div className="modal-body">
                    <div className="alert alert-warning mb-0" role="alert">
                      No compatible tasks available for this user.
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
                        <label className="form-label">Task</label>
                        <select
                          className="form-select"
                          value={newCompletionForm.taskId}
                          onChange={(event) =>
                            setNewCompletionForm((prev) => ({
                              ...prev,
                              taskId: event.target.value,
                            }))
                          }
                          required
                        >
                          <option value="" disabled>
                            Select task
                          </option>
                          {assignableTasks.map((task) => (
                            <option key={task.value} value={task.value}>
                              {task.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="row g-3">
                        <div className="col-12 col-md-6">
                          <label className="form-label">Count</label>
                          <input
                            className="form-control"
                            type="number"
                            min="1"
                            max="50"
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
                          <label className="form-label">Status</label>
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
                            <option value="approved">Approved</option>
                            <option value="rejected">Rejected</option>
                          </select>
                        </div>
                      </div>
                      <div className="mb-3 mt-3">
                        <label className="form-label">Member note</label>
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
                        <label className="form-label">Admin note</label>
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
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={createCompletionMutation.isLoading}
                      >
                        Add completion
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
    </div>
  );
}
