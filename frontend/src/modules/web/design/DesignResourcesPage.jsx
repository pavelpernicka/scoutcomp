import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import MediaPreview from "../media/MediaPreview";
import { useNavigate } from "react-router-dom";
import PropTypes from "prop-types";

import LoadingSpinner from "../../../components/LoadingSpinner";
import AdminPageHeader from "../admin/AdminPageHeader";
import { cmsApi } from "../api/cms";
import DesignNav from "./DesignNav";

const emptyProject = { scoutcomp: { schemaVersion: 2 }, pages: [{ id: "main", frames: [{ id: "main", component: { type: "wrapper", components: [] }, styles: [] }] }] };

export default function DesignResourcesPage({ kind }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const endpointKind = kind;
  const queryKey = ["web", "design", endpointKind];
  const createRequest = kind === "templates" ? cmsApi.createTemplate : (payload) => cmsApi.createDesignResource(endpointKind, payload);
  const deleteRequest = kind === "templates" ? cmsApi.deleteTemplate : (id) => cmsApi.deleteDesignResource(endpointKind, id);

  // The editor always shows resources from the active theme only.
  const canvasStylesQuery = useQuery({ queryKey: ["web", "canvas-styles"], queryFn: cmsApi.getCanvasStyles, retry: 1 });
  const activeThemeId = canvasStylesQuery.data?.active_theme_version_id ?? null;

  const resourcesQuery = useQuery({
    queryKey: [...queryKey, { theme: activeThemeId }],
    queryFn: () => kind === "templates"
      ? cmsApi.listTemplates()
      : cmsApi.listDesignResources(endpointKind, activeThemeId ? { theme_version_id: activeThemeId } : undefined),
  });
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey });
    queryClient.invalidateQueries({ queryKey: ["web", "canvas-styles"] });
  };
  const create = useMutation({ mutationFn: () => {
    const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    return createRequest(kind === "templates"
      ? { name: name.trim(), key, project_data: emptyProject }
      : { name: name.trim(), qualified_key: `site:${key}`, project_data: emptyProject });
  }, onSuccess: (resource) => {
    setName("");
    setCreating(false);
    invalidate();
    navigate(`/admin/web/design/${kind}/${resource.id}/editor`);
  } });
  const remove = useMutation({ mutationFn: deleteRequest, onSuccess: invalidate });
  const resources = Array.isArray(resourcesQuery.data) ? resourcesQuery.data : resourcesQuery.data?.items || [];

  return <section>
    <DesignNav />
    <AdminPageHeader title={t(`web.design.${kind}`)} description={t(`web.designDescriptions.${kind}`)} action={<button type="button" className="btn btn-primary" onClick={() => setCreating(true)}><i className="fas fa-plus me-2" />{t("web.commands.createResource")}</button>} />
    {creating && <form className="web-inline-create" onSubmit={(event) => { event.preventDefault(); if (name.trim()) create.mutate(); }}><label htmlFor="resource-name">{t("web.fields.name")}</label><input id="resource-name" autoFocus className="form-control" value={name} onChange={(event) => setName(event.target.value)} /><button className="btn btn-primary" disabled={!name.trim() || create.isPending}>{t("web.create")}</button><button type="button" className="btn btn-link" onClick={() => setCreating(false)}>{t("web.cancel")}</button></form>}
    {resourcesQuery.isLoading ? <LoadingSpinner /> : resources.length === 0 ? <div className="web-admin-empty"><i className="fas fa-shapes" /><h3>{t("web.empty.resourcesTitle")}</h3><p>{t("web.empty.resourcesBody")}</p></div> : <div className="web-resource-grid">{resources.map((resource) => {
      const installed = Boolean(resource.is_locked || resource.theme_version_id);
      const previewUrl = resource.preview_url || (resource.preview_media_id ? `/api/web/media/${resource.preview_media_id}/file` : null);
      const icon = kind === "components" ? "fa-layer-group" : "fa-layer-group";
      return <article key={resource.id} className="web-resource-item"><div className="web-resource-preview">{previewUrl ? <MediaPreview src={previewUrl} alt="" /> : <i className={`fas ${icon}`} />}</div><div><h3>{resource.name}</h3><p>{resource.description || t(`web.resourceKinds.${kind}`)}</p><span>{installed ? t("web.states.fromTheme") : t("web.states.siteLocal")}</span></div><div className="d-flex gap-1"><button type="button" className="btn btn-sm btn-outline-primary" title={t("web.edit")} onClick={() => navigate(`/admin/web/design/${kind}/${resource.id}/editor`)}><i className={`fas ${installed ? "fa-eye" : "fa-pen"}`} /></button>{!installed && !resource.is_system && <button type="button" className="btn btn-sm btn-outline-danger" title={t("web.delete")} onClick={() => { if (window.confirm(t("web.confirmDeleteResource"))) remove.mutate(resource.id); }}><i className="fas fa-trash" /></button>}</div></article>;
    })}</div>}
  </section>;
}

DesignResourcesPage.propTypes = { kind: PropTypes.oneOf(["templates", "components", "sections"]).isRequired };
