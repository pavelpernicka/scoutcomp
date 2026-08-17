import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import AdminPageHeader from "../admin/AdminPageHeader";
import Alert from "../../../components/Alert";
import { cmsApi, displayPagePath } from "../api/cms";
import { filterCatalogResources } from "../editor/resourceBlocks";

const slugify = (value) => (value || "")
  .toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "page";

export default function PagesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [parentId, setParentId] = useState("");
  const [sourceTemplateId, setSourceTemplateId] = useState("");
  const [position, setPosition] = useState(0);
  const [error, setError] = useState("");
  const [view, setView] = useState("all");

  const pagesQuery = useQuery({ queryKey: ["web", "pages"], queryFn: cmsApi.listPages });
  const trashQuery = useQuery({ queryKey: ["web", "pages", "trash"], queryFn: cmsApi.listTrash, enabled: view === "trash" });
  const templatesQuery = useQuery({
    queryKey: ["web", "templates"],
    queryFn: cmsApi.listTemplates,
    enabled: creating,
    retry: 1,
  });
  const canvasStylesQuery = useQuery({
    queryKey: ["web", "canvas-styles"],
    queryFn: cmsApi.getCanvasStyles,
    enabled: creating,
    retry: 1,
  });
  const invalidate = () => { queryClient.invalidateQueries({ queryKey: ["web", "pages"] }); queryClient.invalidateQueries({ queryKey: ["web", "pages", "trash"] }); };

  const create = useMutation({
    mutationFn: () => cmsApi.createPage({
      title: title.trim(),
      slug: slug.trim() === "/" ? "/" : slugify(slug || title),
      parent_id: slug.trim() === "/" ? null : (parentId ? Number(parentId) : null),
      position: Number(position) || 0,
      source_template_id: sourceTemplateId ? Number(sourceTemplateId) : null,
      data: null,
    }),
    onSuccess: (page) => { invalidate(); navigate(`/admin/web/pages/${page.id}/editor`); },
    onError: (requestError) => setError(requestError?.response?.data?.detail || t("web.errors.createPage")),
  });
  const duplicate = useMutation({ mutationFn: cmsApi.duplicatePage, onSuccess: invalidate });
  const publish = useMutation({
    mutationFn: (page) => cmsApi.publishPage(page.id, page.draft_version || 1),
    onSuccess: invalidate,
    onError: (requestError) => setError(requestError?.response?.data?.detail || t("web.errors.publish")),
  });
  const unpublish = useMutation({ mutationFn: cmsApi.unpublishPage, onSuccess: invalidate, onError: (requestError) => setError(requestError?.response?.data?.detail || t("web.errors.unpublish")) });
  const trash = useMutation({ mutationFn: cmsApi.trashPage, onSuccess: invalidate });
  const restore = useMutation({ mutationFn: cmsApi.restorePage, onSuccess: invalidate });
  const purge = useMutation({ mutationFn: cmsApi.purgePage, onSuccess: invalidate });
  const pages = pagesQuery.data || [];
  const sourceTemplates = filterCatalogResources(
    templatesQuery.data, canvasStylesQuery.data?.active_theme_version_id ?? null,
  ).filter((template) => Number(template.published_version) > 0);
  const templatesLoading = templatesQuery.isLoading || canvasStylesQuery.isLoading;
  const templatesError = templatesQuery.isError || canvasStylesQuery.isError;
  const displayedPages = view === "trash" ? (trashQuery.data || []) : pages.filter((page) => view === "all" || (view === "published" ? page.published_revision_id || page.published : !(page.published_revision_id || page.published)));

  return (
    <section>
      <AdminPageHeader
        title={t("web.nav.pages")}
        description={t("web.pagesDescription")}
        action={<button className="btn btn-primary" type="button" onClick={() => setCreating(true)}><i className="fas fa-plus me-2" />{t("web.commands.newPage")}</button>}
      />
      {error && <Alert type="danger" toast onDismiss={() => setError("")}>{error}</Alert>}
      <div className="web-page-filters" role="group" aria-label={t("web.fields.pageFilter")}>{["all", "published", "draft", "trash"].map((key) => <button key={key} type="button" className={view === key ? "active" : ""} aria-pressed={view === key} onClick={() => setView(key)}>{t(`web.pageViews.${key}`)}</button>)}</div>
      {creating && (
        <form className="web-inline-create" onSubmit={(event) => { event.preventDefault(); if (title.trim()) create.mutate(); }}>
          <label><span>{t("web.fields.pageTitle")}</span><input id="new-page-title" autoFocus className="form-control" value={title} onChange={(event) => { const value = event.target.value; setTitle(value); if (!slugTouched) setSlug(slugify(value)); }} /></label>
          <label><span>{t("web.fields.pathSegment")}</span><input id="new-page-slug" className="form-control" value={slug} placeholder="napr. o-nas nebo /" onChange={(event) => { setSlugTouched(true); setSlug(event.target.value); }} /><small>{slug.trim() === "/" ? t("web.fields.rootPathHelp") : `/${slugify(slug || title)}`}</small></label>
          <label><span>{t("web.fields.parentPage")}</span><select id="new-page-parent" className="form-select" value={parentId} disabled={slug.trim() === "/"} onChange={(event) => setParentId(event.target.value)}><option value="">{t("web.fields.noParent")}</option>{pages.map((page) => <option key={page.id} value={page.id}>{page.title} ({displayPagePath(page)})</option>)}</select></label>
          <label><span>{t("web.fields.sourceTemplate")}</span><select id="new-page-template" className="form-select" value={sourceTemplateId} disabled={templatesLoading} onChange={(event) => setSourceTemplateId(event.target.value)}><option value="">{templatesLoading ? t("web.states.loading") : t("web.fields.blankPage")}</option>{sourceTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select>{templatesError && <small className="text-danger">{t("web.errors.templatesLoad")}</small>}</label>
          <label><span>{t("web.fields.position")}</span><input id="new-page-position" type="number" className="form-control" min="0" value={position} onChange={(event) => setPosition(event.target.value)} /></label>
          <div className="web-inline-create-actions"><button type="submit" className="btn btn-primary" disabled={!title.trim() || create.isPending}>{t("web.commands.createAndEdit")}</button>
          <button type="button" className="btn btn-link" onClick={() => { setCreating(false); setSourceTemplateId(""); setSlug(""); setSlugTouched(false); }}>{t("web.cancel")}</button>
          </div>
        </form>
      )}
      {(pagesQuery.isLoading || (view === "trash" && trashQuery.isLoading)) ? <LoadingSpinner /> : displayedPages.length === 0 ? (
        <div className="web-admin-empty"><i className="fas fa-file-circle-plus" /><h3>{t("web.empty.pagesTitle")}</h3><p>{t("web.empty.pagesBody")}</p></div>
      ) : (
        <div className="web-admin-table-wrap">
          <table className="table align-middle mb-0 web-pages-table">
            <thead><tr><th>{t("web.title")}</th><th>{t("web.path")}</th><th>{t("web.status")}</th><th>{t("web.updated")}</th><th><span className="visually-hidden">{t("web.actionsLabel")}</span></th></tr></thead>
            <tbody>{displayedPages.map((page) => (
              <tr key={page.id}>
                <td><button className="web-table-title" type="button" disabled={view === "trash"} onClick={() => navigate(`/admin/web/pages/${page.id}/editor`)}>{page.title}</button>{page.parent_title && <small>{page.parent_title}</small>}</td>
                <td><code>{displayPagePath(page)}</code></td>
                <td><span className={`web-status ${page.published_revision_id || page.published ? "published" : "draft"}`}><i className="fas fa-circle" />{page.published_revision_id || page.published ? t("web.states.published") : t("web.states.draft")}</span></td>
                <td className="text-muted small">{page.updated_at ? new Date(page.updated_at).toLocaleString() : "—"}</td>
                <td className="text-end text-nowrap">
                  {view === "trash" ? <><button className="btn btn-sm btn-outline-primary" type="button" onClick={() => restore.mutate(page.id)} title={t("web.restore")}><i className="fas fa-trash-arrow-up" /></button>{" "}<button className="btn btn-sm btn-outline-danger" type="button" onClick={() => { if (window.confirm(t("web.confirmPurge", { title: page.title }))) purge.mutate(page.id); }} title={t("web.purge")}><i className="fas fa-ban" /></button></> : <><button className="btn btn-sm btn-outline-secondary" type="button" onClick={() => duplicate.mutate(page.id)} title={t("web.duplicate")}><i className="fas fa-copy" /></button>{" "}{page.published_revision_id || page.published ? <button className="btn btn-sm btn-outline-warning" type="button" disabled={unpublish.isPending} onClick={() => unpublish.mutate(page.id)} title={t("web.unpublish")}><i className="fas fa-arrow-down" /></button> : <button className="btn btn-sm btn-outline-success" type="button" disabled={publish.isPending} onClick={() => publish.mutate(page)} title={t("web.editor.publish")}><i className="fas fa-arrow-up-from-bracket" /></button>}{" "}<button className="btn btn-sm btn-outline-danger" type="button" onClick={() => { if (window.confirm(t("web.confirmDelete", { title: page.title }))) trash.mutate(page.id); }} title={t("web.delete")}><i className="fas fa-trash" /></button></>}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
