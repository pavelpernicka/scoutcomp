import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "../services/api";
import AdminConfig from "./AdminConfig";
import LoadingSpinner from "../components/LoadingSpinner";

export default function ModuleSettings() {
  const { t } = useTranslation();
  const { code } = useParams();
  const queryClient = useQueryClient();
  const [settings, setSettings] = useState({});
  const [feedback, setFeedback] = useState(null);
  const [jsonError, setJsonError] = useState(null);

  const { data: modules = [], isLoading } = useQuery({
    queryKey: ["admin-modules"],
    queryFn: async () => (await api.get("/modules/all")).data,
  });
  const module = modules.find((item) => item.code === code);

  useEffect(() => setSettings(module?.settings || {}), [module]);
  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  if (code === "core") return <AdminConfig />;
  if (isLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
        <LoadingSpinner text={t("web.states.loading")} />
      </div>
    );
  }
  if (!module) {
    return <div className="text-muted py-5 text-center">{t("adminModules.unknownModule")}</div>;
  }

  const handleJsonChange = (value) => {
    try {
      setSettings(JSON.parse(value));
      setJsonError(null);
    } catch {
      setJsonError(t("adminModules.invalidJson"));
    }
  };

  const save = async (event) => {
    event.preventDefault();
    if (jsonError) return;
    try {
      await api.patch(`/modules/${code}`, { settings });
      queryClient.invalidateQueries({ queryKey: ["admin-modules"] });
      setFeedback({ type: "success", message: t("adminModules.saveSuccess") });
    } catch (error) {
      setFeedback({ type: "danger", message: error?.response?.data?.detail || t("adminModules.saveFailed") });
    }
  };

  return (
    <>
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-body text-white position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <div className="d-flex align-items-center mb-2">
                <i className={`fas ${module.icon || "fa-puzzle-piece"} fs-3 me-3`}></i>
                <div>
                  <h1 className="mb-1">{module.name} · {t("adminModules.settings").toLowerCase()}</h1>
                  <p className="mb-0 opacity-90 fs-5">{module.description}</p>
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
          <div className="card shadow-lg border-0" style={{ borderTop: '4px solid #6f42c1' }}>
            <div className="card-header bg-light border-0">
              <div className="d-flex align-items-center gap-2">
                <div>
                  <h5 className="mb-0 fw-bold" style={{ color: '#6f42c1' }}>{t("adminModules.moduleSettings")}</h5>
                  <small className="text-muted">{t("adminModules.moduleSettingsHelp")}</small>
                </div>
              </div>
            </div>
            <div className="card-body p-4">
              <form onSubmit={save}>
                {code === "competitions" ? (
                  <div className="row g-4">
                    <div className="col-12">
                      <label className="form-label fw-medium">{t("adminModules.defaultLeaderboardView")}</label>
                      <select
                        className="form-select border-primary border-opacity-50"
                        value={settings.leaderboard_default_view || "total"}
                        onChange={(e) => setSettings({ ...settings, leaderboard_default_view: e.target.value })}
                      >
                        <option value="total">{t("adminModules.leaderboardTotal")}</option>
                        <option value="average">{t("adminModules.leaderboardAverage")}</option>
                      </select>
                    </div>
                    <div className="col-12">
                      <div className="d-flex align-items-center gap-3">
                        <div className="form-check form-switch">
                          <input
                            className="form-check-input"
                            type="checkbox"
                            role="switch"
                            id="leaderboardShowOnlyDefaultMode"
                            checked={Boolean(settings.leaderboard_show_only_default_mode)}
                            onChange={(e) => setSettings({ ...settings, leaderboard_show_only_default_mode: e.target.checked })}
                          />
                          <label className="form-check-label fw-medium" htmlFor="leaderboardShowOnlyDefaultMode">
                            {t("adminModules.showOnlyDefaultMode")}
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="col-12">
                    <label className="form-label fw-medium">{t("adminModules.jsonSettings")}</label>
                    <textarea
                      className={`form-control font-monospace border-primary border-opacity-50 ${jsonError ? "is-invalid" : ""}`}
                      rows="12"
                      value={JSON.stringify(settings, null, 2)}
                      onChange={(e) => handleJsonChange(e.target.value)}
                    />
                    {jsonError && <div className="invalid-feedback">{jsonError}</div>}
                  </div>
                )}
                <div className="mt-4 d-flex justify-content-end">
                  <button type="submit" className="btn btn-primary px-4 py-2">
                    {t("adminModules.saveModuleSettings")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
