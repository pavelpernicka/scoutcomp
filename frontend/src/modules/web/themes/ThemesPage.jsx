import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import MediaPreview from "../media/MediaPreview";

import LoadingSpinner from "../../../components/LoadingSpinner";
import AdminPageHeader from "../admin/AdminPageHeader";
import { cmsApi } from "../api/cms";

export default function ThemesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [error, setError] = useState("");
  const [duplicating, setDuplicating] = useState(null);
  const [duplicateName, setDuplicateName] = useState("");
  const themesQuery = useQuery({ queryKey: ["web", "themes"], queryFn: cmsApi.listThemes });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["web", "themes"] });
  const mutationOptions = { onSuccess: () => { setError(""); invalidate(); }, onError: (requestError) => setError(requestError?.response?.data?.detail || t("web.errors.themeAction")) };
  const install = useMutation({ mutationFn: cmsApi.installTheme, ...mutationOptions });
  const activate = useMutation({ mutationFn: cmsApi.activateTheme, ...mutationOptions });
  const uninstall = useMutation({ mutationFn: cmsApi.uninstallTheme, ...mutationOptions });
  const duplicate = useMutation({
    mutationFn: ({ id, name }) => cmsApi.duplicateTheme(id, name),
    onSuccess: () => { setDuplicating(null); setDuplicateName(""); invalidate(); },
    onError: (requestError) => { setError(requestError?.response?.data?.detail || t("web.errors.themeAction")); setDuplicating(null); },
  });
  const download = useMutation({
    mutationFn: async ({ id, name }) => {
      const blob = await cmsApi.downloadTheme(id);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${name.replace(/[^a-zA-Z0-9._-]/g, "_")}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    },
  });
  const themes = Array.isArray(themesQuery.data) ? themesQuery.data : themesQuery.data?.items || [];

  return <section>
    <AdminPageHeader title={t("web.nav.themes")} description={t("web.themesDescription")} action={<><input ref={inputRef} className="visually-hidden" type="file" accept=".zip,application/zip" onChange={(e) => { const file = e.target.files?.[0]; if (file) install.mutate(file); e.target.value = ""; }} /><button className="btn btn-primary" type="button" disabled={install.isPending} onClick={() => inputRef.current?.click()}><i className="fas fa-box-open me-2" />{install.isPending ? t("web.states.installing") : t("web.commands.installTheme")}</button></>} />
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    <div className="web-security-note"><i className="fas fa-shield-halved" /><span><strong>{t("web.themePackagesDeclarative")}</strong>{t("web.themeSecurityDescription")}</span></div>
    {themesQuery.isLoading ? <LoadingSpinner /> : themes.length === 0 ? <div className="web-admin-empty"><i className="fas fa-palette" /><h3>{t("web.empty.themesTitle")}</h3><p>{t("web.empty.themesBody")}</p></div> : <div className="web-theme-grid">{themes.map((theme) => { const versionPreview = (theme.versions || []).find((v) => v.preview_url); const previewUrl = theme.preview_url || versionPreview?.preview_url; const versionId = theme.versions?.[0]?.id || theme.id; return <article key={theme.id || theme.theme_id} className={`web-theme-card ${(theme.versions || []).some((v) => v.active) ? "active" : ""}`}>{previewUrl ? <MediaPreview src={previewUrl} alt="" /> : <div className="web-theme-placeholder"><i className="fas fa-window-maximize" /></div>}<div className="web-theme-body"><div><h3>{theme.name}</h3><p>{theme.description || t("web.noDescription")}</p></div><dl><div><dt>{t("web.version")}</dt><dd>{theme.versions?.[0]?.version || "—"}</dd></div><div><dt>{t("web.author")}</dt><dd>{theme.author || "—"}</dd></div></dl><div className="web-theme-actions">{(theme.versions || []).some((v) => v.active) ? <span className="web-status published"><i className="fas fa-check" />{t("web.states.active")}</span> : <button type="button" className="btn btn-sm btn-primary" disabled={activate.isPending} onClick={() => activate.mutate(versionId)}>{t("web.commands.activate")}</button>}<button type="button" className="btn btn-sm btn-outline-secondary" title={t("web.downloadTheme")} onClick={() => download.mutate({ id: versionId, name: theme.name })}><i className="fas fa-download" /></button><button type="button" className="btn btn-sm btn-outline-secondary" title={t("web.duplicateTheme")} onClick={() => { setDuplicating(theme.id); setDuplicateName(`${theme.name} (kopie)`); }}><i className="fas fa-copy" /></button><button type="button" className="btn btn-sm btn-outline-danger" disabled={(theme.versions || []).some((v) => v.active) || uninstall.isPending} onClick={() => { if (window.confirm(t("web.confirmUninstallTheme"))) uninstall.mutate(versionId); }}>{t("web.commands.uninstall")}</button></div></div></article>; })}</div>}
    {duplicating && <div className="modal d-block" role="dialog" aria-modal="true" tabIndex="-1"><div className="modal-dialog"><form className="modal-content" onSubmit={(e) => { e.preventDefault(); if (duplicateName.trim()) duplicate.mutate({ id: duplicating, name: duplicateName.trim() }); }}><div className="modal-header"><h2 className="modal-title fs-5">{t("web.duplicateTheme")}</h2><button type="button" className="btn-close" aria-label={t("web.close")} onClick={() => { setDuplicating(null); setDuplicateName(""); }} /></div><div className="modal-body"><label className="form-label"><span>{t("web.fields.name")}</span><input className="form-control" autoFocus value={duplicateName} onChange={(e) => setDuplicateName(e.target.value)} /></label></div><div className="modal-footer"><button type="button" className="btn btn-outline-secondary" onClick={() => { setDuplicating(null); setDuplicateName(""); }}>{t("web.cancel")}</button><button type="submit" className="btn btn-primary" disabled={!duplicateName.trim() || duplicate.isPending}>{t("web.duplicate")}</button></div></form></div></div>}
  </section>;
}
