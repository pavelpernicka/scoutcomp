import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import MediaPreview from "../media/MediaPreview";
import { useNavigate } from "react-router-dom";

import LoadingSpinner from "../../../components/LoadingSpinner";
import AdminPageHeader from "../admin/AdminPageHeader";
import { cmsApi } from "../api/cms";
import DesignNav from "./DesignNav";

const emptyProject = {
  scoutcomp: { schemaVersion: 2 },
  pages: [{ id: "main", frames: [{ id: "main", component: { type: "wrapper", components: [] }, styles: [] }] }],
};

export default function PageTemplatesPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["web", "page-templates"],
    queryFn: cmsApi.listPageTemplates,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["web", "page-templates"] });

  const create = useMutation({
    mutationFn: () => {
      const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return cmsApi.createPageTemplate({
        name: name.trim(),
        qualified_key: `site:page:${key}`,
        project_data: emptyProject,
      });
    },
    onSuccess: (template) => {
      setName("");
      setCreating(false);
      invalidate();
      navigate(`/admin/web/design/page-templates/${template.id}/editor`);
    },
  });

  const remove = useMutation({
    mutationFn: cmsApi.deletePageTemplate,
    onSuccess: invalidate,
  });

  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : templatesQuery.data?.items || [];

  return (
    <section>
      <DesignNav />
      <AdminPageHeader
        title={t("web.design.pageTemplates")}
        description={t("web.designDescriptions.pageTemplates")}
        action={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <i className="fas fa-plus me-2" />
            {t("web.commands.createResource")}
          </button>
        }
      />
      {creating && (
        <form
          className="web-inline-create"
          onSubmit={(event) => {
            event.preventDefault();
            if (name.trim()) create.mutate();
          }}
        >
          <label htmlFor="pt-name">{t("web.fields.name")}</label>
          <input
            id="pt-name"
            autoFocus
            className="form-control"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button className="btn btn-primary" disabled={!name.trim() || create.isPending}>
            {t("web.create")}
          </button>
          <button type="button" className="btn btn-link" onClick={() => setCreating(false)}>
            {t("web.cancel")}
          </button>
        </form>
      )}
      {templatesQuery.isLoading ? (
        <LoadingSpinner />
      ) : templates.length === 0 ? (
        <div className="web-admin-empty">
          <i className="fas fa-file-lines" />
          <h3>{t("web.empty.resourcesTitle")}</h3>
          <p>{t("web.empty.resourcesBody")}</p>
        </div>
      ) : (
        <div className="web-resource-grid">
          {templates.map((tpl) => {
            const installed = Boolean(tpl.is_locked || tpl.theme_version_id);
            return (
              <article key={tpl.id} className="web-resource-item">
                <div className="web-resource-preview">
                  {tpl.preview_url ? (
                    <MediaPreview src={tpl.preview_url} alt="" />
                  ) : (
                    <i className="fas fa-file-lines" />
                  )}
                </div>
                <div>
                  <h3>{tpl.name}</h3>
                  <p>{tpl.description || t("web.design.pageTemplates")}</p>
                  <span>{installed ? t("web.states.fromTheme") : t("web.states.siteLocal")}</span>
                  {tpl.published_version > 0 && (
                    <small className="ms-2">{t("web.states.publishedVersion", { version: tpl.published_version })}</small>
                  )}
                </div>
                <div className="d-flex gap-1">
                  <button
                    type="button"
                    className="btn btn-sm btn-outline-primary"
                    title={t("web.edit")}
                    onClick={() => navigate(`/admin/web/design/page-templates/${tpl.id}/editor`)}
                  >
                    <i className={`fas ${installed ? "fa-eye" : "fa-pen"}`} />
                  </button>
                  {!installed && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline-danger"
                      title={t("web.delete")}
                      onClick={() => {
                        if (window.confirm(t("web.confirmDeleteResource"))) remove.mutate(tpl.id);
                      }}
                    >
                      <i className="fas fa-trash" />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
