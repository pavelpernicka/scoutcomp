import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { PasswordChangeRequiredError, useAuth } from "../providers/AuthProvider";
import { useConfig } from "../providers/ConfigProvider";
import api from "../services/api";
import defaultAppIcon from "../assets/default-app-icon.svg";
import { normalizeUsernameInput, USERNAME_HELP, USERNAME_PATTERN } from "../utils/username";
import "./Login.css";

const extractErrorMessage = (error, fallback, t) => {
  const detail = error?.response?.data?.detail;
  if (!detail) return fallback;
  if (typeof detail === "string") {
    if (detail === "Invalid credentials") return t("login.invalidCredentials");
    if (detail === "Invalid current password") return t("login.passwordChange.invalidCurrentPassword");
    return detail;
  }
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (!item) return "";
        if (typeof item === "string") return item;
        const location = Array.isArray(item.loc)
          ? item.loc.filter((part) => part !== "body").join(".")
          : "";
        const message = item.msg || JSON.stringify(item);
        return location ? `${location}: ${message}` : message;
      })
      .filter(Boolean)
      .join("\n");
  }
  if (detail.msg) return detail.msg;
  return typeof detail === "object" ? JSON.stringify(detail) : fallback;
};

const applyLogoFallback = (event) => {
  const image = event.currentTarget;
  if (image.dataset.fallbackApplied === "true") return;
  image.dataset.fallbackApplied = "true";
  image.src = defaultAppIcon;
};

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, register, changePassword, isAuthenticated, isLoading } = useAuth();
  const { config } = useConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("login");
  const [loginState, setLoginState] = useState({ username: "", password: "", rememberMe: false });
  const [passwordChangeRequired, setPasswordChangeRequired] = useState(false);
  const [passwordChangeForm, setPasswordChangeForm] = useState({
    username: "",
    oldPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [memberForm, setMemberForm] = useState({
    username: "",
    realName: "",
    email: "",
    password: "",
    joinCode: "",
    preferredLanguage: "cs",
  });
  const [adminForm, setAdminForm] = useState({ username: "", realName: "", email: "", password: "" });
  const [loginError, setLoginError] = useState(null);
  const [passwordChangeError, setPasswordChangeError] = useState(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);
  const [isSubmittingPasswordChange, setIsSubmittingPasswordChange] = useState(false);
  const requestedDestination = location.state?.from;
  const returnTo = (
    typeof requestedDestination === "string"
    && requestedDestination.startsWith("/")
    && !requestedDestination.startsWith("//")
  ) ? requestedDestination : "/";

  const updateLoginField = (field, value) => {
    setLoginError(null);
    setLoginState((previous) => ({ ...previous, [field]: value }));
  };

  const { data: options } = useQuery({
    queryKey: ["auth", "options"],
    queryFn: async () => {
      const { data } = await api.get("/auth/options");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!options) return;
    if (activeTab === "member" && !options.allow_member_registration) setActiveTab("login");
    if (activeTab === "admin" && !options.allow_admin_bootstrap) setActiveTab("login");
  }, [activeTab, options]);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setIsSubmittingLogin(true);
    setLoginError(null);
    try {
      await login(loginState);
      navigate(returnTo, { replace: true });
    } catch (error) {
      if (error instanceof PasswordChangeRequiredError) {
        setPasswordChangeForm((previous) => ({
          ...previous,
          username: loginState.username,
          oldPassword: loginState.password,
        }));
        setPasswordChangeRequired(true);
      } else {
        setLoginError(extractErrorMessage(error, t("login.error"), t));
      }
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const handlePasswordChangeSubmit = async (event) => {
    event.preventDefault();
    if (passwordChangeForm.newPassword !== passwordChangeForm.confirmPassword) {
      setPasswordChangeError(t("login.passwordChange.passwordsDoNotMatch"));
      return;
    }
    setIsSubmittingPasswordChange(true);
    setPasswordChangeError(null);
    try {
      await changePassword({
        username: passwordChangeForm.username,
        oldPassword: passwordChangeForm.oldPassword,
        newPassword: passwordChangeForm.newPassword,
        rememberMe: loginState.rememberMe,
      });
      navigate(returnTo, { replace: true });
    } catch (error) {
      setPasswordChangeError(extractErrorMessage(error, t("login.passwordChange.changePasswordFailed"), t));
    } finally {
      setIsSubmittingPasswordChange(false);
    }
  };

  const memberRegistration = useMutation({
    mutationFn: async () => register({
      username: memberForm.username,
      real_name: memberForm.realName,
      email: memberForm.email || undefined,
      password: memberForm.password,
      join_code: memberForm.joinCode,
      preferred_language: memberForm.preferredLanguage,
    }),
    onSuccess: () => navigate("/"),
  });

  const adminRegistration = useMutation({
    mutationFn: async () => register({
      username: adminForm.username,
      real_name: adminForm.realName,
      email: adminForm.email || undefined,
      password: adminForm.password,
      role: "admin",
    }),
    onSuccess: () => navigate("/"),
  });

  if (isAuthenticated) {
    return <Navigate to={returnTo} replace />;
  }

  const appName = config?.app_name || "ScoutComp";
  const tabs = [
    { id: "login", label: t("login.tabs.login"), visible: true },
    { id: "member", label: t("login.tabs.registerMember"), visible: options?.allow_member_registration },
    { id: "admin", label: t("login.tabs.registerAdmin"), visible: options?.allow_admin_bootstrap },
  ].filter((tab) => tab.visible);
  const resetPasswordChange = () => {
    setPasswordChangeRequired(false);
    setPasswordChangeForm({ username: "", oldPassword: "", newPassword: "", confirmPassword: "" });
    setPasswordChangeError(null);
  };

  return (
    <main className="auth-page">
      <section className="auth-shell" aria-labelledby="auth-title">
        <div className="auth-brand-panel">
          <div className="auth-brand-lockup">
            <span className="auth-logo-frame">
              <img
                src={config?.app_icon || defaultAppIcon}
                alt=""
                onError={applyLogoFallback}
                className="auth-logo"
              />
            </span>
            <span className="auth-brand-name">{appName}</span>
          </div>
          <div className="auth-brand-copy">
            <p className="auth-eyebrow">{t("login.memberArea")}</p>
            <h1 id="auth-title">{t("login.welcome", { appName })}</h1>
            <p>{t("login.intro")}</p>
          </div>
          <div className="auth-brand-mark" aria-hidden="true">
            <i className="fas fa-compass" />
          </div>
        </div>

        <div className="auth-form-panel">
          <div className="auth-form-wrap">
            {passwordChangeRequired ? (
              <header className="auth-form-heading">
                <span className="auth-heading-icon" aria-hidden="true"><i className="fas fa-lock" /></span>
                <div>
                  <h2>{t("login.passwordChange.title")}</h2>
                  <p>{t("login.passwordChange.subtitle")}</p>
                </div>
              </header>
            ) : (
              <nav className="auth-tabs" aria-label={t("login.accountAction")}>
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={activeTab === tab.id ? "is-active" : ""}
                    aria-pressed={activeTab === tab.id}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setLoginError(null);
                      memberRegistration.reset();
                      adminRegistration.reset();
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </nav>
            )}

            {passwordChangeRequired && (
              <form className="auth-form" onSubmit={handlePasswordChangeSubmit}>
                <label className="auth-field" htmlFor="password-change-username">
                  <span>{t("login.passwordChange.username")}</span>
                  <input id="password-change-username" type="text" value={passwordChangeForm.username} disabled />
                </label>
                <label className="auth-field" htmlFor="password-change-current">
                  <span>{t("login.passwordChange.currentPassword")}</span>
                  <input
                    id="password-change-current"
                    type="password"
                    autoComplete="current-password"
                    value={passwordChangeForm.oldPassword}
                    onChange={(event) => setPasswordChangeForm((previous) => ({ ...previous, oldPassword: event.target.value }))}
                    disabled={isSubmittingPasswordChange}
                    required
                  />
                </label>
                <label className="auth-field" htmlFor="password-change-new">
                  <span>{t("login.passwordChange.newPassword")}</span>
                  <input
                    id="password-change-new"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("login.passwordChange.newPasswordPlaceholder")}
                    value={passwordChangeForm.newPassword}
                    onChange={(event) => setPasswordChangeForm((previous) => ({ ...previous, newPassword: event.target.value }))}
                    disabled={isSubmittingPasswordChange}
                    minLength={8}
                    required
                  />
                </label>
                <label className="auth-field" htmlFor="password-change-confirm">
                  <span>{t("login.passwordChange.confirmPassword")}</span>
                  <input
                    id="password-change-confirm"
                    type="password"
                    autoComplete="new-password"
                    placeholder={t("login.passwordChange.confirmPasswordPlaceholder")}
                    value={passwordChangeForm.confirmPassword}
                    onChange={(event) => setPasswordChangeForm((previous) => ({ ...previous, confirmPassword: event.target.value }))}
                    disabled={isSubmittingPasswordChange}
                    minLength={8}
                    required
                  />
                </label>
                {passwordChangeError && <div className="auth-alert" role="alert"><i className="fas fa-triangle-exclamation" aria-hidden="true" />{passwordChangeError}</div>}
                <button type="submit" className="auth-submit" disabled={isSubmittingPasswordChange}>
                  {isSubmittingPasswordChange && <span className="spinner-border spinner-border-sm" aria-hidden="true" />}
                  {isSubmittingPasswordChange ? t("login.passwordChange.submitting") : t("login.passwordChange.button")}
                </button>
                <button type="button" className="auth-back" onClick={resetPasswordChange}>
                  <i className="fas fa-arrow-left" aria-hidden="true" />{t("login.passwordChange.backToLogin")}
                </button>
              </form>
            )}

            {!passwordChangeRequired && activeTab === "login" && (
              <form className="auth-form" onSubmit={handleLoginSubmit}>
                <header className="auth-form-title">
                  <h2>{t("login.tabs.login")}</h2>
                  <p>{t("login.loginHint")}</p>
                </header>
                <label className="auth-field" htmlFor="login-username">
                  <span>{t("login.username")}</span>
                  <input
                    id="login-username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    placeholder={t("login.usernamePlaceholder")}
                    value={loginState.username}
                    onChange={(event) => updateLoginField("username", event.target.value)}
                    disabled={isSubmittingLogin || isLoading}
                    required
                  />
                </label>
                <label className="auth-field" htmlFor="login-password">
                  <span>{t("login.password")}</span>
                  <input
                    id="login-password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder={t("login.passwordPlaceholder")}
                    value={loginState.password}
                    onChange={(event) => updateLoginField("password", event.target.value)}
                    disabled={isSubmittingLogin || isLoading}
                    required
                  />
                </label>
                <label className="auth-check" htmlFor="login-remember-me">
                  <input
                    id="login-remember-me"
                    type="checkbox"
                    checked={loginState.rememberMe}
                    onChange={(event) => updateLoginField("rememberMe", event.target.checked)}
                    disabled={isSubmittingLogin || isLoading}
                  />
                  <span><strong>{t("login.rememberMe")}</strong><small>{t("login.rememberMeHint")}</small></span>
                </label>
                {loginError && <div className="auth-alert" role="alert"><i className="fas fa-triangle-exclamation" aria-hidden="true" />{loginError}</div>}
                <button type="submit" className="auth-submit" disabled={isSubmittingLogin || isLoading}>
                  {isSubmittingLogin && <span className="spinner-border spinner-border-sm" aria-hidden="true" />}
                  {isSubmittingLogin ? t("login.signingIn") : t("login.button")}
                </button>
              </form>
            )}

            {!passwordChangeRequired && activeTab === "member" && (
              <form className="auth-form" onSubmit={(event) => { event.preventDefault(); memberRegistration.mutate(); }}>
                <header className="auth-form-title">
                  <h2>{t("login.tabs.registerMember")}</h2>
                  <p>{t("login.registrationHint")}</p>
                </header>
                <label className="auth-field" htmlFor="member-realName"><span>{t("register.realName")}</span><input id="member-realName" name="realName" autoComplete="name" placeholder={t("register.realNamePlaceholder")} value={memberForm.realName} onChange={(event) => setMemberForm((previous) => ({ ...previous, realName: event.target.value }))} disabled={memberRegistration.isPending} required /></label>
                <label className="auth-field" htmlFor="member-username"><span>{t("register.username")}</span><input id="member-username" name="username" autoComplete="username" placeholder={t("register.usernamePlaceholder")} value={memberForm.username} pattern={USERNAME_PATTERN} title={USERNAME_HELP} onChange={(event) => setMemberForm((previous) => ({ ...previous, username: normalizeUsernameInput(event.target.value) }))} disabled={memberRegistration.isPending} required /></label>
                <label className="auth-field" htmlFor="member-email"><span>{t("register.email")} <small>({t("register.optional")})</small></span><input id="member-email" name="email" type="email" autoComplete="email" placeholder={t("register.emailPlaceholder")} value={memberForm.email} onChange={(event) => setMemberForm((previous) => ({ ...previous, email: event.target.value }))} disabled={memberRegistration.isPending} /></label>
                <label className="auth-field" htmlFor="member-password"><span>{t("register.password")}</span><input id="member-password" name="password" type="password" autoComplete="new-password" minLength={8} placeholder={t("register.passwordPlaceholder")} value={memberForm.password} onChange={(event) => setMemberForm((previous) => ({ ...previous, password: event.target.value }))} disabled={memberRegistration.isPending} required /></label>
                <label className="auth-field" htmlFor="member-join"><span>{t("register.joinCode")}</span><input id="member-join" name="joinCode" placeholder={t("register.joinCodePlaceholder")} value={memberForm.joinCode} onChange={(event) => setMemberForm((previous) => ({ ...previous, joinCode: event.target.value }))} disabled={memberRegistration.isPending} required /></label>
                <label className="auth-field" htmlFor="member-language"><span>{t("register.language")}</span><select id="member-language" name="preferredLanguage" value={memberForm.preferredLanguage} onChange={(event) => setMemberForm((previous) => ({ ...previous, preferredLanguage: event.target.value }))} disabled={memberRegistration.isPending}><option value="cs">{t("register.languageCs")}</option><option value="en">{t("register.languageEn")}</option></select></label>
                {memberRegistration.isError && <div className="auth-alert" role="alert"><i className="fas fa-triangle-exclamation" aria-hidden="true" />{extractErrorMessage(memberRegistration.error, t("register.error"), t)}</div>}
                <button type="submit" className="auth-submit" disabled={memberRegistration.isPending}>
                  {memberRegistration.isPending && <span className="spinner-border spinner-border-sm" aria-hidden="true" />}
                  {memberRegistration.isPending ? t("register.registering") : t("register.button")}
                </button>
              </form>
            )}

            {!passwordChangeRequired && activeTab === "admin" && (
              <form className="auth-form" onSubmit={(event) => { event.preventDefault(); adminRegistration.mutate(); }}>
                <header className="auth-form-title"><h2>{t("login.tabs.registerAdmin")}</h2><p>{t("register.adminHint")}</p></header>
                <label className="auth-field" htmlFor="admin-realName"><span>{t("register.realName")}</span><input id="admin-realName" name="realName" autoComplete="name" placeholder={t("register.realNamePlaceholder")} value={adminForm.realName} onChange={(event) => setAdminForm((previous) => ({ ...previous, realName: event.target.value }))} disabled={adminRegistration.isPending} required /></label>
                <label className="auth-field" htmlFor="admin-username"><span>{t("register.username")}</span><input id="admin-username" name="username" autoComplete="username" placeholder={t("register.usernamePlaceholder")} value={adminForm.username} pattern={USERNAME_PATTERN} title={USERNAME_HELP} onChange={(event) => setAdminForm((previous) => ({ ...previous, username: normalizeUsernameInput(event.target.value) }))} disabled={adminRegistration.isPending} required /></label>
                <label className="auth-field" htmlFor="admin-email"><span>{t("register.email")} <small>({t("register.optional")})</small></span><input id="admin-email" name="email" type="email" autoComplete="email" placeholder={t("register.emailPlaceholder")} value={adminForm.email} onChange={(event) => setAdminForm((previous) => ({ ...previous, email: event.target.value }))} disabled={adminRegistration.isPending} /></label>
                <label className="auth-field" htmlFor="admin-password"><span>{t("register.password")}</span><input id="admin-password" name="password" type="password" autoComplete="new-password" minLength={8} placeholder={t("register.passwordPlaceholder")} value={adminForm.password} onChange={(event) => setAdminForm((previous) => ({ ...previous, password: event.target.value }))} disabled={adminRegistration.isPending} required /></label>
                {adminRegistration.isError && <div className="auth-alert" role="alert"><i className="fas fa-triangle-exclamation" aria-hidden="true" />{extractErrorMessage(adminRegistration.error, t("register.error"), t)}</div>}
                <button type="submit" className="auth-submit auth-submit-admin" disabled={adminRegistration.isPending}>
                  {adminRegistration.isPending && <span className="spinner-border spinner-border-sm" aria-hidden="true" />}
                  {adminRegistration.isPending ? t("register.creatingAdmin") : t("register.adminButton")}
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
