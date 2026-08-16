import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import LoadingSpinner from "../components/LoadingSpinner";

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
    <>
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-body text-white position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <div className="d-flex align-items-center mb-2">
                <i className="fas fa-th-large fs-3 me-3"></i>
                <div>
                  <h1 className="mb-1">{t("adminWidgets.title")}</h1>
                  <p className="mb-0 opacity-90 fs-5">{t("adminWidgets.subtitle")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col-12">
          {feedback && (
            <div className={`alert alert-${feedback.type} shadow-sm border-0 mb-4`} role="alert">
              {feedback.message}
            </div>
          )}

          {Object.keys(grouped).length === 0 && (
            <div className="card card-body text-center text-muted py-5">
              <i className="fas fa-puzzle-piece fs-3 mb-2 opacity-50 d-block"></i>
              {t("adminWidgets.empty")}
            </div>
          )}

          {Object.entries(grouped).map(([moduleKey, group]) => (
            <div className="card shadow-sm border-0 mb-4" style={{ borderTop: '4px solid #6f42c1' }} key={moduleKey}>
              <div className="card-header bg-light border-0 d-flex align-items-center gap-2">
                <div>
                  <h5 className="mb-0 fw-bold" style={{ color: '#6f42c1' }}>{group.name}</h5>
                  <small className="text-muted">{t("adminWidgets.moduleWidgets", { module: group.name })}</small>
                </div>
              </div>
              <div className="card-body p-0">
                <div className="table-responsive">
                  <table className="table align-middle mb-0">
                    <thead className="bg-light">
                      <tr>
                        <th className="ps-4">{t("adminWidgets.widget")}</th>
                        <th className="d-none d-md-table-cell">{t("adminWidgets.type")}</th>
                        <th className="text-end pe-4">{t("adminWidgets.visible")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((widget) => (
                        <tr key={widget.id}>
                          <td className="ps-4">
                            <div className="d-flex align-items-center gap-3">
                              <i className={`fas ${widget.icon} text-primary fs-5`}></i>
                              <div>
                                <div className="fw-medium">{widget.title}</div>
                                <small className="text-muted d-block">{widget.text}</small>
                                <code className="small text-muted">{widget.id}</code>
                              </div>
                            </div>
                          </td>
                          <td className="d-none d-md-table-cell">
                            <span className="badge text-bg-light border">{widget.component}</span>
                          </td>
                          <td className="text-end pe-4">
                            <div className="d-inline-flex align-items-center gap-2">
                              <button
                                type="button"
                                className="btn btn-outline-secondary btn-sm"
                                title={t("adminWidgets.editConfig")}
                                onClick={() => openEditConfig(widget)}
                              >
                                <i className="fas fa-pen"></i>
                              </button>
                              <div className="form-check form-switch d-inline-block m-0">
                                <input
                                  className="form-check-input"
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
            </div>
          ))}

          <div className="d-flex justify-content-end align-items-center gap-2 mb-4">
            <div className="text-muted me-auto">
              <small>{t("adminWidgets.help")}</small>
            </div>
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
              className="btn btn-primary px-4 py-2"
              onClick={() => saveMutation.mutate(draftIds)}
              disabled={draft === null || saveMutation.isLoading}
            >
              {saveMutation.isLoading ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </div>
      </div>

      {editingWidget && (
        <>
          <div
            className="modal fade show d-block"
            role="dialog"
            aria-modal="true"
            tabIndex={-1}
            onClick={() => setEditingWidget(null)}
          >
            <div className="modal-dialog modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className={`fas ${editingWidget.icon} me-2 text-primary`}></i>
                    {t("adminWidgets.editConfig")} – {editingWidget.title}
                  </h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setEditingWidget(null)}></button>
                </div>
                <div className="modal-body">
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
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setEditingWidget(null)}>
                    {t("common.cancel")}
                  </button>
                  <button type="button" className="btn btn-primary" onClick={saveConfig} disabled={configMutation.isLoading}>
                    {configMutation.isLoading ? t("common.saving") : t("common.save")}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </>
  );
}
