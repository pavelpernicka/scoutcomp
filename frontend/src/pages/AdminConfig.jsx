import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../services/api";
import { useConfig } from "../providers/ConfigProvider";
import LoadingSpinner from "../components/LoadingSpinner";
import defaultAppIcon from "../assets/default-app-icon.svg";

export default function AdminConfig() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { refetchConfig } = useConfig();

  const [feedback, setFeedback] = useState(null);
  const [formData, setFormData] = useState({
    appName: "",
    appIcon: "",
    leaderboardDefaultView: "total", // "total" or "average"
    allowSelfRegistration: false,
  });
  const [iconPreview, setIconPreview] = useState(defaultAppIcon);

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
        appIcon: config.app_icon || "",
        leaderboardDefaultView: config.leaderboard_default_view || "total",
        allowSelfRegistration: config.allow_self_registration || false,
      });
      setIconPreview(config.app_icon || defaultAppIcon);
    }
  }, [config]);

  const updateConfigMutation = useMutation({
    mutationFn: async (data) => {
      const { data: response } = await api.patch("/admin/config", {
        app_name: data.appName,
        app_icon: data.appIcon,
        leaderboard_default_view: data.leaderboardDefaultView,
        allow_self_registration: data.allowSelfRegistration,
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

  const handleIconUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.includes('image/')) {
      setFeedback({ type: "danger", message: "Please select a valid image file." });
      return;
    }

    // Validate file size (max 1MB)
    if (file.size > 1024 * 1024) {
      setFeedback({ type: "danger", message: "File size must be less than 1MB." });
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      setFormData(prev => ({
        ...prev,
        appIcon: dataUrl,
      }));
      setIconPreview(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const resetIcon = () => {
    setFormData(prev => ({
      ...prev,
      appIcon: "",
    }));
    setIconPreview(defaultAppIcon);
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

                  {/* App Icon */}
                  <div className="col-12">
                    <label className="form-label fw-medium">
                      {t("adminConfig.appIcon", "Application Icon")}
                    </label>
                    <div className="row g-3">
                      <div className="col-md-8">
                        <div className="input-group">
                          <input
                            type="file"
                            className="form-control border-primary border-opacity-50"
                            accept="image/*"
                            onChange={handleIconUpload}
                          />
                          <button
                            type="button"
                            className="btn btn-outline-secondary"
                            onClick={resetIcon}
                            title="Reset to default icon"
                          >
                            <i className="fas fa-undo me-1"></i>Reset
                          </button>
                        </div>
                        <div className="form-text">
                          {t("adminConfig.appIconHelp", "Upload a custom icon for your application. Recommended: SVG, PNG, or JPG (max 1MB, square format recommended)")}
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="text-center">
                          <div className="border rounded p-3 bg-light d-inline-block">
                            <img
                              src={iconPreview}
                              alt="App Icon Preview"
                              style={{
                                width: "64px",
                                height: "64px",
                                objectFit: "contain"
                              }}
                            />
                          </div>
                          <div className="mt-2">
                            <small className="text-muted">Preview</small>
                          </div>
                        </div>
                      </div>
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

                  {/* Allow Self Registration */}
                  <div className="col-12">
                    <div className="d-flex align-items-center gap-3">
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          role="switch"
                          id="allowSelfRegistration"
                          checked={formData.allowSelfRegistration}
                          onChange={(e) => handleInputChange("allowSelfRegistration", e.target.checked)}
                        />
                        <label className="form-check-label fw-medium" htmlFor="allowSelfRegistration">
                          {t("adminConfig.allowSelfRegistration", "Allow Self Registration with Team Code")}
                        </label>
                      </div>
                    </div>
                    <div className="form-text mt-2">
                      {t("adminConfig.selfRegistrationHelp", "When enabled, users can register themselves using a team join code without admin approval")}
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