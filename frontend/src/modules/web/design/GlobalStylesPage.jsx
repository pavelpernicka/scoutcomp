import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import AdminPageHeader from "../admin/AdminPageHeader";
import { cmsApi } from "../api/cms";
import DesignNav from "./DesignNav";
import { useAuth } from "../../../providers/AuthProvider";

export default function TemplateSettingsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const stylesQuery = useQuery({ queryKey: ["web", "design", "styles"], queryFn: cmsApi.getGlobalStyles });
  const canvasStylesQuery = useQuery({ queryKey: ["web", "canvas-styles"], queryFn: cmsApi.getCanvasStyles, retry: 1 });
  const themesQuery = useQuery({ queryKey: ["web", "themes"], queryFn: cmsApi.listThemes });

  // Get config schema from the active theme manifest.
  const activeThemeId = canvasStylesQuery.data?.active_theme_version_id;
  const themes = Array.isArray(themesQuery.data) ? themesQuery.data : themesQuery.data?.items || [];
  const activeVersion = themes.flatMap((t) => t.versions || []).find((v) => v.id === activeThemeId);

  // Theme-defined configurable fields.
  const configSchema = {};
  const configDefaults = {};
  // If theme manifest declares a config section, use those typed fields.
  if (activeVersion?.config) {
    Object.entries(activeVersion.config).forEach(([key, def]) => {
      configSchema[key] = def;
      configDefaults[key] = def.default ?? "";
    });
  }

  const [tokens, setTokens] = useState(configDefaults);
  const [customKey, setCustomKey] = useState("");
  const [customValue, setCustomValue] = useState("");

  useEffect(() => {
    if (stylesQuery.data) {
      const draft = stylesQuery.data.draft_tokens || stylesQuery.data.tokens || {};
      setTokens({ ...configDefaults, ...draft });
    }
  }, [stylesQuery.data, activeThemeId]);

  const save = useMutation({
    mutationFn: () => cmsApi.saveGlobalStyles({
      tokens,
      css: stylesQuery.data?.draft_css || "",
      expected_version: stylesQuery.data?.draft_version || 1,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["web", "design", "styles"] }),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const saved = await cmsApi.saveGlobalStyles({
        tokens,
        css: stylesQuery.data?.draft_css || "",
        expected_version: stylesQuery.data?.draft_version || 1,
      });
      return cmsApi.publishGlobalStyles(saved.draft_version);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["web", "design", "styles"] }),
  });

  const addCustomField = () => {
    const key = customKey.trim();
    if (!key || tokens[key] !== undefined) return;
    setTokens((cur) => ({ ...cur, [key]: customValue }));
    setCustomKey("");
    setCustomValue("");
  };

  const removeCustomField = (key) => {
    if (configSchema[key]) return; // cannot remove manifest-defined fields
    const next = { ...tokens };
    delete next[key];
    setTokens(next);
  };

  const renderField = (key, value) => {
    const schema = configSchema[key];
    const fieldType = schema?.type || "text";
    const label = schema?.label || key;
    return (
      <div key={key} className="web-token-row">
        <label className="web-token-label">{label}</label>
        <div className="web-token-control">
          {fieldType === "color" && (
            <input type="color" value={value} onChange={(e) => setTokens((c) => ({ ...c, [key]: e.target.value }))} />
          )}
          <input className="form-control"
            value={value}
            onChange={(e) => setTokens((c) => ({ ...c, [key]: e.target.value }))}
          />
          {!configSchema[key] && (
            <button type="button" className="btn btn-sm btn-outline-danger" title={t("web.delete")}
              onClick={() => removeCustomField(key)}>
              <i className="fas fa-times" />
            </button>
          )}
        </div>
      </div>
    );
  };

  const actions = (
    <div className="d-flex gap-2">
      <button type="button" className="btn btn-outline-primary" disabled={save.isPending} onClick={() => save.mutate()}>
        <i className="fas fa-save me-2" />{save.isPending ? t("web.states.saving") : t("web.save")}
      </button>
      {(can("web.publish") || can("web.manage")) && (
        <button type="button" className="btn btn-primary" disabled={publish.isPending || save.isPending} onClick={() => publish.mutate()}>
          <i className="fas fa-arrow-up-from-bracket me-2" />{t("web.editor.publish")}
        </button>
      )}
    </div>
  );

  if (stylesQuery.isLoading) return <section><DesignNav /><LoadingSpinner /></section>;

  return <section>
    <DesignNav />
    <AdminPageHeader title={t("web.design.styles")} description={t("web.designDescriptions.styles")} action={actions} />
    <div className="web-token-editor">
      <div className="web-token-fields">
        {Object.entries(tokens).map(([key, value]) => renderField(key, value))}
        <hr />
        <div className="web-token-add-custom">
          <label className="small fw-semibold">{t("web.templateSettings.addCustom")}</label>
          <div className="d-flex gap-2">
            <input className="form-control form-control-sm" placeholder={t("web.templateSettings.keyPlaceholder")} value={customKey} onChange={(e) => setCustomKey(e.target.value)} />
            <input className="form-control form-control-sm" placeholder={t("web.templateSettings.valuePlaceholder")} value={customValue} onChange={(e) => setCustomValue(e.target.value)} />
            <button type="button" className="btn btn-sm btn-outline-primary" onClick={addCustomField}>{t("web.templateSettings.add")}</button>
          </div>
          <small className="text-muted">{t("web.templateSettings.addHint")}</small>
        </div>
      </div>
    </div>
  </section>;
}
