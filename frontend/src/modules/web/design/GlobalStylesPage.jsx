import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import AdminPageHeader from "../admin/AdminPageHeader";
import { cmsApi } from "../api/cms";
import DesignNav from "./DesignNav";
import { useAuth } from "../../../providers/AuthProvider";
import MediaPickerModal from "../media/MediaPickerModal";
import MediaPreview from "../media/MediaPreview";
import ThemeSettingsPreview from "./ThemeSettingsPreview";

export default function TemplateSettingsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const queryClient = useQueryClient();

  const stylesQuery = useQuery({ queryKey: ["web", "design", "styles"], queryFn: cmsApi.getGlobalStyles });
  const canvasStylesQuery = useQuery({ queryKey: ["web", "canvas-styles"], queryFn: cmsApi.getCanvasStyles, retry: 1 });
  const themesQuery = useQuery({ queryKey: ["web", "themes"], queryFn: cmsApi.listThemes });
  const canManageSettings = can("web.settings.manage") || can("web.manage");
  const settingsQuery = useQuery({
    queryKey: ["web", "settings"],
    queryFn: cmsApi.getSiteSettings,
    enabled: canManageSettings,
  });

  // Get config schema from the active theme manifest.
  const activeThemeId = canvasStylesQuery.data?.active_theme_version_id;
  const themes = Array.isArray(themesQuery.data) ? themesQuery.data : themesQuery.data?.items || [];
  const activeTheme = themes.find((theme) => (theme.versions || []).some((version) => version.id === activeThemeId));
  const activeVersion = (activeTheme?.versions || []).find((version) => version.id === activeThemeId);

  // Theme-defined configurable fields.
  const configSchema = {};
  const configDefaults = {};
  const siteConfigDefaults = {};
  // If theme manifest declares a config section, use those typed fields.
  if (activeVersion?.config) {
    Object.entries(activeVersion.config).forEach(([key, def]) => {
      configSchema[key] = def;
      if (def.storage === "site_setting") siteConfigDefaults[key] = def.default ?? "";
      else configDefaults[key] = def.default ?? "";
    });
  }

  const [tokens, setTokens] = useState(configDefaults);
  const [siteValues, setSiteValues] = useState(siteConfigDefaults);
  const [mediaPickerField, setMediaPickerField] = useState(null);

  useEffect(() => {
    if (stylesQuery.data) {
      const draft = stylesQuery.data.draft_tokens || stylesQuery.data.tokens || {};
      setTokens({ ...configDefaults, ...draft });
    }
  }, [stylesQuery.data, activeThemeId]);

  useEffect(() => {
    if (settingsQuery.data?.settings) {
      setSiteValues(Object.fromEntries(Object.keys(siteConfigDefaults).map((key) => [
        key,
        settingsQuery.data.settings[key] ?? siteConfigDefaults[key] ?? "",
      ])));
    }
  }, [settingsQuery.data, activeThemeId]);

  const saveThemeSiteSettings = async () => {
    const keys = Object.keys(siteConfigDefaults);
    if (!canManageSettings || !keys.length) return;
    await cmsApi.updateSiteSettings(Object.fromEntries(keys.map((key) => [key, siteValues[key] || null])));
    queryClient.invalidateQueries({ queryKey: ["web", "settings"] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const result = await cmsApi.saveGlobalStyles({
        tokens,
        css: stylesQuery.data?.draft_css || "",
        expected_version: stylesQuery.data?.draft_version || 1,
      });
      await saveThemeSiteSettings();
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["web", "design", "styles"] }),
  });

  const publish = useMutation({
    mutationFn: async () => {
      const saved = await cmsApi.saveGlobalStyles({
        tokens,
        css: stylesQuery.data?.draft_css || "",
        expected_version: stylesQuery.data?.draft_version || 1,
      });
      const result = await cmsApi.publishGlobalStyles(saved.draft_version);
      await saveThemeSiteSettings();
      return result;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["web", "design", "styles"] }),
  });

  const renderField = (key, value, updateValue, isSiteSetting = false) => {
    const schema = configSchema[key];
    const fieldType = schema?.type || "text";
    const label = schema?.label || key;
    const setValue = (nextValue) => updateValue((current) => ({ ...current, [key]: nextValue }));
    return (
      <div key={key} className="web-token-row">
        <label className="web-token-label">{label}</label>
        <div className="web-token-control">
          {fieldType === "media" ? <>
            {value ? <MediaPreview
              src={String(value).replace(/^\/media\/(\d+)\/file$/, "/api/web/media/$1/file")}
              alt=""
              className="web-template-logo-preview"
              fallback={<i className="fas fa-image" />}
            /> : <span className="web-template-logo-preview"><i className="fas fa-image" /></span>}
            <button type="button" className="btn btn-outline-primary" disabled={!canManageSettings} onClick={() => setMediaPickerField(key)}>
              <i className="fas fa-images me-2" />{t("web.templateSettings.chooseLogo")}
            </button>
            {value && <button type="button" className="btn btn-outline-danger" disabled={!canManageSettings} onClick={() => setValue("")}>
              {t("web.templateSettings.removeLogo")}
            </button>}
          </> : fieldType === "select" ? <select className="form-select" value={value} onChange={(event) => setValue(event.target.value)}>
            {(schema.options || []).map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
          </select> : fieldType === "checkbox" ? <input type="checkbox" className="form-check-input" checked={Boolean(value)} onChange={(event) => setValue(event.target.checked)} /> : <>
            {fieldType === "color" && <input type="color" value={value} onChange={(event) => setValue(event.target.value)} />}
            <input
              className="form-control"
              type={fieldType === "number" ? "number" : "text"}
              min={schema?.min}
              max={schema?.max}
              step={schema?.step}
              value={value}
              onChange={(event) => setValue(fieldType === "number" && event.target.value !== "" ? event.target.valueAsNumber : event.target.value)}
            />
          </>}
        </div>
        {schema?.help && <small className="text-muted">{schema.help}</small>}
        {isSiteSetting && !canManageSettings && <small className="text-muted">{t("web.templateSettings.settingsPermissionRequired")}</small>}
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

  if (stylesQuery.isLoading || canvasStylesQuery.isLoading || themesQuery.isLoading) {
    return <section><DesignNav /><LoadingSpinner /></section>;
  }

  const configuredTokenFields = Object.entries(configSchema)
    .filter(([, schema]) => schema.storage !== "site_setting")
    .map(([key]) => [key, tokens[key] ?? configDefaults[key] ?? ""]);
  const configuredSiteFields = Object.entries(configSchema)
    .filter(([, schema]) => schema.storage === "site_setting")
    .map(([key]) => [key, siteValues[key] ?? siteConfigDefaults[key] ?? ""]);
  return <section>
    <DesignNav />
    <AdminPageHeader title={t("web.design.styles")} description={t("web.designDescriptions.styles")} action={actions} />
    <div className="web-token-editor">
      <div className="web-token-fields">
        {configuredSiteFields.map(([key, value]) => renderField(key, value, setSiteValues, true))}
        {configuredTokenFields.map(([key, value]) => renderField(key, value, setTokens))}
      </div>
      <ThemeSettingsPreview themeName={activeTheme?.name} configSchema={configSchema} values={tokens} />
    </div>
    {mediaPickerField && <MediaPickerModal
      title={configSchema[mediaPickerField]?.label || t("web.templateSettings.chooseLogo")}
      onSelect={(item) => {
        setSiteValues((current) => ({ ...current, [mediaPickerField]: item.public_url || `/media/${item.id}/file` }));
        setMediaPickerField(null);
      }}
      onClose={() => setMediaPickerField(null)}
    />}
  </section>;
}
