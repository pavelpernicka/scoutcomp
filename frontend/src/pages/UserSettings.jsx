import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";

export default function UserSettingsPage() {
  const { t, i18n } = useTranslation();
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [feedback, setFeedback] = useState(null);
  const [passwordFeedback, setPasswordFeedback] = useState(null);
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    newPassword: "",
    confirmPassword: "",
    preferredLanguage: "",
  });

  useEffect(() => {
    if (profile?.user) {
      setFormData(prev => ({
        ...prev,
        username: profile.user.username || "",
        email: profile.user.email || "",
        preferredLanguage: profile.user.preferred_language || i18n.language,
      }));
    }
  }, [profile, i18n.language]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  useEffect(() => {
    if (!passwordFeedback) return;
    const timeout = setTimeout(() => setPasswordFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [passwordFeedback]);

  const updateProfileMutation = useMutation({
    mutationFn: async (data) => {
      const { data: response } = await api.patch(`/users/${profile?.user?.id}`, data);
      return response;
    },
    onSuccess: () => {
      setFeedback({ type: "success", message: t("userSettings.profileUpdated", "Profile updated successfully.") });
      queryClient.invalidateQueries(["users", "me"]);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("userSettings.updateFailed", "Failed to update profile."),
      });
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data) => {
      // Use the same users endpoint but only send password
      const { data: response } = await api.patch(`/users/${profile?.user?.id}`, {
        password: data.new_password
      });
      return response;
    },
    onSuccess: () => {
      setPasswordFeedback({ type: "success", message: t("userSettings.passwordChanged", "Password changed successfully.") });
      setFormData(prev => ({
        ...prev,
        newPassword: "",
        confirmPassword: "",
      }));
    },
    onError: (error) => {
      setPasswordFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("userSettings.passwordChangeFailed", "Failed to change password."),
      });
    },
  });

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    const updateData = {
      username: formData.username,
      email: formData.email,
      preferred_language: formData.preferredLanguage,
    };
    updateProfileMutation.mutate(updateData);
  };

  const handlePasswordSubmit = (e) => {
    e.preventDefault();

    if (formData.newPassword !== formData.confirmPassword) {
      setPasswordFeedback({
        type: "danger",
        message: t("userSettings.passwordMismatch", "New passwords do not match."),
      });
      return;
    }

    if (formData.newPassword.length < 6) {
      setPasswordFeedback({
        type: "danger",
        message: t("userSettings.passwordTooShort", "New password must be at least 6 characters long."),
      });
      return;
    }

    changePasswordMutation.mutate({
      new_password: formData.newPassword,
    });
  };

  const handleLanguageChange = (newLanguage) => {
    setFormData(prev => ({
      ...prev,
      preferredLanguage: newLanguage,
    }));
    i18n.changeLanguage(newLanguage);
  };

  return (
    <>
      {/* Enthusiastic Header */}
      <div className="row mb-4">
        <div className="col-12">
          <div className="card shadow-lg border-0">
            <div className="card-body text-white position-relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' }}>
              <div className="row align-items-center">
                <div className="col-md-8">
                  <div className="d-flex align-items-center mb-2">
                    <span className="fs-1 me-3">⚙️</span>
                    <div>
                      <h1 className="mb-1">{t("userSettings.title", "User Settings")}</h1>
                      <p className="mb-0 opacity-90 fs-5">
                        {t("userSettings.subtitle", "Customize your account and preferences")}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="col-md-4 text-end">
                  <div className="display-2">🔧</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-4">
        {/* Profile Settings */}
        <div className="col-12 col-xl-8">
          <div className="card shadow-lg border-0 h-100" style={{ borderTop: '4px solid #28a745' }}>
            <div className="card-header bg-light border-0">
              <div className="d-flex align-items-center gap-2">
                <span className="fs-4">👤</span>
                <div>
                  <h5 className="mb-0 fw-bold text-success">{t("userSettings.profileSettings", "Profile Settings")}</h5>
                  <small className="text-muted">{t("userSettings.profileDescription", "Update your basic account information")}</small>
                </div>
              </div>
            </div>
            <div className="card-body p-4">
              {feedback && (
                <div className={`alert alert-${feedback.type} shadow-sm border-0`} role="alert">
                  <div className="d-flex align-items-center">
                    <span className="me-2">
                      {feedback.type === 'success' ? '✅' : feedback.type === 'danger' ? '⚠️' : 'ℹ️'}
                    </span>
                    {feedback.message}
                  </div>
                </div>
              )}

              <form onSubmit={handleProfileSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.username", "Username")}
                    </label>
                    <input
                      type="text"
                      className="form-control border-success border-opacity-50"
                      value={formData.username}
                      onChange={(e) => handleInputChange("username", e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.email", "Email")}
                    </label>
                    <input
                      type="email"
                      className="form-control border-success border-opacity-50"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.language", "Preferred Language")}
                    </label>
                    <select
                      className="form-select border-success border-opacity-50"
                      value={formData.preferredLanguage}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                    >
                      <option value="cs">Čeština</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    className="btn btn-success px-4 py-2"
                    disabled={updateProfileMutation.isLoading}
                  >
                    {updateProfileMutation.isLoading ? t("userSettings.saving", "Saving...") : t("userSettings.saveProfile", "Save Profile")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* Account Info */}
        <div className="col-12 col-xl-4">
          <div className="card shadow-lg border-0 h-100" style={{ borderTop: '4px solid #17a2b8' }}>
            <div className="card-header bg-light border-0">
              <div className="d-flex align-items-center gap-2">
                <span className="fs-4">ℹ️</span>
                <div>
                  <h5 className="mb-0 fw-bold text-info">{t("userSettings.accountInfo", "Account Information")}</h5>
                  <small className="text-muted">{t("userSettings.accountDescription", "Your current account details")}</small>
                </div>
              </div>
            </div>
            <div className="card-body p-4">
              <div className="mb-3">
                <h6 className="text-muted mb-1">{t("userSettings.currentUsername", "Current Username")}</h6>
                <p className="mb-0 fw-bold">{profile?.user?.username}</p>
              </div>
              <div className="mb-3">
                <h6 className="text-muted mb-1">{t("userSettings.role", "Role")}</h6>
                <p className="mb-0">
                  <span className="badge bg-primary px-3 py-2">
                    {profile?.user?.role === "admin" ? "👨‍💼 Admin" :
                     profile?.user?.role === "group_admin" ? "👥 Group Admin" :
                     "👤 Member"}
                  </span>
                </p>
              </div>
              {profile?.user?.team_name && (
                <div className="mb-3">
                  <h6 className="text-muted mb-1">{t("userSettings.team", "Team")}</h6>
                  <p className="mb-0 fw-bold text-primary">{profile.user.team_name}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Password Change */}
        <div className="col-12">
          <div className="card shadow-lg border-0" style={{ borderTop: '4px solid #dc3545' }}>
            <div className="card-header bg-light border-0">
              <div className="d-flex align-items-center gap-2">
                <span className="fs-4">🔒</span>
                <div>
                  <h5 className="mb-0 fw-bold text-danger">{t("userSettings.passwordSettings", "Password Settings")}</h5>
                  <small className="text-muted">{t("userSettings.passwordDescription", "Change your account password")}</small>
                </div>
              </div>
            </div>
            <div className="card-body p-4">
              {passwordFeedback && (
                <div className={`alert alert-${passwordFeedback.type} shadow-sm border-0 mb-4`} role="alert">
                  <div className="d-flex align-items-center">
                    <span className="me-2">
                      {passwordFeedback.type === 'success' ? '✅' : passwordFeedback.type === 'danger' ? '⚠️' : 'ℹ️'}
                    </span>
                    {passwordFeedback.message}
                  </div>
                </div>
              )}

              <div className="mb-3 p-3 bg-light rounded">
                <h6 className="mb-2 text-muted">{t("userSettings.passwordRequirements", "Password Requirements:")}</h6>
                <ul className="mb-0 text-muted small">
                  <li>{t("userSettings.minLength", "Minimum 6 characters long")}</li>
                  <li>{t("userSettings.noCurrentPassword", "Current password verification not required")}</li>
                </ul>
              </div>

              <form onSubmit={handlePasswordSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.newPassword", "New Password")}
                    </label>
                    <input
                      type="password"
                      className="form-control border-danger border-opacity-50"
                      value={formData.newPassword}
                      onChange={(e) => handleInputChange("newPassword", e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.confirmPassword", "Confirm Password")}
                    </label>
                    <input
                      type="password"
                      className="form-control border-danger border-opacity-50"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <button
                    type="submit"
                    className="btn btn-danger px-4 py-2"
                    disabled={changePasswordMutation.isLoading}
                  >
                    {changePasswordMutation.isLoading ? t("userSettings.changingPassword", "Changing Password...") : t("userSettings.changePassword", "Change Password")}
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
