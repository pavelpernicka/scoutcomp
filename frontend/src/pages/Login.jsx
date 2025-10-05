import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "@tanstack/react-query";

import { useAuth } from "../providers/AuthProvider";
import { useConfig } from "../providers/ConfigProvider";
import api from "../services/api";

const extractErrorMessage = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (!detail) {
    return fallback;
  }
  if (typeof detail === "string") {
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
  if (detail.msg) {
    return detail.msg;
  }
  return typeof detail === "object" ? JSON.stringify(detail) : fallback;
};

export default function LoginPage() {
  const { t } = useTranslation();
  const { login, register, isAuthenticated, isLoading } = useAuth();
  const { config } = useConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("login");
  const [loginState, setLoginState] = useState({ username: "", password: "" });
  const [memberForm, setMemberForm] = useState({
    username: "",
    email: "",
    password: "",
    joinCode: "",
    preferredLanguage: "cs",
  });
  const [adminForm, setAdminForm] = useState({
    username: "",
    email: "",
    password: "",
  });

  const { data: options } = useQuery({
    queryKey: ["auth", "options"],
    queryFn: async () => {
      const { data } = await api.get("/auth/options");
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });

useEffect(() => {
  // --- your existing logic ---
  if (!options) {
    return;
  }
  if (activeTab === "member" && !options.allow_member_registration) {
    setActiveTab("login");
  }
  if (activeTab === "admin" && !options.allow_admin_bootstrap) {
    setActiveTab("login");
  }

  // --- strip classes + maxWidth from <main> ---
  const mainEl = document.querySelector("main");
  let oldClassName, oldMaxWidth;
  if (mainEl) {
    oldClassName = mainEl.className;
    oldMaxWidth = mainEl.style.maxWidth;

    mainEl.className = "";
    mainEl.style.maxWidth = "";
  }

  // --- hide the login button ---
  const loginButton = document.querySelector('a[href="/login"]');
  let oldDisplay;
  if (loginButton) {
    oldDisplay = loginButton.style.display;
    loginButton.style.display = "none";
  }

  // --- cleanup: restore everything ---
  return () => {
    if (mainEl) {
      mainEl.className = oldClassName;
      mainEl.style.maxWidth = oldMaxWidth;
    }
    if (loginButton) {
      loginButton.style.display = oldDisplay;
    }
  };
}, [options, activeTab]);

  

  if (isAuthenticated) {
    const redirectTo = location.state?.from ?? "/";
    return <Navigate to={redirectTo} replace />;
  }

  const [loginError, setLoginError] = useState(null);
  const [isSubmittingLogin, setIsSubmittingLogin] = useState(false);

  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    setIsSubmittingLogin(true);
    setLoginError(null);
    try {
      await login(loginState);
      navigate("/");
    } catch (error) {
      setLoginError(extractErrorMessage(error, t("login.error")));
    } finally {
      setIsSubmittingLogin(false);
    }
  };

  const memberRegistration = useMutation({
    mutationFn: async () =>
      register({
        username: memberForm.username,
        email: memberForm.email,
        password: memberForm.password,
        join_code: memberForm.joinCode,
        preferred_language: memberForm.preferredLanguage,
      }),
    onSuccess: () => {
      navigate("/");
    },
  });

  const adminRegistration = useMutation({
    mutationFn: async () =>
      register({
        username: adminForm.username,
        email: adminForm.email,
        password: adminForm.password,
        role: "admin",
      }),
    onSuccess: () => {
      navigate("/");
    },
  });

  const tabButtons = useMemo(() => {
    const baseClass = "nav-link px-4 py-2 fw-semibold";
    return (
      <ul className="nav nav-pills justify-content-center mb-4 bg-light rounded p-1" role="tablist">
        <li className="nav-item" role="presentation">
          <button
            type="button"
            className={`${baseClass} ${activeTab === "login" ? "active" : ""}`}
            role="tab"
            aria-selected={activeTab === "login"}
            id="tab-login"
            aria-controls="panel-login"
            onClick={() => setActiveTab("login")}
          >
            {t("login.tabs.login")}
          </button>
        </li>
        {options?.allow_member_registration && (
          <li className="nav-item" role="presentation">
            <button
              type="button"
              className={`${baseClass} ${activeTab === "member" ? "active" : ""}`}
              role="tab"
              aria-selected={activeTab === "member"}
              id="tab-member"
              aria-controls="panel-member"
              onClick={() => setActiveTab("member")}
            >
              {t("login.tabs.registerMember")}
            </button>
          </li>
        )}
        {options?.allow_admin_bootstrap && (
          <li className="nav-item" role="presentation">
            <button
              type="button"
              className={`${baseClass} ${activeTab === "admin" ? "active" : ""}`}
              role="tab"
              aria-selected={activeTab === "admin"}
              id="tab-admin"
              aria-controls="panel-admin"
              onClick={() => setActiveTab("admin")}
            >
              {t("login.tabs.registerAdmin")}
            </button>
          </li>
        )}
      </ul>
    );
  }, [activeTab, options, t]);
  
  

  return (
    <div className="min-vh-100 d-flex align-items-center" style={{ background: 'linear-gradient(145deg, #673AB7 0%, #009688 100%)' }}>
      <div className="container">
        <div className="row justify-content-center">
          <div className="col-12 col-md-8 col-lg-6 col-xl-5 col-xxl-4">
            {/* Welcome Header */}
            <div className="text-center text-white mb-4">
              <h1 className="display-5 fw-bold mb-2">🏕️ {config?.app_name || "ScoutComp"}</h1>
              <p className="fs-5 opacity-90">{t("login.welcome", "Welcome to Scout Competition")}</p>
            </div>

            <div className="card shadow-lg border-0">
              <div className="card-body p-4">
              {tabButtons}

              <div className="tab-content">
                <div
                  className={`tab-pane fade ${activeTab === "login" ? "show active" : ""}`}
                  role="tabpanel"
                  aria-labelledby="tab-login"
                  id="panel-login"
                >
                  {activeTab === "login" && (
                    <form className="row g-4" onSubmit={handleLoginSubmit}>
                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="login-username">
                          {t("login.username", "Username")}
                        </label>
                        <input
                          id="login-username"
                          name="username"
                          type="text"
                          className="form-control form-control-lg"
                          autoComplete="username"
                          placeholder={t("login.usernamePlaceholder", "Enter your username")}
                          value={loginState.username}
                          onChange={(event) =>
                            setLoginState((prev) => ({ ...prev, username: event.target.value }))
                          }
                          disabled={isSubmittingLogin || isLoading}
                          required
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="login-password">
                          {t("login.password", "Password")}
                        </label>
                        <input
                          id="login-password"
                          name="password"
                          type="password"
                          className="form-control form-control-lg"
                          autoComplete="current-password"
                          placeholder={t("login.passwordPlaceholder", "Enter your password")}
                          value={loginState.password}
                          onChange={(event) =>
                            setLoginState((prev) => ({ ...prev, password: event.target.value }))
                          }
                          disabled={isSubmittingLogin || isLoading}
                          required
                        />
                      </div>

                      {loginError && (
                        <div className="col-12">
                          <div className="alert alert-danger border-0 shadow-sm" role="alert">
                            <div className="d-flex align-items-center">
                              <i className="fas fa-exclamation-triangle text-warning me-2"></i>
                              {loginError}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="col-12 d-grid">
                        <button
                          type="submit"
                          className="btn btn-primary btn-lg fw-semibold py-3"
                          style={{ background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', border: 'none' }}
                          disabled={isSubmittingLogin || isLoading}
                        >
                          {isSubmittingLogin ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                              {t("login.signingIn", "Signing in...")}
                            </>
                          ) : (
                            t("login.button", "Sign In")
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div
                  className={`tab-pane fade ${activeTab === "member" ? "show active" : ""}`}
                  role="tabpanel"
                  aria-labelledby="tab-member"
                  id="panel-member"
                >
                  {activeTab === "member" && (
                    <form
                      className="row g-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        memberRegistration.mutate();
                      }}
                    >
                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="member-username">
                          {t("register.username", "Username")}
                        </label>
                        <input
                          id="member-username"
                          className="form-control form-control-lg"
                          placeholder={t("register.usernamePlaceholder", "Choose a username")}
                          value={memberForm.username}
                          onChange={(event) =>
                            setMemberForm((prev) => ({ ...prev, username: event.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="member-email">
                          {t("register.email", "Email")}
                        </label>
                        <input
                          id="member-email"
                          className="form-control form-control-lg"
                          type="email"
                          placeholder={t("register.emailPlaceholder", "Enter your email address")}
                          value={memberForm.email}
                          onChange={(event) =>
                            setMemberForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="member-password">
                          {t("register.password", "Password")}
                        </label>
                        <input
                          id="member-password"
                          className="form-control form-control-lg"
                          type="password"
                          placeholder={t("register.passwordPlaceholder", "Create a secure password")}
                          value={memberForm.password}
                          onChange={(event) =>
                            setMemberForm((prev) => ({ ...prev, password: event.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="member-join">
                          {t("register.joinCode", "Join Code")}
                        </label>
                        <input
                          id="member-join"
                          className="form-control form-control-lg"
                          placeholder={t("register.joinCodePlaceholder", "Enter the team join code")}
                          value={memberForm.joinCode}
                          onChange={(event) =>
                            setMemberForm((prev) => ({ ...prev, joinCode: event.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="member-language">
                          {t("register.language", "Language")}
                        </label>
                        <select
                          id="member-language"
                          className="form-select form-select-lg"
                          value={memberForm.preferredLanguage}
                          onChange={(event) =>
                            setMemberForm((prev) => ({ ...prev, preferredLanguage: event.target.value }))
                          }
                        >
                          <option value="cs">{t("register.languageCs", "Czech")}</option>
                          <option value="en">{t("register.languageEn", "English")}</option>
                        </select>
                      </div>

                      {memberRegistration.isError && (
                        <div className="col-12">
                          <div className="alert alert-danger border-0 shadow-sm" role="alert">
                            <div className="d-flex align-items-center">
                              <i className="fas fa-exclamation-triangle text-warning me-2"></i>
                              {extractErrorMessage(memberRegistration.error, t("register.error", "Registration failed"))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="col-12 d-grid">
                        <button
                          type="submit"
                          className="btn btn-success btn-lg fw-semibold py-3"
                          disabled={memberRegistration.isLoading}
                        >
                          {memberRegistration.isLoading ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                              {t("register.registering", "Creating account...")}
                            </>
                          ) : (
                            t("register.button", "Create Member Account")
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                <div
                  className={`tab-pane fade ${activeTab === "admin" ? "show active" : ""}`}
                  role="tabpanel"
                  aria-labelledby="tab-admin"
                  id="panel-admin"
                >
                  {activeTab === "admin" && (
                    <form
                      className="row g-4"
                      onSubmit={(event) => {
                        event.preventDefault();
                        adminRegistration.mutate();
                      }}
                    >
                      <div className="col-12">
                        <div className="alert alert-info border-0 shadow-sm">
                          <div className="d-flex align-items-center">
                            <i className="fas fa-info-circle text-info me-2"></i>
                            {t("register.adminHint", "Create the first administrator account for this system")}
                          </div>
                        </div>
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="admin-username">
                          {t("register.username", "Username")}
                        </label>
                        <input
                          id="admin-username"
                          className="form-control form-control-lg"
                          placeholder={t("register.usernamePlaceholder", "Choose a username")}
                          value={adminForm.username}
                          onChange={(event) =>
                            setAdminForm((prev) => ({ ...prev, username: event.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="admin-email">
                          {t("register.email", "Email")}
                        </label>
                        <input
                          id="admin-email"
                          className="form-control form-control-lg"
                          type="email"
                          placeholder={t("register.emailPlaceholder", "Enter your email address")}
                          value={adminForm.email}
                          onChange={(event) =>
                            setAdminForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                          required
                        />
                      </div>

                      <div className="col-12">
                        <label className="form-label fw-semibold" htmlFor="admin-password">
                          {t("register.password", "Password")}
                        </label>
                        <input
                          id="admin-password"
                          className="form-control form-control-lg"
                          type="password"
                          placeholder={t("register.passwordPlaceholder", "Create a secure password")}
                          value={adminForm.password}
                          onChange={(event) =>
                            setAdminForm((prev) => ({ ...prev, password: event.target.value }))
                          }
                          required
                        />
                      </div>

                      {adminRegistration.isError && (
                        <div className="col-12">
                          <div className="alert alert-danger border-0 shadow-sm" role="alert">
                            <div className="d-flex align-items-center">
                              <i className="fas fa-exclamation-triangle text-warning me-2"></i>
                              {extractErrorMessage(adminRegistration.error, t("register.error", "Registration failed"))}
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="col-12 d-grid">
                        <button
                          type="submit"
                          className="btn btn-warning btn-lg fw-semibold py-3"
                          disabled={adminRegistration.isLoading}
                        >
                          {adminRegistration.isLoading ? (
                            <>
                              <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                              {t("register.creatingAdmin", "Creating admin account...")}
                            </>
                          ) : (
                            t("register.adminButton", "Create Admin Account")
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    </div>
  );
}
