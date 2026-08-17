import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

import api from "../services/api";
import Alert from "../components/Alert";
import Button from "../components/Button";
import Modal from "../components/Modal";
import Input from "../components/Input";
import AdminPageHeader from "../modules/web/admin/AdminPageHeader";

const extractError = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  return typeof detail === "string" && detail ? detail : fallback;
};

const defaultScopeFor = (permission) =>
  permission.scopes?.includes("any") ? "any" : permission.scopes?.[0] || "any";

export default function AdminAccess() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();

  const [expandedId, setExpandedId] = useState(null);
  const [editor, setEditor] = useState(null);
  const [addUserGroup, setAddUserGroup] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const { data: permissions = [] } = useQuery({
    queryKey: ["permissions"],
    queryFn: async () => (await api.get("/admin/access/permissions")).data,
  });
  const { data: groups = [] } = useQuery({
    queryKey: ["permission-groups"],
    queryFn: async () => (await api.get("/admin/access/groups")).data,
  });
  const { data: users = [] } = useQuery({
    queryKey: ["access-users"],
    queryFn: async () => (await api.get("/users")).data,
  });

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 6000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);

  const showFeedback = (type, message) => setFeedback({ type, message });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["permission-groups"] });
    queryClient.invalidateQueries({ queryKey: ["access-users"] });
  };

  const saveGroupMutation = useMutation({
    mutationFn: async ({ id, payload }) => {
      if (id) return (await api.put(`/admin/access/groups/${id}`, payload)).data;
      return (await api.post("/admin/access/groups", payload)).data;
    },
    onSuccess: (_data, variables) => {
      showFeedback(
        "success",
        variables.id ? t("adminAccess.updateSuccess") : t("adminAccess.createSuccess")
      );
      setEditor(null);
      invalidate();
    },
    onError: (error) => {
      showFeedback("danger", extractError(error, t("adminAccess.saveError")));
    },
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id) => api.delete(`/admin/access/groups/${id}`),
    onSuccess: () => {
      setExpandedId(null);
      showFeedback("success", t("adminAccess.deleteSuccess"));
      invalidate();
    },
    onError: (error) => {
      showFeedback("danger", extractError(error, t("adminAccess.deleteError")));
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: async ({ groupId, memberId }) =>
      api.delete(`/admin/access/groups/${groupId}/users/${memberId}`),
    onSuccess: () => {
      showFeedback("success", t("adminAccess.userRemoved"));
      invalidate();
    },
    onError: (error) => {
      showFeedback("danger", extractError(error, t("adminAccess.membersError")));
    },
  });

  const addUserMutation = useMutation({
    mutationFn: async ({ userId, groupId }) => {
      const user = usersById.get(userId);
      const next = [...new Set([...(user?.permission_group_ids || []), groupId])];
      return (await api.put(`/admin/access/users/${userId}/groups`, next)).data;
    },
    onSuccess: () => {
      setAddUserGroup(null);
      showFeedback("success", t("adminAccess.userAdded"));
      invalidate();
    },
    onError: (error) => {
      showFeedback("danger", extractError(error, t("adminAccess.membersError")));
    },
  });

  const handleDeleteGroup = (group) => {
    if (!window.confirm(t("adminAccess.confirmDelete", { name: group.name }))) return;
    deleteGroupMutation.mutate(group.id);
  };

  const handleRemoveMember = (group, member) => {
    if (!window.confirm(t("adminAccess.confirmRemoveUser", { name: member.real_name || member.username }))) return;
    removeMemberMutation.mutate({ groupId: group.id, memberId: member.id });
  };

  const handleAddUser = (member) => {
    if (!addUserGroup) return;
    addUserMutation.mutate({ userId: member.id, groupId: addUserGroup });
  };

  return (
    <div className="admin-access-page">
      <AdminPageHeader
        title={t("adminAccess.title")}
        description={t("adminAccess.subtitle")}
        action={(
        <Button
          variant="primary"
          icon="fas fa-plus"
          onClick={() => setEditor({ mode: "create" })}
        >
          {t("adminAccess.addGroup")}
        </Button>
        )}
      />

      {feedback && (
        <Alert type={feedback.type} toast onDismiss={() => setFeedback(null)}>
          {feedback.message}
        </Alert>
      )}

      <div className="admin-access-groups">
          {groups.map((group) => {
            const expanded = expandedId === group.id;
            const members = group.member_ids
              .map((id) => usersById.get(id))
              .filter(Boolean)
              .sort((a, b) =>
                (a.real_name || a.username).localeCompare(b.real_name || b.username)
              );
            return (
              <article key={group.id} className="card admin-access-group">
                <div className="card-body">
                  <div className="admin-access-group__summary">
                    <div className="flex-grow-1 min-w-0">
                      <h2 className="admin-access-group__title">
                        {group.name}
                        {group.is_system && (
                          <span className="badge text-bg-secondary">{t("adminAccess.systemGroup")}</span>
                        )}
                      </h2>
                      {group.description && <p className="admin-access-group__description">{group.description}</p>}
                      <div className="admin-access-group__meta">
                        <span className="me-3">
                          <i className="fas fa-shield-halved me-1"></i>
                          {group.grants.length} {t("adminAccess.permissionsCount")}
                        </span>
                        <span>
                          <i className="fas fa-users me-1"></i>
                          {group.member_ids.length} {t("adminAccess.membersCount")}
                        </span>
                      </div>
                    </div>
                    <div className="admin-access-group__actions">
                      <Button
                        variant="outline-primary"
                        size="sm"
                        icon="fas fa-pen"
                        onClick={() => setEditor({ mode: "edit", group })}
                      >
                        {t("adminAccess.edit")}
                      </Button>
                      <Button
                        variant="outline-success"
                        size="sm"
                        icon="fas fa-user-plus"
                        onClick={() => setAddUserGroup(group.id)}
                      >
                        {t("adminAccess.addUser")}
                      </Button>
                      <Button
                        variant="outline-danger"
                        size="sm"
                        icon="fas fa-trash"
                        disabled={group.is_system}
                        title={group.is_system ? t("adminAccess.systemGroup") : undefined}
                        onClick={() => handleDeleteGroup(group)}
                      >
                        {t("adminAccess.delete")}
                      </Button>
                      <Button
                        variant="outline-secondary"
                        size="sm"
                        icon={`fas fa-chevron-${expanded ? "up" : "down"}`}
                        onClick={() => setExpandedId(expanded ? null : group.id)}
                      >
                        {t("adminAccess.members")}
                      </Button>
                    </div>
                  </div>
                </div>
                {expanded && (
                  <div className="card-body border-top">
                    {members.length === 0 ? (
                      <p className="text-muted mb-0">
                        <em>{t("adminAccess.noMembers")}</em>
                      </p>
                    ) : (
                      <div className="row g-2">
                        {members.map((member) => (
                          <div className="col-md-6 col-xl-4" key={member.id}>
                            <div className="border rounded p-2 d-flex align-items-center justify-content-between gap-2">
                              <div className="text-truncate">
                                <span className="fw-medium text-truncate d-block">
                                  {member.real_name}
                                </span>
                                <small className="text-muted d-block text-truncate">
                                  {member.username}
                                </small>
                              </div>
                              <Button
                                variant="outline-danger"
                                size="sm"
                                icon="fas fa-xmark"
                                disabled={removeMemberMutation.isPending}
                                title={t("adminAccess.removeMember")}
                                onClick={() => handleRemoveMember(group, member)}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {groups.length === 0 && (
            <div className="text-center text-muted py-5">
              <i className="fas fa-user-shield fs-1 mb-2 opacity-50"></i>
              <p className="mb-0">{t("adminAccess.emptyGroups")}</p>
            </div>
          )}
      </div>

      <GroupEditorModal
        isVisible={Boolean(editor)}
        onClose={() => setEditor(null)}
        editor={editor}
        permissions={permissions}
        saving={saveGroupMutation.isPending}
        onSave={saveGroupMutation.mutate}
      />

      <AddUserModal
        isVisible={Boolean(addUserGroup)}
        onClose={() => setAddUserGroup(null)}
        users={users}
        group={groups.find((g) => g.id === addUserGroup)}
        adding={addUserMutation.isPending}
        onAdd={handleAddUser}
      />
    </div>
  );
}

function GroupEditorModal({ isVisible, onClose, editor, permissions, saving, onSave }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: "", description: "", grants: [] });
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isVisible) return;
    const isEdit = editor?.mode === "edit";
    setForm({
      name: isEdit ? editor.group.name : "",
      description: isEdit ? editor.group.description || "" : "",
      grants: isEdit
        ? editor.group.grants.map((grant) => ({
            permission_id: grant.permission_id,
            scope: grant.scope,
          }))
        : [],
    });
    setSearch("");
  }, [isVisible, editor]);

  const moduleGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? permissions.filter((permission) =>
          [permission.action, permission.name, permission.description].some((value) =>
            value?.toLowerCase().includes(q)
          )
        )
      : permissions;
    const map = new Map();
    for (const permission of filtered) {
      if (!map.has(permission.module_code)) {
        map.set(permission.module_code, {
          module_code: permission.module_code,
          module_name: permission.module_name,
          permissions: [],
        });
      }
      map.get(permission.module_code).permissions.push(permission);
    }
    return [...map.values()];
  }, [permissions, search]);

  const toggle = (permission) => {
    setForm((current) => {
      const has = current.grants.some((grant) => grant.permission_id === permission.id);
      return {
        ...current,
        grants: has
          ? current.grants.filter((grant) => grant.permission_id !== permission.id)
          : [...current.grants, { permission_id: permission.id, scope: defaultScopeFor(permission) }],
      };
    });
  };

  const setScope = (permissionId, scope) => {
    setForm((current) => ({
      ...current,
      grants: current.grants.map((grant) =>
        grant.permission_id === permissionId ? { ...grant, scope } : grant
      ),
    }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (!form.name.trim()) return;
    onSave({
      id: editor?.mode === "edit" ? editor.group.id : null,
      payload: {
        name: form.name.trim(),
        description: form.description.trim() || null,
        grants: form.grants,
      },
    });
  };

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={editor?.mode === "edit" ? t("adminAccess.editGroup") : t("adminAccess.createGroup")}
      icon={<i className="fas fa-shield-halved fs-3"></i>}
      headerGradient="linear-gradient(135deg, #6f42c1 0%, #4f46e5 100%)"
      size="xl"
      footer={
        <div className="d-flex justify-content-end gap-2 w-100">
          <Button variant="secondary" icon="fas fa-xmark" onClick={onClose}>
            {t("adminAccess.cancel")}
          </Button>
          <Button variant="primary" icon="fas fa-save" loading={saving} onClick={handleSubmit}>
            {editor?.mode === "edit" ? t("adminAccess.saveGroup") : t("adminAccess.createGroup")}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit}>
        <div className="row g-3 mb-3">
          <div className="col-md-6">
            <label className="form-label small fw-semibold">{t("adminAccess.name")} *</label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder={t("adminAccess.namePlaceholder")}
              required
            />
          </div>
          <div className="col-md-6">
            <label className="form-label small fw-semibold">{t("adminAccess.description")}</label>
            <Input
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder={t("adminAccess.descriptionPlaceholder")}
            />
          </div>
        </div>
        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
          <div className="input-group" style={{ maxWidth: "360px" }}>
            <span className="input-group-text">
              <i className="fas fa-search"></i>
            </span>
            <input
              type="text"
              className="form-control"
              placeholder={t("adminAccess.searchPermissions")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="badge text-bg-primary ms-auto">
            {form.grants.length} {t("adminAccess.permissionsCount")}
          </span>
        </div>
        <p className="small text-muted">{t("adminAccess.scopeHint")}</p>
        <div className="border rounded p-2" style={{ maxHeight: "420px", overflowY: "auto" }}>
          {moduleGroups.length === 0 ? (
            <div className="text-center text-muted py-4">{t("adminAccess.noPermissionsFound")}</div>
          ) : (
            moduleGroups.map((module) => (
              <div key={module.module_code} className="mb-3">
                <h3 className="h6 text-muted text-uppercase mb-2">
                  <i className="fas fa-cube me-1"></i>
                  {module.module_name}
                </h3>
                {module.permissions.map((permission) => {
                  const grant = form.grants.find(
                    (item) => item.permission_id === permission.id
                  );
                  return (
                    <div
                      className="d-flex align-items-center gap-2 py-1 border-bottom"
                      key={permission.id}
                    >
                      <input
                        type="checkbox"
                        className="form-check-input m-0"
                        checked={Boolean(grant)}
                        onChange={() => toggle(permission)}
                      />
                      <div className="flex-grow-1 min-w-0">
                        <code>{permission.action}</code>
                        <small className="d-block text-muted text-truncate">
                          {permission.description}
                        </small>
                      </div>
                      {grant && (
                        <select
                          className="form-select form-select-sm"
                          style={{ width: "100px" }}
                          value={grant.scope}
                          onChange={(e) => setScope(permission.id, e.target.value)}
                        >
                          {(permission.scopes || ["any"]).map((scope) => (
                            <option key={scope} value={scope}>
                              {scope}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </form>
    </Modal>
  );
}

GroupEditorModal.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  editor: PropTypes.object,
  permissions: PropTypes.array,
  saving: PropTypes.bool,
  onSave: PropTypes.func.isRequired,
};

function AddUserModal({ isVisible, onClose, users, group, adding, onAdd }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (isVisible) setQuery("");
  }, [isVisible]);

  const results = useMemo(() => {
    const memberIds = new Set(group?.member_ids || []);
    const q = query.trim().toLowerCase();
    return users
      .filter((user) => !memberIds.has(user.id))
      .filter(
        (user) =>
          !q ||
          [user.real_name, user.username, user.email].some((value) =>
            value?.toLowerCase().includes(q)
          )
      )
      .slice(0, 30);
  }, [users, group, query]);

  return (
    <Modal
      isVisible={isVisible}
      onClose={onClose}
      title={`${t("adminAccess.addUser")} · ${group?.name || ""}`}
      icon={<i className="fas fa-user-plus fs-3"></i>}
      headerGradient="linear-gradient(135deg, #16a34a 0%, #0f766e 100%)"
    >
      <div className="input-group mb-3">
        <span className="input-group-text">
          <i className="fas fa-search"></i>
        </span>
        <input
          type="text"
          className="form-control"
          placeholder={t("adminAccess.searchUsers")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>
      <div className="list-group list-group-flush" style={{ maxHeight: "400px", overflowY: "auto" }}>
        {results.length === 0 ? (
          <div className="text-center text-muted py-4">{t("adminAccess.noUsersFound")}</div>
        ) : (
          results.map((user) => (
            <button
              key={user.id}
              type="button"
              className="list-group-item list-group-item-action d-flex align-items-center gap-2"
              disabled={adding}
              onClick={() => onAdd(user)}
            >
              <span className="flex-grow-1 text-truncate">
                <span className="d-block fw-medium">{user.real_name}</span>
                <small className="text-muted d-block text-truncate">{user.username}</small>
              </span>
              <Button variant="outline-success" size="sm" icon="fas fa-plus" />
            </button>
          ))
        )}
      </div>
    </Modal>
  );
}

AddUserModal.propTypes = {
  isVisible: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  users: PropTypes.array,
  group: PropTypes.object,
  adding: PropTypes.bool,
  onAdd: PropTypes.func.isRequired,
};
