import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import { useConfig } from "../providers/ConfigProvider";
import HeroHeader from "../components/HeroHeader";
import Alert from "../components/Alert";
import Button from "../components/Button";
import LoadingSpinner from "../components/LoadingSpinner";

export default function AdminConfig() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { refetchConfig } = useConfig();

  const [feedback, setFeedback] = useState(null);
  const [formData, setFormData] = useState({
    appName: "",
    leaderboardDefaultView: "total", // "total" or "average"
  });

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  // Fetch current config
  const { data: config, isLoading: configLoading } = useQuery({
    queryKey: ["admin", "config"],
    queryFn: async () => {
      const { data } = await api.get("/admin/config");
      return data;
    },
    staleTime: 30_000,
  });

  useEffect(() => {
    if (config) {
      setFormData({
        appName: config.app_name || "ScoutComp",
        leaderboardDefaultView: config.leaderboard_default_view || "total",
      });
    }
  }, [config]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data) => {
      const { data: response } = await api.patch("/admin/config", {
        app_name: data.appName,
        leaderboard_default_view: data.leaderboardDefaultView,
      });
      return response;
    },
    onSuccess: () => {
      setFeedback({ type: "success", message: t("adminConfig.updateSuccess", "Configuration updated successfully.") });
      queryClient.invalidateQueries(["admin", "config"]);
      refetchConfig(); // Update the global config context
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("adminConfig.updateFailed", "Failed to update configuration."),
      });
    },
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    updateConfigMutation.mutate(formData);
  };

  if (configLoading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '200px' }}>
        <LoadingSpinner text="Loading..." />
      </div>
    );
  }

  return (
    <>
      {/* Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-body text-white position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <div className="row align-items-center">
                <div className="col-md-8">
                  <div className="d-flex align-items-center mb-2">
                    <div>
                      <h1 className="mb-1">{t("adminConfig.title", "Global Configuration")}</h1>
                      <p className="mb-0 opacity-90 fs-5">
                        {t("adminConfig.subtitle", "Configure application-wide settings")}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="row">
        <div className="col-12 col-xl-8 mx-auto">
          <div className="card shadow-lg border-0" style={{ borderTop: '4px solid #6f42c1' }}>
            <div className="card-header bg-light border-0">
              <div className="d-flex align-items-center gap-2">
                <div>
                  <h5 className="mb-0 fw-bold" style={{ color: '#6f42c1' }}>{t("adminConfig.generalSettings", "General Settings")}</h5>
                  <small className="text-muted">{t("adminConfig.generalDescription", "Configure basic application settings")}</small>
                </div>
              </div>
            </div>
            <div className="card-body p-4">
              {feedback && (
                <div className={`alert alert-${feedback.type} shadow-sm border-0 mb-4`} role="alert">
                  <div className="d-flex align-items-center">
                    {feedback.message}
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <div className="row g-4">
                  {/* App Name */}
                  <div className="col-12">
                    <label className="form-label fw-medium">
                      {t("adminConfig.appName", "Application Name")}
                    </label>
                    <input
                      type="text"
                      className="form-control border-primary border-opacity-50"
                      value={formData.appName}
                      onChange={(e) => handleInputChange("appName", e.target.value)}
                      placeholder="ScoutComp"
                      required
                    />
                    <div className="form-text">
                      {t("adminConfig.appNameHelp", "This name will appear in the navigation bar and page titles")}
                    </div>
                  </div>

                  {/* Leaderboard Default View */}
                  <div className="col-12">
                    <label className="form-label fw-medium">
                      {t("adminConfig.leaderboardDefault", "Leaderboard Default View")}
                    </label>
                    <select
                      className="form-select border-primary border-opacity-50"
                      value={formData.leaderboardDefaultView}
                      onChange={(e) => handleInputChange("leaderboardDefaultView", e.target.value)}
                    >
                      <option value="total">{t("adminConfig.totalPoints", "Total Points")}</option>
                      <option value="average">{t("adminConfig.averagePoints", "Average Points")}</option>
                    </select>
                    <div className="form-text">
                      {t("adminConfig.leaderboardHelp", "Choose which view users see by default when opening the leaderboard")}
                    </div>
                  </div>
                </div>

                <div className="mt-4 d-flex justify-content-between align-items-center">
                  <div className="text-muted">
                    <small>{t("adminConfig.adminOnly", "Only administrators can modify these settings")}</small>
                  </div>
                  <button
                    type="submit"
                    className="btn btn-primary px-4 py-2"
                    disabled={updateConfigMutation.isLoading}
                  >
                    {updateConfigMutation.isLoading ? t("adminConfig.saving", "Saving...") : t("adminConfig.saveConfig", "Save Configuration")}
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