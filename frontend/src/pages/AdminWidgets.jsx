import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";
import Alert from "../components/Alert";
import Modal from "../components/Modal";
import AdminPageHeader from "../modules/web/admin/AdminPageHeader";

export default function AdminWidgets() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState(null);

  const { data: widgets = [], isLoading } = useQuery({
    queryKey: ["admin", "widgets"],
    queryFn: async () => {
      const { data } = await api.get("/admin/widgets");
      return data;
    },
    staleTime: 30_000,
  });

  const [draft, setDraft] = useState(null);
  const [editingWidget, setEditingWidget] = useState(null);
  const [configDraft, setConfigDraft] = useState({ title: "", text: "", icon: "" });
  const serverEnabledIds = widgets.filter((widget) => widget.enabled).map((widget) => widget.id);
  const draftIds = draft ?? serverEnabledIds;

  const grouped = useMemo(() => {
    const result = {};
    for (const widget of widgets) {
      const moduleKey = widget.module || "core";
      result[moduleKey] = result[moduleKey] || { name: widget.module_name || moduleKey, items: [] };
      result[moduleKey].items.push(widget);
    }
    return result;
  }, [widgets]);

  const saveMutation = useMutation({
    mutationFn: async (enabledIds) => {
      const { data } = await api.put("/admin/widgets", { enabled_ids: enabledIds });
      return data;
    },
    onSuccess: () => {
      setDraft(null);
      setFeedback({ type: "success", message: t("adminWidgets.updateSuccess") });
      queryClient.invalidateQueries(["admin", "widgets"]);
      queryClient.invalidateQueries(["widgets"]);
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("adminWidgets.updateFailed"),
      });
    },
  });

  const toggle = (widgetId) => {
    setDraft((current) => {
      const base = current ?? serverEnabledIds;
      return base.includes(widgetId) ? base.filter((id) => id !== widgetId) : [...base, widgetId];
    });
  };

  const openEditConfig = (widget) => {
    setConfigDraft({
      title: widget.title || "",
      text: widget.text || "",
      icon: widget.icon || "",
    });
    setEditingWidget(widget);
  };

  const configMutation = useMutation({
    mutationFn: async ({ widgetId, config }) => {
      const { data } = await api.put(`/admin/widgets/${widgetId}/config`, config);
      return data;
    },
    onSuccess: () => {
      setEditingWidget(null);
      setFeedback({ type: "success", message: t("adminWidgets.updateSuccess") });
      queryClient.invalidateQueries(["admin", "widgets"]);
      queryClient.invalidateQueries(["widgets"]);
      setTimeout(() => setFeedback(null), 4000);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("adminWidgets.updateFailed"),
      });
    },
  });

  const saveConfig = () => {
    if (!editingWidget) return;
    const config = {};
    if (configDraft.title.trim()) config.title = configDraft.title.trim();
    if (configDraft.text.trim()) config.text = configDraft.text.trim();
    if (configDraft.icon.trim()) config.icon = configDraft.icon.trim();
    configMutation.mutate({ widgetId: editingWidget.id, config });
  };

  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
        <LoadingSpinner text={t("adminWidgets.loading")} />
      </div>
    );
  }

  return (
    <div className="admin-widgets-page">
      <AdminPageHeader title={t("adminWidgets.title")} description={t("adminWidgets.subtitle")} />
      {feedback && <Alert type={feedback.type} toast onDismiss={() => setFeedback(null)}>{feedback.message}</Alert>}

      {Object.keys(grouped).length === 0 && (
        <div className="card card-body text-center text-muted py-5">
          <i className="fas fa-puzzle-piece fs-3 mb-2 opacity-50 d-block"></i>
          {t("adminWidgets.empty")}
        </div>
      )}

      <div className="admin-widget-groups">
        {Object.entries(grouped).map(([moduleKey, group]) => (
          <section className="admin-widget-group" key={moduleKey} aria-labelledby={`widget-module-${moduleKey}`}>
            <div className="admin-widget-group__heading">
              <div>
                <h2 id={`widget-module-${moduleKey}`}>{group.name}</h2>
                <p>{t("adminWidgets.moduleWidgets", { module: group.name })}</p>
              </div>
            </div>
            <div className="card admin-widget-table-card">
              <div className="table-responsive">
                <table className="table align-middle mb-0">
                  <thead>
                      <tr>
                        <th className="ps-4">{t("adminWidgets.widget")}</th>
                        <th className="d-none d-md-table-cell">{t("adminWidgets.type")}</th>
                        <th className="text-end pe-4">{t("adminWidgets.visible")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((widget) => (
                        <tr key={widget.id} className="admin-widget-row">
                          <td>
                            <div className="admin-widget-identity">
                              <span className="admin-widget-icon" aria-hidden="true"><i className={`fas ${widget.icon}`}></i></span>
                              <div className="min-w-0">
                                <div className="admin-widget-title">{widget.title}</div>
                                {widget.text && <div className="admin-widget-description">{widget.text}</div>}
                                <code>{widget.id}</code>
                              </div>
                            </div>
                          </td>
                          <td className="d-none d-md-table-cell">
                            <span className="admin-widget-type">{widget.component}</span>
                          </td>
                          <td className="text-end">
                            <div className="admin-widget-controls">
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm admin-widget-edit"
                                title={t("adminWidgets.editConfig")}
                                aria-label={`${t("adminWidgets.editConfig")}: ${widget.title}`}
                                onClick={() => openEditConfig(widget)}
                              >
                                <i className="fas fa-pen"></i>
                              </button>
                              <div className="form-check form-switch d-inline-block m-0">
                                <input
                                  className="form-check-input admin-widget-switch"
                                  type="checkbox"
                                  role="switch"
                                  id={`widget-${widget.id}`}
                                  checked={draftIds.includes(widget.id)}
                                  onChange={() => toggle(widget.id)}
                                />
                                <label className="form-check-label" htmlFor={`widget-${widget.id}`}>
                                  <span className="visually-hidden">{widget.title}</span>
                                </label>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                </table>
              </div>
            </div>
          </section>
        ))}
      </div>

      <div className="admin-widgets-savebar" aria-live="polite">
        <p>{t("adminWidgets.help")}</p>
        <div className="admin-widgets-savebar__actions">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => setDraft(null)}
            disabled={draft === null || saveMutation.isLoading}
          >
            {t("common.reset")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => saveMutation.mutate(draftIds)}
            disabled={draft === null || saveMutation.isLoading}
          >
            {saveMutation.isLoading ? t("common.saving") : t("common.save")}
          </button>
        </div>
      </div>

      {editingWidget && (
        <Modal
          isVisible={Boolean(editingWidget)}
          onClose={() => setEditingWidget(null)}
          title={`${t("adminWidgets.editConfig")} – ${editingWidget.title}`}
          icon={<i className={`fas ${editingWidget.icon}`} />}
          size="lg"
          footer={(
            <>
              <button type="button" className="btn btn-outline-secondary" onClick={() => setEditingWidget(null)}>
                {t("common.cancel")}
              </button>
              <button type="button" className="btn btn-primary" onClick={saveConfig} disabled={configMutation.isLoading}>
                {configMutation.isLoading ? t("common.saving") : t("common.save")}
              </button>
            </>
          )}
        >
                  <div className="mb-3">
                    <label className="form-label">{t("adminWidgets.configTitle")}</label>
                    <input
                      className="form-control"
                      value={configDraft.title}
                      onChange={(event) => setConfigDraft((prev) => ({ ...prev, title: event.target.value }))}
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">{t("adminWidgets.configText")}</label>
                    <textarea
                      className="form-control"
                      rows={2}
                      value={configDraft.text}
                      onChange={(event) => setConfigDraft((prev) => ({ ...prev, text: event.target.value }))}
                    ></textarea>
                  </div>
                  <div className="mb-2">
                    <label className="form-label">{t("adminWidgets.configIcon")}</label>
                    <div className="input-group">
                      <span className="input-group-text"><i className={`fas ${configDraft.icon || "fa-puzzle-piece"}`}></i></span>
                      <input
                        className="form-control"
                        value={configDraft.icon}
                        onChange={(event) => setConfigDraft((prev) => ({ ...prev, icon: event.target.value }))}
                        placeholder="fa-house-user"
                      />
                    </div>
                    <div className="form-text">{t("adminWidgets.configIconHint")}</div>
                  </div>
        </Modal>
      )}
    </div>
  );
}
