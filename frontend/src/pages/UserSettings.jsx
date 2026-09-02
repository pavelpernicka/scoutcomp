import { useState, useEffect, useRef } from "react";
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
import UserAvatar from "../components/UserAvatar";
import PushNotificationSettings from "../components/PushNotificationSettings";
import PermissionGroupBadges from "../components/PermissionGroupBadges";
import { processAvatarFile } from "../utils/avatar";
import { normalizeUsernameInput, USERNAME_PATTERN } from "../utils/username";

export default function UserSettingsPage() {
  const { t, i18n } = useTranslation();
  const { profile, updateProfile, can } = useAuth();
  const canChangeUsername = can("core.users.credentials.manage");
  const queryClient = useQueryClient();
  const receiveMessages = profile?.user?.receive_messages !== false;
  const fileInputRef = useRef(null);

  const [feedback, setFeedback] = useState(null);
  const [passwordFeedback, setPasswordFeedback] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarError, setAvatarError] = useState(null);
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
      setFeedback({ type: "success", message: t("userSettings.profileUpdated") });
      queryClient.invalidateQueries(["users", "me"]);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("userSettings.updateFailed"),
      });
    },
  });

  const toggleMessagesMutation = useMutation({
    mutationFn: async (value) => {
      const { data } = await api.patch("/users/me", { receive_messages: value });
      return data;
    },
    onSuccess: (data) => {
      updateProfile({ receive_messages: data.user?.receive_messages });
      setFeedback({ type: "success", message: t("userSettings.profileUpdated") });
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("userSettings.updateFailed"),
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
      setPasswordFeedback({ type: "success", message: t("userSettings.passwordChanged") });
      setFormData(prev => ({
        ...prev,
        newPassword: "",
        confirmPassword: "",
      }));
    },
    onError: (error) => {
      setPasswordFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("userSettings.passwordChangeFailed"),
      });
    },
  });

  const avatarMutation = useMutation({
    mutationFn: async (avatar) => {
      const { data } = await api.patch(`/users/${profile?.user?.id}`, { avatar });
      return data;
    },
    onSuccess: (data) => {
      updateProfile({ avatar: data.avatar });
      setAvatarPreview(null);
      setAvatarError(null);
      setFeedback({ type: "success", message: t("userSettings.profileUpdated") });
      queryClient.invalidateQueries(["users", "me"]);
    },
    onError: (error) => {
      setFeedback({
        type: "danger",
        message: error?.response?.data?.detail || t("userSettings.updateFailed"),
      });
    },
  });

  const handleAvatarFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setAvatarError(t("userSettings.photoTooLarge"));
      return;
    }
    if (!file.type.startsWith("image/")) {
      setAvatarError(t("userSettings.photoInvalid"));
      return;
    }
    try {
      const dataUrl = await processAvatarFile(file);
      setAvatarPreview(dataUrl);
      setAvatarError(null);
    } catch (error) {
      setAvatarError(t("userSettings.photoInvalid"));
    }
  };

  const removeAvatar = () => {
    avatarMutation.mutate(null);
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleProfileSubmit = (e) => {
    e.preventDefault();
    const updateData = {
      ...(canChangeUsername ? { username: formData.username } : {}),
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
        message: t("userSettings.passwordMismatch"),
      });
      return;
    }

    if (formData.newPassword.length < 6) {
      setPasswordFeedback({
        type: "danger",
        message: t("userSettings.passwordTooShort"),
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
        title={t("userSettings.title")}
        subtitle={t("userSettings.subtitle")}
        icon={<i className="fas fa-cog text-white fs-1"></i>}
      >
      </HeroHeader>

      <div className="row g-4">
        {/* Profile Settings */}
        <div className="col-12 col-xl-8">
          <DecoratedCard
            title={t("userSettings.profileSettings")}
            subtitle={t("userSettings.profileDescription")}
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

              <div className="d-flex align-items-center gap-3 mb-4">
                <UserAvatar
                  user={{ ...profile?.user, avatar: avatarPreview || profile?.user?.avatar }}
                  size={96}
                  fallbackClass="bg-success"
                />
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="d-none"
                    onChange={handleAvatarFile}
                  />
                  <Button
                    variant="outline-success"
                    size="sm"
                    icon="fas fa-upload"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {t("userSettings.uploadPhoto")}
                  </Button>
                  {avatarPreview && (
                    <Button
                      variant="success"
                      size="sm"
                      icon="fas fa-check"
                      className="ms-2"
                      loading={avatarMutation.isLoading}
                      onClick={() => avatarMutation.mutate(avatarPreview)}
                    >
                      {t("userSettings.savePhoto")}
                    </Button>
                  )}
                  {!avatarPreview && profile?.user?.avatar && (
                    <Button
                      variant="outline-danger"
                      size="sm"
                      icon="fas fa-trash"
                      className="ms-2"
                      loading={avatarMutation.isLoading}
                      onClick={removeAvatar}
                    >
                      {t("userSettings.removePhoto")}
                    </Button>
                  )}
                  <div className="form-text mt-2">{t("userSettings.photoHint")}</div>
                  {avatarError && (
                    <Alert type="danger" className="shadow-sm border-0 mt-2" icon={<></>}>
                      {avatarError}
                    </Alert>
                  )}
                </div>
              </div>

              <form onSubmit={handleProfileSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.username")}
                    </label>
                    <Input
                      type="text"
                      className="border-success border-opacity-50"
                      value={formData.username}
                      onChange={(e) => handleInputChange("username", normalizeUsernameInput(e.target.value))}
                      pattern={USERNAME_PATTERN}
                      title={t("userSettings.usernameHelp")}
                      readOnly={!canChangeUsername}
                      required
                    />
              <div className="form-text">{canChangeUsername ? t("userSettings.usernameHelp") : t("userSettings.usernameAdminOnly")}</div>
                  </div>
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.email")}
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
                      {t("userSettings.language")}
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
                  <div className="col-md-6">
                    <div className="form-check form-switch mt-1">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        role="switch"
                        id="receiveMessagesToggle"
                        checked={receiveMessages}
                        disabled={toggleMessagesMutation.isPending}
                        onChange={(event) => toggleMessagesMutation.mutate(event.target.checked)}
                      />
                      <label className="form-check-label fw-medium" htmlFor="receiveMessagesToggle">
                        {t("userSettings.receiveMessages")}
                      </label>
                      <div className="form-text">{t("userSettings.receiveMessagesHint")}</div>
                    </div>
                  </div>
                  <div className="col-12">
                    <PushNotificationSettings />
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
                    {updateProfileMutation.isLoading ? t("userSettings.saving") : t("userSettings.saveProfile")}
                  </Button>
                </div>
              </form>
          </DecoratedCard>
        </div>

        {/* Account Info */}
        <div className="col-12 col-xl-4">
          <DecoratedCard
            title={t("userSettings.accountInfo")}
            subtitle={t("userSettings.accountDescription")}
            icon={<i className="fas fa-info-circle fs-4"></i>}
            headerGradient="linear-gradient(135deg, #17a2b8 0%, #20c997 100%)"
            shadow={true}
            className="h-100"
          >
              <div className="mb-3">
                <h6 className="text-muted mb-1">{t("userSettings.currentUsername")}</h6>
                <p className="mb-0 fw-bold">{profile?.user?.real_name || profile?.user?.username}</p>
              </div>
              <div className="mb-3">
                <h6 className="text-muted mb-1">{t("userSettings.permissionGroups")}</h6>
                <PermissionGroupBadges names={profile?.user?.permission_group_names} />
              </div>
              {profile?.user?.team_name && (
                <div className="mb-3">
                  <h6 className="text-muted mb-1">{t("userSettings.team")}</h6>
                  <p className="mb-0 fw-bold text-primary">{profile.user.team_name}</p>
                </div>
              )}
          </DecoratedCard>
        </div>

        {/* Password Change */}
        <div className="col-12">
          <DecoratedCard
            title={t("userSettings.passwordSettings")}
            subtitle={t("userSettings.passwordDescription")}
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
                <h6 className="mb-2 text-muted">{t("userSettings.passwordRequirements")}</h6>
                <ul className="mb-0 text-muted small">
                  <li>{t("userSettings.minLength")}</li>
                  <li>{t("userSettings.noCurrentPassword")}</li>
                </ul>
              </div>

              <form onSubmit={handlePasswordSubmit}>
                <div className="row g-3">
                  <div className="col-md-6">
                    <label className="form-label fw-medium d-flex align-items-center">
                      {t("userSettings.newPassword")}
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
                      {t("userSettings.confirmPassword")}
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
                    {changePasswordMutation.isLoading ? t("userSettings.changingPassword") : t("userSettings.changePassword")}
                  </Button>
                </div>
              </form>
          </DecoratedCard>
        </div>
      </div>
    </>
  );
}
