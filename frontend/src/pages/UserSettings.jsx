import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { useAuth } from "../providers/AuthProvider";
import api from "../services/api";
import HeroHeader from "../components/HeroHeader";
import Alert from "../components/Alert";
import Button from "../components/Button";
import DecoratedCard from "../components/DecoratedCard";
import Input from "../components/Input";
import Select from "../components/Select";

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
      <HeroHeader
        title={t("userSettings.title", "User Settings")}
        subtitle={t("userSettings.subtitle", "Customize your account and preferences")}
        icon={<i className="fas fa-cog text-white fs-1"></i>}
      >
      </HeroHeader>

      <div className="row g-4">
        {/* Profile Settings */}
        <div className="col-12 col-xl-8">
          <DecoratedCard
            title={t("userSettings.profileSettings", "Profile Settings")}
            subtitle={t("userSettings.profileDescription", "Update your basic account information")}
            icon={<i className="fas fa-user fs-4"></i>}
            headerGradient="linear-gradient(135deg, #28a745 0%, #20c997 100%)"
            shadow={true}
            className="h-100"
          >
              {feedback && (
                <Alert type={feedback.type} className="shadow-sm border-0" icon={<></>}>
                  {feedback.message}
                </Alert>
              )}

              <form onSubmit={handleProfileSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.username", "Username")}
                    </label>
                    <Input
                      type="text"
                      className="border-success border-opacity-50"
                      value={formData.username}
                      onChange={(e) => handleInputChange("username", e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.email", "Email")}
                    </label>
                    <Input
                      type="email"
                      className="border-success border-opacity-50"
                      value={formData.email}
                      onChange={(e) => handleInputChange("email", e.target.value)}
                      required
                    />
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.language", "Preferred Language")}
                    </label>
                    <Select
                      className="border-success border-opacity-50"
                      options={[
                        { value: "cs", label: "Čeština" },
                        { value: "en", label: "English" }
                      ]}
                      value={formData.preferredLanguage}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Button
                    type="submit"
                    variant="success"
                    className="px-4 py-2"
                    disabled={updateProfileMutation.isLoading}
                    loading={updateProfileMutation.isLoading}
                  >
                    {updateProfileMutation.isLoading ? t("userSettings.saving", "Saving...") : t("userSettings.saveProfile", "Save Profile")}
                  </Button>
                </div>
              </form>
          </DecoratedCard>
        </div>

        {/* Account Info */}
        <div className="col-12 col-xl-4">
          <DecoratedCard
            title={t("userSettings.accountInfo", "Account Information")}
            subtitle={t("userSettings.accountDescription", "Your current account details")}
            icon={<i className="fas fa-info-circle fs-4"></i>}
            headerGradient="linear-gradient(135deg, #17a2b8 0%, #20c997 100%)"
            shadow={true}
            className="h-100"
          >
              <div className="mb-3">
                <h6 className="text-muted mb-1">{t("userSettings.currentUsername", "Current Username")}</h6>
                <p className="mb-0 fw-bold">{profile?.user?.username}</p>
              </div>
              <div className="mb-3">
                <h6 className="text-muted mb-1">{t("userSettings.role", "Role")}</h6>
                <p className="mb-0">
                  <span className="badge bg-primary px-3 py-2">
                    {profile?.user?.role === "admin" ? <><i className="fas fa-user-tie me-1"></i> Admin</> :
                     profile?.user?.role === "group_admin" ? <><i className="fas fa-users me-1"></i> Group Admin</> :
                     <><i className="fas fa-user me-1"></i> Member</>}
                  </span>
                </p>
              </div>
              {profile?.user?.team_name && (
                <div className="mb-3">
                  <h6 className="text-muted mb-1">{t("userSettings.team", "Team")}</h6>
                  <p className="mb-0 fw-bold text-primary">{profile.user.team_name}</p>
                </div>
              )}
          </DecoratedCard>
        </div>

        {/* Password Change */}
        <div className="col-12">
          <DecoratedCard
            title={t("userSettings.passwordSettings", "Password Settings")}
            subtitle={t("userSettings.passwordDescription", "Change your account password")}
            icon={<i className="fas fa-lock fs-4"></i>}
            headerGradient="linear-gradient(135deg, #dc3545 0%, #fd7e14 100%)"
            shadow={true}
          >
              {passwordFeedback && (
                <Alert type={passwordFeedback.type} className="shadow-sm border-0 mb-4" icon={<></>}>
                  {passwordFeedback.message}
                </Alert>
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
                    <Input
                      type="password"
                      className="border-danger border-opacity-50"
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
                    <Input
                      type="password"
                      className="border-danger border-opacity-50"
                      value={formData.confirmPassword}
                      onChange={(e) => handleInputChange("confirmPassword", e.target.value)}
                      required
                      minLength={6}
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Button
                    type="submit"
                    variant="danger"
                    className="px-4 py-2"
                    disabled={changePasswordMutation.isLoading}
                    loading={changePasswordMutation.isLoading}
                  >
                    {changePasswordMutation.isLoading ? t("userSettings.changingPassword", "Changing Password...") : t("userSettings.changePassword", "Change Password")}
                  </Button>
                </div>
              </form>
          </DecoratedCard>
        </div>
      </div>
    </>
  );
}
