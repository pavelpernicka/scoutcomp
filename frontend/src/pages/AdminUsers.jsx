import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import { formatDateToLocal } from "../utils/dateUtils";

const emptyCreateForm = {
  username: "",
  realName: "",
  email: "",
  password: "",
  preferredLanguage: "cs",
  role: "member",
  teamId: "",
  managedTeamIds: [],
};

const emptyEditForm = {
  username: "",
  realName: "",
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
  variantId: "",
  count: "1",
  status: "approved",
  memberNote: "",
  adminNote: "",
};

const emptyBulkRegistrationForm = {
  names: "",
  teamId: "",
  role: "member",
  preferredLanguage: "cs",
};

// Helper function to generate username from real name
const generateUsername = (realName) => {
  return realName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .replace(/([^\w]+|\s+)/g, '_')   // Replace space and other characters by hyphen
    .replace(/--+/g, '_')            // Replaces multiple hyphens by one hyphen
    .replace(/(^-+|-+$)/g, '')       // Remove extra hyphens from beginning or end
    .substring(0, 50); // Limit length
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
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { isAdmin, canManageUsers, managedTeamIds, userId } = useAuth();

  const [createForm, setCreateForm] = useState(emptyCreateForm);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [editForm, setEditForm] = useState(emptyEditForm);
  const [messageText, setMessageText] = useState("");
  const [completionDrafts, setCompletionDrafts] = useState({});
  const [completionError, setCompletionError] = useState(null);
  const [feedback, setFeedback] = useState(null);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showCreatePassword, setShowCreatePassword] = useState(false);
  const [editPasswordGenerated, setEditPasswordGenerated] = useState(false);
  const [createPasswordGenerated, setCreatePasswordGenerated] = useState(false);
  const [completionTaskFilter, setCompletionTaskFilter] = useState("all");
  const [completionFrom, setCompletionFrom] = useState("");
  const [completionTo, setCompletionTo] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showCreateCompletionModal, setShowCreateCompletionModal] = useState(false);
  const [newCompletionForm, setNewCompletionForm] = useState(emptyCompletionForm);
  const [completionCreateError, setCompletionCreateError] = useState(null);
  const [showBulkRegistrationModal, setShowBulkRegistrationModal] = useState(false);
  const [bulkForm, setBulkForm] = useState(emptyBulkRegistrationForm);
  const [bulkRegistrationError, setBulkRegistrationError] = useState(null);
  const [previewUsers, setPreviewUsers] = useState([]);

  // Password results modal
  const [showPasswordResultsModal, setShowPasswordResultsModal] = useState(false);
  const [bulkRegistrationResults, setBulkRegistrationResults] = useState(null);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    const anyModalOpen = showCreateModal || showCreateCompletionModal || showBulkRegistrationModal;
    if (anyModalOpen) {
      document.body.classList.add("modal-open");
    } else {
      document.body.classList.remove("modal-open");
    }
    return () => {
      document.body.classList.remove("modal-open");
    };
  }, [showCreateModal, showCreateCompletionModal, showBulkRegistrationModal, showPasswordResultsModal]);

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
      setShowEditPassword(false);
      setEditPasswordGenerated(false);
      return;
    }
    setEditForm({
      username: selectedUser.username,
      realName: selectedUser.real_name || "",
      email: selectedUser.email || "",
      preferredLanguage: selectedUser.preferred_language,
      teamId: selectedUser.team_id ? String(selectedUser.team_id) : "",
      role: selectedUser.role,
      isActive: selectedUser.is_active,
      managedTeamIds: selectedUser.managed_team_ids.map((id) => String(id)),
      password: "",
    });
    setShowEditPassword(false);
    setEditPasswordGenerated(false);
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

  const selectedTaskForCompletion = useMemo(() => {
    if (!newCompletionForm.taskId) return null;
    return assignableTasks.find((task) => task.value === newCompletionForm.taskId)?.task || null;
  }, [assignableTasks, newCompletionForm.taskId]);

  const availableVariants = useMemo(() => {
    if (!selectedTaskForCompletion?.variants) return [];
    return selectedTaskForCompletion.variants.map((variant) => ({
      value: String(variant.id),
      label: `${variant.name} (${variant.points} pts)`,
      variant,
    }));
  }, [selectedTaskForCompletion]);

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
        variantId: "", // Reset variant when task changes or user changes
      };
    });
  }, [assignableTasks, selectedUser]);

  // Reset variant when task changes
  useEffect(() => {
    if (availableVariants.length > 0 && !newCompletionForm.variantId) {
      setNewCompletionForm((prev) => ({
        ...prev,
        variantId: availableVariants[0]?.value || "",
      }));
    } else if (availableVariants.length === 0) {
      setNewCompletionForm((prev) => ({
        ...prev,
        variantId: "",
      }));
    }
  }, [availableVariants, newCompletionForm.variantId]);

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
        real_name: createForm.realName.trim(),
        email: createForm.email.trim() || undefined,
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
      setFeedback({ type: "success", message: t('adminUsers.userCreated') });
      setShowCreateModal(false);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, t('adminUsers.failedToCreateUser')),
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
      setFeedback({ type: "success", message: t('adminUsers.userUpdated') });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, t('adminUsers.failedToUpdateUser')),
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
      setFeedback({ type: "success", message: t('adminUsers.userDeleted') });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, t('adminUsers.failedToDeleteUser')),
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
      setFeedback({ type: "success", message: t('adminUsers.completionUpdated') });
    },
    onError: (error) => {
      setCompletionError(getErrorMessage(error, t('adminUsers.unableToUpdateCompletion')));
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
      setFeedback({ type: "success", message: t('adminUsers.completionRemoved') });
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
      if (selectedUserId) {
        queryClient.invalidateQueries({
          queryKey: ["admin", "user-completions", selectedUserId],
        });
      }
      setShowCreateCompletionModal(false);
      setNewCompletionForm(emptyCompletionForm);
      setFeedback({ type: "success", message: t('adminUsers.completionRecorded') });
    },
    onError: (error) => {
      setCompletionCreateError(getErrorMessage(error, t('adminUsers.unableToCreateCompletion')));
    },
  });

  const bulkRegisterMutation = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post("/users/bulk-register", payload);
      return data;
    },
    onMutate: () => {
      setBulkRegistrationError(null);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      setShowBulkRegistrationModal(false);
      setBulkForm(emptyBulkRegistrationForm);
      setPreviewUsers([]);

      // Show password results if users were created
      if (result.created_users && result.created_users.length > 0) {
        setBulkRegistrationResults(result);
        setShowPasswordResultsModal(true);
      }
      setFeedback({
        type: "success",
        message: t('adminUsers.bulkRegistrationSuccess', { successCount: result.success_count, failedCount: result.failed_count }),
      });
    },
    onError: (error) => {
      setBulkRegistrationError(getErrorMessage(error, t('adminUsers.failedToCreateUsers')));
    },
  });

  const openCreateModal = () => {
    createUserMutation.reset();
    setCreateForm(emptyCreateForm);
    setShowCreatePassword(false);
    setCreatePasswordGenerated(false);
    setShowCreateModal(true);
  };

  const closeCreateModal = () => {
    createUserMutation.reset();
    setShowCreateModal(false);
    setCreateForm(emptyCreateForm);
    setShowCreatePassword(false);
    setCreatePasswordGenerated(false);
  };

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

  const openBulkRegistrationModal = () => {
    setBulkRegistrationError(null);
    setBulkForm(emptyBulkRegistrationForm);
    setPreviewUsers([]);
    setShowBulkRegistrationModal(true);
  };

  const closeBulkRegistrationModal = () => {
    setShowBulkRegistrationModal(false);
    setBulkRegistrationError(null);
    setBulkForm(emptyBulkRegistrationForm);
    setPreviewUsers([]);
  };

  const handleBulkFormChange = (field, value) => {
    setBulkForm((prev) => ({ ...prev, [field]: value }));

    // Update preview when names or related fields change
    if (field === 'names') {
      const names = value.split('\n').filter(name => name.trim());
      setPreviewUsers(
        names.map(name => {
          const trimmed = name.trim();
          return {
            realName: trimmed,
            username: generateUsername(trimmed),
          };
        })
      );
    }
  };

  const sendMessageMutation = useMutation({
    mutationFn: async (message) => api.post(`/notifications/users/${selectedUserId}`, { message }),
    onSuccess: () => {
      setMessageText("");
      setFeedback({ type: "success", message: t('adminUsers.messageSent') });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, t('adminUsers.failedToSendMessage')),
      });
    },
  });

  const generatePasswordMutation = useMutation({
    mutationFn: async (userId) => {
      const { data } = await api.post(`/users/${userId}/generate-password`);
      return data;
    },
    onSuccess: (data) => {
      setEditForm((prev) => ({ ...prev, password: data.password }));
      setShowEditPassword(true);
      setEditPasswordGenerated(true);

      // Auto-hide password and message after 10 seconds
      setTimeout(() => {
        setShowEditPassword(false);
        setEditPasswordGenerated(false);
      }, 10000);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: getErrorMessage(error, t('adminUsers.failedToGeneratePassword')),
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
      if (editForm.email.trim() !== (selectedUser.email || "")) {
        payload.email = editForm.email.trim() || undefined;
      }
      if (editForm.role !== selectedUser.role) {
        payload.role = editForm.role;
      }
      if (editForm.isActive !== selectedUser.is_active) {
        payload.is_active = editForm.isActive;
      }
    }

    if (editForm.realName.trim() !== (selectedUser.real_name || "")) {
      payload.real_name = editForm.realName.trim();
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
      setFeedback({ type: "info", message: t('adminUsers.nothingToUpdate') });
      return;
    }

    updateUserMutation.mutate(payload);
  };

  const handleDeleteUser = (userIdToDelete) => {
    if (userIdToDelete === userId) {
      setFeedback({ type: "warning", message: t('adminUsers.cannotDeleteOwnAccount') });
      return;
    }
    if (!window.confirm(t('adminUsers.confirmDeleteUser'))) {
      return;
    }
    deleteUserMutation.mutate(userIdToDelete);
  };

  const handleCompletionSave = (completionId) => {
    const countValue = completionDrafts[completionId];
    if (!selectedUserId || !countValue) return;
    const parsed = Number(countValue);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 50) {
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
    if (!Number.isFinite(countValue) || countValue < 1 || countValue > 50) {
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

    // Add variant_id if selected and task has variants
    if (newCompletionForm.variantId && selectedTaskForCompletion?.variants?.length > 0) {
      payload.variant_id = Number(newCompletionForm.variantId);
    }

    createCompletionMutation.mutate(payload);
  };

  const handleSendMessage = (event) => {
    event.preventDefault();
    const trimmed = messageText.trim();
    if (!trimmed) {
      setFeedback({ type: "warning", message: t('adminUsers.messageCannotBeEmpty') });
      return;
    }
    sendMessageMutation.mutate(trimmed);
  };

  const handleBulkRegistration = (event) => {
    event.preventDefault();

    const names = bulkForm.names.split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (names.length === 0) {
      setBulkRegistrationError(t('adminUsers.enterAtLeastOneName'));
      return;
    }

    const payload = {
      names,
      team_id: bulkForm.teamId ? Number(bulkForm.teamId) : null,
      role: bulkForm.role,
      preferred_language: bulkForm.preferredLanguage,
    };

    bulkRegisterMutation.mutate(payload);
  };

  const handleGeneratePassword = () => {
    if (!selectedUserId) return;
    generatePasswordMutation.mutate(selectedUserId);
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*';
    let password = '';
    for (let i = 0; i < 12; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  };

  const handleGenerateCreatePassword = () => {
    const newPassword = generateRandomPassword();
    setCreateForm((prev) => ({ ...prev, password: newPassword }));
    setShowCreatePassword(true);
    setCreatePasswordGenerated(true);

    // Auto-hide password and message after 10 seconds
    setTimeout(() => {
      setShowCreatePassword(false);
      setCreatePasswordGenerated(false);
    }, 10000);
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
    return <div className="alert alert-danger">{t('adminUsers.noAccess')}</div>;
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
              <span>{t('adminUsers.users')}</span>
              {isAdmin && (
                <div className="d-flex gap-2">
                  <button type="button" className="btn btn-outline-primary btn-sm" onClick={openBulkRegistrationModal}>
                    {t('adminUsers.bulkRegister.title')}
                  </button>
                  <button type="button" className="btn btn-primary btn-sm" onClick={openCreateModal}>
                    {t('adminUsers.addUser')}
                  </button>
                </div>
              )}
            </div>
            <div className="card-body p-0">
              {usersLoading ? (
                <div className="text-center text-muted py-3">{t('adminUsers.loading')}</div>
              ) : users.length === 0 ? (
                <p className="text-muted px-3 py-2 mb-0">{t('adminUsers.noUsersYet')}</p>
              ) : (
                <div className="table-responsive">
                  <table className="table table-hover table-sm align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>{t('adminUsers.name')}</th>
                        <th>{t('adminUsers.username')}</th>
                        <th>{t('adminUsers.email')}</th>
                        <th>{t('adminUsers.role')}</th>
                        <th>{t('adminUsers.team')}</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className={user.id === selectedUserId ? "table-primary" : ""}>
                          <td>{user.real_name || user.username}</td>
                          <td className="font-monospace text-muted">{user.username}</td>
                          <td>{user.email || "—"}</td>
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
                              {t('adminUsers.manage')}
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
          <div className="col-12 col-xl-4">
            <div className="card shadow-sm mb-4">
              <div className="card-header">{t('adminUsers.editUser', { userName: selectedUser.real_name || selectedUser.username })}</div>
              <div className="card-body">
                <form className="row g-3" onSubmit={handleEditUser}>
                  <div className="col-12 col-md-6">
                    <label className="form-label">{t('adminUsers.realName')}</label>
                    <input
                      className="form-control"
                      value={editForm.realName}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, realName: event.target.value }))
                      }
                      required
                    />
                  </div>
                  {isAdmin && (
                    <>
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.username')}</label>
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
                        <label className="form-label">{t('adminUsers.emailOptional')}</label>
                        <input
                          className="form-control"
                          type="email"
                          value={editForm.email}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                        />
                      </div>
                    </>
                  )}

                  <div className="col-12 col-md-6">
                    <label className="form-label">{t('adminUsers.preferredLanguage')}</label>
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
                    <label className="form-label">{t('adminUsers.team')}</label>
                    <select
                      className="form-select"
                      value={editForm.teamId}
                      onChange={(event) =>
                        setEditForm((prev) => ({ ...prev, teamId: event.target.value }))
                      }
                    >
                      <option value="">{t('adminUsers.noTeam')}</option>
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
                        <label className="form-label">{t('adminUsers.role')}</label>
                        <select
                          className="form-select"
                          value={editForm.role}
                          onChange={(event) =>
                            setEditForm((prev) => ({ ...prev, role: event.target.value }))
                          }
                        >
                          <option value="member">{t('adminUsers.roleMember')}</option>
                          <option value="group_admin">{t('adminUsers.roleGroupAdmin')}</option>
                          <option value="admin">{t('adminUsers.roleAdmin')}</option>
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
                            {t('adminUsers.active')}
                          </label>
                        </div>
                      </div>
                    </>
                  )}

                  {isAdmin && editForm.role === "group_admin" && (
                    <div className="col-12">
                      <label className="form-label">{t('adminUsers.managedTeams')}</label>
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
                    <label className="form-label">{t('adminUsers.resetPassword')}</label>
                    {editPasswordGenerated && (
                      <div className="alert alert-success py-2 mb-2" role="alert">
                        <i className="fas fa-check-circle me-1"></i>
                        Random password generated and revealed. Don&apos;t forget to save changes!
                      </div>
                    )}
                    <div className="input-group">
                      <input
                        className="form-control"
                        type={showEditPassword ? "text" : "password"}
                        value={editForm.password}
                        placeholder={t('adminUsers.changePasswordPlaceholder')}
                        onChange={(event) =>
                          setEditForm((prev) => ({ ...prev, password: event.target.value }))
                        }
                      />
                      {editForm.password && (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => setShowEditPassword(!showEditPassword)}
                          title={showEditPassword ? "Hide password" : "Show password"}
                        >
                          <i className={`fas ${showEditPassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                        </button>
                      )}
                      <button
                        type="button"
                        className="btn btn-outline-secondary"
                        onClick={handleGeneratePassword}
                        disabled={generatePasswordMutation.isLoading}
                        title="Generate random password"
                      >
                        <i className="fas fa-dice me-1"></i>{t('adminUsers.generate')}
                      </button>
                    </div>
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
                      {t('adminUsers.clearPassword')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={updateUserMutation.isLoading}
                    >
                      {t('adminUsers.saveChanges')}
                    </button>
                  </div>
                </form>

                {(isAdmin || managedTeamIds.length > 0) && (
                  <>
                    <hr />
                    <form className="row g-3" onSubmit={handleSendMessage}>
                      <div className="col-12">
                        <label className="form-label">{t('adminUsers.sendMessage')}</label>
                        <textarea
                          className="form-control"
                          rows={2}
                          value={messageText}
                          onChange={(event) => setMessageText(event.target.value)}
                          placeholder={t('adminUsers.sendMessagePlaceholder')}
                        ></textarea>
                      </div>
                      <div className="col-12 d-flex justify-content-end gap-2">
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => setMessageText("")}
                          disabled={sendMessageMutation.isLoading}
                        >
                          {t('adminUsers.clear')}
                        </button>
                        <button
                          type="submit"
                          className="btn btn-outline-primary"
                          disabled={sendMessageMutation.isLoading}
                        >
                          {t('adminUsers.send')}
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
                      ? t('adminUsers.cannotDeleteOwnAccount')
                      : t('adminUsers.deletingUserCannotBeUndone')}
                  </span>
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => handleDeleteUser(selectedUser.id)}
                    disabled={deleteUserMutation.isLoading || selectedUser.id === userId}
                  >
                    {t('adminUsers.deleteUser')}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {selectedUser && (
          <div className="col-12 col-xl-8">
            <div className="card shadow-sm">
              <div className="card-header d-flex justify-content-between align-items-center">
                <div className="d-flex align-items-center gap-2">
                  <span>{t('adminUsers.completionHistory')}</span>
                  <span className="badge bg-secondary">{filteredCompletions.length}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={openCreateCompletionModal}
                  disabled={!assignableTasks.length || tasksLoading}
                >
                  {t('adminUsers.addCompletionBtn')}
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
                        {filteredCompletions.map((item) => (
                          <tr key={item.id}>
                            <td>{formatDateToLocal(item.submitted_at)}</td>
                            <td>{item.task?.name || `Task #${item.task_id}`}</td>
                            <td>
                              {(() => {
                                // First try item.variant (if available)
                                if (item.variant && item.variant.name) {
                                  return (
                                    <span className="badge bg-info text-dark px-2 py-1">
                                      {item.variant.name}
                                    </span>
                                  );
                                }

                                // If no variant but has variant_id, try to find it in the task variants
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
                  <h5 className="modal-title">{t('adminUsers.createUser')}</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeCreateModal}></button>
                </div>
                <form onSubmit={handleCreateUser}>
                  <div className="modal-body">
                    <div className="row g-3">
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.realName')}</label>
                        <input
                          className="form-control"
                          value={createForm.realName}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, realName: event.target.value }))
                          }
                          required
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.username')}</label>
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
                        <label className="form-label">{t('adminUsers.emailOptional')}</label>
                        <input
                          className="form-control"
                          type="email"
                          value={createForm.email}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                        />
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.password')}</label>
                        {createPasswordGenerated && (
                          <div className="alert alert-success py-2 mb-2" role="alert">
                            <i className="fas fa-check-circle me-1"></i>
                            Random password generated and revealed!
                          </div>
                        )}
                        <div className="input-group">
                          <input
                            className="form-control"
                            type={showCreatePassword ? "text" : "password"}
                            value={createForm.password}
                            onChange={(event) =>
                              setCreateForm((prev) => ({ ...prev, password: event.target.value }))
                            }
                            required
                          />
                          {createForm.password && (
                            <button
                              type="button"
                              className="btn btn-outline-secondary"
                              onClick={() => setShowCreatePassword(!showCreatePassword)}
                              title={showCreatePassword ? "Hide password" : "Show password"}
                            >
                              <i className={`fas ${showCreatePassword ? 'fa-eye-slash' : 'fa-eye'}`}></i>
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={handleGenerateCreatePassword}
                            title="Generate random password"
                          >
                            <i className="fas fa-dice"></i>
                          </button>
                        </div>
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.preferredLanguage')}</label>
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
                        <label className="form-label">{t('adminUsers.role')}</label>
                        <select
                          className="form-select"
                          value={createForm.role}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, role: event.target.value }))
                          }
                        >
                          <option value="member">{t('adminUsers.roleMember')}</option>
                          <option value="group_admin">{t('adminUsers.roleGroupAdmin')}</option>
                          <option value="admin">{t('adminUsers.roleAdmin')}</option>
                        </select>
                      </div>
                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.team')}</label>
                        <select
                          className="form-select"
                          value={createForm.teamId}
                          onChange={(event) =>
                            setCreateForm((prev) => ({ ...prev, teamId: event.target.value }))
                          }
                        >
                          <option value="">{t('adminUsers.noTeam')}</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      {createForm.role === "group_admin" && (
                        <div className="col-12">
                          <label className="form-label">{t('adminUsers.managedTeams')}</label>
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
                      {t('common.cancel')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={createUserMutation.isLoading}
                    >
                      {t('common.save')}
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
                              variantId: "", // Reset variant when task changes
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
                      {availableVariants.length > 0 && (
                        <div className="mb-3">
                          <label className="form-label">Task Type</label>
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
                              Select task type
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

      {isAdmin && showBulkRegistrationModal && (
        <>
          <div
            className="modal fade show d-block"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onClick={closeBulkRegistrationModal}
          >
            <div className="modal-dialog modal-lg modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{t('adminUsers.bulkRegister.title')}</h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={closeBulkRegistrationModal}></button>
                </div>
                <form onSubmit={handleBulkRegistration}>
                  <div className="modal-body">
                    {bulkRegistrationError && (
                      <div className="alert alert-danger" role="alert">
                        {bulkRegistrationError}
                      </div>
                    )}
                    <div className="row g-3">
                      <div className="col-12">
                        <label className="form-label">{t('adminUsers.bulkRegister.namesLabel')}</label>
                        <textarea
                          className="form-control"
                          rows={8}
                          value={bulkForm.names}
                          onChange={(event) => handleBulkFormChange('names', event.target.value)}
                          placeholder={t('adminUsers.bulkRegister.namesPlaceholder')}
                          required
                        />
                        <div className="form-text">
                          {t('adminUsers.bulkRegister.namesDescription')}
                        </div>
                      </div>

                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.preferredLanguage')}</label>
                        <select
                          className="form-select"
                          value={bulkForm.preferredLanguage}
                          onChange={(event) => handleBulkFormChange('preferredLanguage', event.target.value)}
                        >
                          <option value="cs">Čeština</option>
                          <option value="en">English</option>
                        </select>
                      </div>

                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.role')}</label>
                        <select
                          className="form-select"
                          value={bulkForm.role}
                          onChange={(event) => handleBulkFormChange('role', event.target.value)}
                        >
                          <option value="member">{t('adminUsers.roleMember')}</option>
                          <option value="group_admin">{t('adminUsers.roleGroupAdmin')}</option>
                          <option value="admin">{t('adminUsers.roleAdmin')}</option>
                        </select>
                      </div>

                      <div className="col-12 col-md-6">
                        <label className="form-label">{t('adminUsers.team')}</label>
                        <select
                          className="form-select"
                          value={bulkForm.teamId}
                          onChange={(event) => handleBulkFormChange('teamId', event.target.value)}
                        >
                          <option value="">{t('adminUsers.noTeam')}</option>
                          {teams.map((team) => (
                            <option key={team.id} value={team.id}>
                              {team.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      {previewUsers.length > 0 && (
                        <div className="col-12">
                          <h6 className="fw-semibold">Username preview ({previewUsers.length} users)</h6>
                          <div className="border rounded p-3" style={{ maxHeight: '200px', overflowY: 'auto' }}>
                            <div className="table-responsive">
                              <table className="table table-sm table-borderless mb-0">
                                <thead>
                                  <tr>
                                    <th>Real name</th>
                                    <th>Generated username</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {previewUsers.map((user, index) => (
                                    <tr key={index}>
                                      <td>{user.realName}</td>
                                      <td className="font-monospace">{user.username}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-outline-secondary"
                      onClick={closeBulkRegistrationModal}
                      disabled={bulkRegisterMutation.isLoading}
                    >
                      {t('common.close')}
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={bulkRegisterMutation.isLoading || previewUsers.length === 0}
                    >
                      {bulkRegisterMutation.isLoading ? 'Creating...' : `Create ${previewUsers.length} users`}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}

      {/* Password Results Modal */}
      {showPasswordResultsModal && bulkRegistrationResults && (
        <>
          <div className="modal fade show d-block" role="dialog" tabIndex="-1">
            <div className="modal-dialog modal-lg" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">{t('adminUsers.bulkRegisterComplete')}</h5>
                  <button
                    type="button"
                    className="btn-close"
                    onClick={() => {
                      setShowPasswordResultsModal(false);
                      setBulkRegistrationResults(null);
                    }}
                  ></button>
                </div>
                <div className="modal-body">
                  <div className="alert alert-warning d-flex align-items-center mb-4">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    <div>
                      <strong>{t('adminUsers.bulkRegister.important')}:</strong> {t('adminUsers.bulkRegister.importantMessage')}
                    </div>
                  </div>

                  <div className="table-responsive">
                    <table className="table table-hover border">
                      <thead className="table-dark">
                        <tr>
                          <th>{t('adminUsers.name')}</th>
                          <th>{t('adminUsers.username')}</th>
                          <th>{t('adminUsers.bulkRegister.generatedPassword')}</th>
                          <th>{t('adminUsers.bulkRegister.action')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bulkRegistrationResults.created_users.map((user) => (
                          <tr key={user.id}>
                            <td className="fw-semibold">{user.real_name}</td>
                            <td className="font-monospace">{user.username}</td>
                            <td className="font-monospace">{user.password}</td>
                            <td>
                              <button
                                className="btn btn-sm btn-outline-primary"
                                onClick={() => {
                                  navigator.clipboard.writeText(`${user.username}: ${user.password}`);
                                  // Could add toast notification here
                                }}
                                title="Copy username and password"
                              >
                                <i className="fas fa-copy"></i>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {bulkRegistrationResults.failed_count > 0 && (
                    <div className="mt-3">
                      <h6 className="text-danger">Failed to create ({bulkRegistrationResults.failed_count}):</h6>
                      <ul className="text-danger">
                        {bulkRegistrationResults.errors.map((error, index) => (
                          <li key={index}>{error}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                <div className="modal-footer">
                  <button
                    type="button"
                    className="btn btn-success me-auto"
                    onClick={() => {
                      const csvContent = 'Real Name,Username,Password\n' +
                        bulkRegistrationResults.created_users.map(user =>
                          `"${user.real_name}","${user.username}","${user.password}"`
                        ).join('\n');

                      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                      const link = document.createElement('a');
                      const url = URL.createObjectURL(blob);
                      link.setAttribute('href', url);
                      link.setAttribute('download', `bulk_users_${new Date().toISOString().split('T')[0]}.csv`);
                      link.style.visibility = 'hidden';
                      document.body.appendChild(link);
                      link.click();
                      document.body.removeChild(link);
                    }}
                  >
                    <i className="fas fa-download me-2"></i>
                    {t('adminUsers.bulkRegister.downloadCSV')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() => {
                      setShowPasswordResultsModal(false);
                      setBulkRegistrationResults(null);
                    }}
                  >
                    {t('common.close')}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}
