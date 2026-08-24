import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import api from "../services/api";
import Alert from "../components/Alert";
import AdminPageHeader from "../modules/web/admin/AdminPageHeader";
import { translateServerValue } from "../utils/serverTranslations";

const getErrorMessage = (error) => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || JSON.stringify(item)).join("; ");
  }
  return error?.message || "";
};

export default function AdminModules() {
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState(null);
  const [actionError, setActionError] = useState(null);

  const { data: modules = [] } = useQuery({
    queryKey: ["admin-modules"],
    queryFn: async () => (await api.get("/modules/all")).data,
  });

  const { data: detail = null } = useQuery({
    queryKey: ["admin-modules", "detail", selected?.code],
    queryFn: async () => (await api.get(`/modules/all/${selected.code}`)).data,
    enabled: Boolean(selected?.code),
  });

  const invalidate = () => {
    client.invalidateQueries({ queryKey: ["admin-modules"] });
    client.invalidateQueries({ queryKey: ["admin-modules", "detail", selected?.code] });
  };

  const patch = async (module, values) => {
    setActionError(null);
    try {
      await api.patch(`/modules/${module.code}`, values);
      invalidate();
    } catch (error) {
      setActionError(`${module.name}: ${getErrorMessage(error)}`);
    }
  };

  const filtered = useMemo(
    () =>
      modules.filter((m) =>
        `${m.name} ${m.code} ${m.description} ${(m.dependencies || []).join(" ")}`.toLowerCase().includes(search.toLowerCase())
      ),
    [modules, search]
  );

  const moduleByName = useMemo(() => new Map(modules.map((m) => [m.code, m])), [modules]);
  const moduleName = (module) => translateServerValue(t, i18n, module?.name_key, module?.name);
  const moduleDescription = (module) => translateServerValue(t, i18n, module?.description_key, module?.description);

  const statusInfo = (module) => {
    if (module.code === "core") return { label: t("adminModules.statusCore"), cls: "text-bg-primary" };
    if (module.installed && module.enabled) return { label: t("adminModules.statusActive"), cls: "text-bg-success" };
    if (module.installed) return { label: t("adminModules.statusDisabled"), cls: "text-bg-warning" };
    if (module.catalog) return { label: t("adminModules.statusNotInstalled"), cls: "text-bg-secondary" };
    return { label: t("adminModules.statusUnknown"), cls: "text-bg-dark" };
  };

  return (
    <div className="admin-modules-page">
      <AdminPageHeader title={t("adminModules.title")} description={t("adminModules.subtitle")} />
      {actionError && <Alert type="danger" toast onDismiss={() => setActionError("")}>{actionError}</Alert>}
      <div className="admin-modules-toolbar">
        <label className="visually-hidden" htmlFor="module-search">{t("adminModules.searchPlaceholder")}</label>
        <div className="input-group">
          <span className="input-group-text"><i className="fas fa-magnifying-glass" aria-hidden="true" /></span>
          <input
            id="module-search"
            className="form-control"
            placeholder={t("adminModules.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>{t("adminModules.columnModule")}</th>
                <th>{t("adminModules.columnStatus")}</th>
                <th>{t("adminModules.columnDependencies")}</th>
                <th>{t("adminModules.columnDependents")}</th>
                <th>{t("adminModules.columnVersion")}</th>
                <th className="text-end">{t("adminModules.columnActions")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((module) => {
                const status = statusInfo(module);
                const deps = (module.dependencies || []).map((code) => moduleByName.get(code)).filter(Boolean);
                return (
                  <tr key={module.code}>
                    <td>
                      <button
                        type="button"
                        className="btn btn-link p-0 text-start text-decoration-none"
                        onClick={() => setSelected(module)}
                      >
                        <i className={`fas ${module.metadata?.icon || "fa-puzzle-piece"} text-primary me-2`}></i>
                        <strong>{moduleName(module)}</strong>
                      </button>
                      <code className="ms-2 text-muted">{module.code}</code>
                      <div className="small text-muted">{moduleDescription(module)}</div>
                    </td>
                    <td>
                      <span className={`badge ${status.cls}`}>{status.label}</span>
                    </td>
                    <td>
                      {deps.length === 0 ? (
                        <span className="text-muted small">—</span>
                      ) : (
                        <div className="d-flex flex-wrap gap-1">
                          {deps.map((dep) => (
                            <span key={dep.code} className={`badge ${dep.installed && dep.enabled ? "text-bg-light border text-dark" : "text-bg-danger"}`}>
                              {moduleName(dep)}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {(module.dependents || []).length > 0 ? (
                        <div className="d-flex flex-wrap gap-1">
                          {module.dependents.map((code) => (
                            <span key={code} className="badge text-bg-light border text-dark">
                              {moduleName(moduleByName.get(code)) || code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted small">—</span>
                      )}
                    </td>
                    <td className="small text-muted">{module.metadata?.version || module.version || "—"}</td>
                    <td className="text-end">
                      <div className="d-inline-flex gap-2 flex-wrap justify-content-end">
                        {module.code !== "core" && (
                          <>
                            <button
                              className={`btn btn-sm ${module.installed ? "btn-outline-secondary" : "btn-primary"}`}
                              onClick={() => patch(module, { installed: !module.installed })}
                              disabled={module.code === "core"}
                            >
                              {module.installed ? t("adminModules.uninstall") : t("adminModules.install")}
                            </button>
                            <button
                              disabled={!module.installed}
                              className={`btn btn-sm ${module.enabled ? "btn-outline-danger" : "btn-success"}`}
                              onClick={() => patch(module, { enabled: !module.enabled })}
                            >
                              {module.enabled ? t("adminModules.disable") : t("adminModules.enable")}
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-primary"
                          onClick={() => setSelected(module)}
                        >
                          {t("adminModules.details")}
                        </button>
                        {module.installed && (
                          <Link className="btn btn-sm btn-outline-primary" to={`/admin/modules/${module.code}`}>
                            {t("adminModules.settings")}
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {detail && selected && (
        <>
          <div
            className="modal fade show d-block"
            role="dialog"
            tabIndex="-1"
            onClick={() => setSelected(null)}
          >
            <div className="modal-dialog modal-lg modal-dialog-centered" onClick={(event) => event.stopPropagation()}>
              <div className="modal-content">
                <div className="modal-header">
                  <h5 className="modal-title">
                    <i className={`fas ${detail.metadata?.icon || "fa-puzzle-piece"} text-primary me-2`}></i>
                    {moduleName(detail)} <code className="ms-2 text-muted">{detail.code}</code>
                  </h5>
                  <button type="button" className="btn-close" aria-label="Close" onClick={() => setSelected(null)}></button>
                </div>
                <div className="modal-body">
                  <p className="text-muted">{moduleDescription(detail)}</p>
                  <div className="row g-3">
                    <div className="col-12 col-md-6">
                      <h6 className="fw-semibold">{t("adminModules.detailStatus")}</h6>
                      <div className="d-flex gap-2 flex-wrap">
                        <span className={`badge ${statusInfo(detail).cls}`}>{statusInfo(detail).label}</span>
                        {detail.catalog && <span className="badge text-bg-light border text-dark">{t("adminModules.inCatalog")}</span>}
                        <span className="badge text-bg-light border text-dark">{t("adminModules.versionLabel", { version: detail.metadata?.version || detail.version })}</span>
                      </div>
                    </div>
                    <div className="col-12 col-md-6">
                      <h6 className="fw-semibold">{t("adminModules.detailMetadata")}</h6>
                      <ul className="small mb-0">
                        <li>{t("adminModules.route")}: <code>{detail.metadata?.route || "—"}</code></li>
                        <li>{t("adminModules.routers")}: {detail.metadata?.router_count ?? 0}</li>
                        <li>{t("adminModules.apiPrefixes")}: {(detail.metadata?.api_prefixes || []).length}</li>
                        <li>{t("adminModules.menuItems")}: {detail.metadata?.menu_items ?? 0} · {t("adminModules.adminMenuItems")}: {detail.metadata?.admin_menu_items ?? 0} · {t("adminModules.widgets")}: {detail.metadata?.widget_count ?? 0}</li>
                      </ul>
                    </div>
                    <div className="col-12 col-md-6">
                      <h6 className="fw-semibold">{t("adminModules.detailDependencies")}</h6>
                      {detail.dependencies?.length ? (
                        <ul className="small mb-0">
                          {detail.dependencies.map((code) => {
                            const dep = moduleByName.get(code);
                            return (
                              <li key={code}>
                                {dep ? (
                                  <>
                                    {dep.name} <code>{code}</code>
                                    {(!dep.installed || !dep.enabled) && (
                                      <span className="badge text-bg-danger ms-2">{t("adminModules.statusInactive")}</span>
                                    )}
                                  </>
                                ) : (
                                  <code>{code}</code>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : (
                        <span className="text-muted small">{t("adminModules.none")}</span>
                      )}
                    </div>
                    <div className="col-12 col-md-6">
                      <h6 className="fw-semibold">{t("adminModules.detailDependents")}</h6>
                      {detail.dependents?.length ? (
                        <div className="d-flex flex-wrap gap-1">
                          {detail.dependents.map((code) => (
                            <span key={code} className="badge text-bg-light border text-dark">
                              {moduleByName.get(code)?.name || code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted small">{t("adminModules.none")}</span>
                      )}
                    </div>
                    <div className="col-12">
                      <h6 className="fw-semibold">{t("adminModules.detailPermissions", { count: detail.permissions?.length || 0 })}</h6>
                      {detail.permissions?.length ? (
                        <div className="table-responsive" style={{ maxHeight: "260px" }}>
                          <table className="table table-sm align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>{t("adminModules.permissionAction")}</th>
                                <th>{t("adminModules.permissionName")}</th>
                                <th>{t("adminModules.permissionDescription")}</th>
                                <th>{t("adminModules.permissionScope")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.permissions.map((permission) => (
                                <tr key={permission.action}>
                                  <td><code>{permission.action}</code></td>
                                  <td>{permission.name}</td>
                                  <td className="small text-muted">{permission.description}</td>
                                  <td>
                                    <span className="badge text-bg-light border text-dark">
                                      {(permission.scopes || []).join(", ")}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <span className="text-muted small">{t("adminModules.noPermissions")}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setSelected(null)}>
                    {t("adminModules.close")}
                  </button>
                  {detail.installed && (
                    <Link className="btn btn-outline-primary" to={`/admin/modules/${detail.code}`}>
                      {t("adminModules.settings")}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop fade show"></div>
        </>
      )}
    </div>
  );
}
