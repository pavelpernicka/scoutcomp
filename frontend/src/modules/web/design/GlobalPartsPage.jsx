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

export default function GlobalPartsPage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const partsQuery = useQuery({
    queryKey: ["web", "global-parts"],
    queryFn: cmsApi.listGlobalParts,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["web", "global-parts"] });

  const create = useMutation({
    mutationFn: () => {
      const key = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return cmsApi.createGlobalPart({
        name: name.trim(),
        qualified_key: `site:part:${key}`,
        project_data: emptyProject,
      });
    },
    onSuccess: (part) => {
      setName("");
      setCreating(false);
      invalidate();
      navigate(`/admin/web/design/global-parts/${part.id}/editor`);
    },
  });

  const remove = useMutation({
    mutationFn: cmsApi.deleteGlobalPart,
    onSuccess: invalidate,
  });

  const parts = Array.isArray(partsQuery.data) ? partsQuery.data : partsQuery.data?.items || [];

  return (
    <section>
      <DesignNav />
      <AdminPageHeader
        title={t("web.design.parts")}
        description={t("web.designDescriptions.parts")}
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
          <label htmlFor="global-part-name">{t("web.fields.name")}</label>
          <input
            id="global-part-name"
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
      {partsQuery.isLoading ? (
        <LoadingSpinner />
      ) : parts.length === 0 ? (
        <div className="web-admin-empty">
          <i className="fas fa-earth-europe" />
          <h3>{t("web.empty.resourcesTitle")}</h3>
          <p>{t("web.empty.resourcesBody")}</p>
        </div>
      ) : (
        <div className="web-resource-grid">
          {parts.map((part) => (
            <article key={part.id} className="web-resource-item">
              <div className="web-resource-preview">
                {part.preview_url ? (
                  <MediaPreview src={part.preview_url} alt="" />
                ) : (
                  <i className="fas fa-earth-europe" />
                )}
              </div>
              <div>
                <h3>{part.name}</h3>
                <p>{part.description || t("web.design.parts")}</p>
                <span>{t("web.states.siteLocal")}</span>
                {part.published_version > 0 && (
                  <small className="ms-2">{t("web.states.publishedVersion", { version: part.published_version })}</small>
                )}
              </div>
              <div className="d-flex gap-1">
                <button
                  type="button"
                  className="btn btn-sm btn-outline-primary"
                  title={t("web.edit")}
                  onClick={() => navigate(`/admin/web/design/global-parts/${part.id}/editor`)}
                >
                  <i className="fas fa-pen" />
                </button>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-danger"
                  title={t("web.delete")}
                  onClick={() => {
                    if (window.confirm(t("web.confirmDeleteResource"))) remove.mutate(part.id);
                  }}
                >
                  <i className="fas fa-trash" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

