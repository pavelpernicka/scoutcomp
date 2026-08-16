import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import api from "../../../services/api";
import LoadingSpinner from "../../../components/LoadingSpinner";
import MediaPickerModal from "../media/MediaPickerModal";

const EMPTY_SETTINGS = {
  site_title: "",
  site_tagline: "",
  site_meta: "",
  site_logo: "",
  favicon: "",
  meta_description: "",
  og_title: "",
  og_description: "",
  og_image: "",
  og_type: "",
  canonical_url: "",
};

export default function WebAdminSettings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [feedback, setFeedback] = useState(null);
  const [mediaPickerField, setMediaPickerField] = useState(null); // "favicon" | "og_image"

  const { data: settingsData, isLoading } = useQuery({
    queryKey: ["web", "settings"],
    queryFn: async () => (await api.get("/web/settings")).data,
    staleTime: 15_000,
  });

  const [form, setForm] = useState(EMPTY_SETTINGS);

  useEffect(() => {
    if (settingsData?.settings) {
      setForm((current) => ({ ...EMPTY_SETTINGS, ...current, ...Object.fromEntries(Object.entries(settingsData.settings).map(([k, v]) => [k, v || ""])) }));
    }
  }, [settingsData]);

  useEffect(() => {
    if (!feedback) return;
    const timeout = setTimeout(() => setFeedback(null), 4000);
    return () => clearTimeout(timeout);
  }, [feedback]);

  const saveMutation = useMutation({
    mutationFn: (payload) => api.put("/web/settings", payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["web", "settings"] }); setFeedback({ type: "success", message: t("web.saveSuccess") }); },
    onError: (error) => setFeedback({ type: "danger", message: error?.response?.data?.detail || t("web.saveFailed") }),
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    const payload = {};
    for (const [key, value] of Object.entries(form)) payload[key] = value || null;
    saveMutation.mutate(payload);
  };

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }));
  const pickMedia = (mediaItem) => {
    if (!mediaPickerField) return;
    setField(mediaPickerField, mediaItem.url);
    setMediaPickerField(null);
  };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-4">
        <div>
          <h1 className="h3 mb-0">{t("web.settingsTitle")}</h1>
          <p className="text-muted mb-0 small">{t("web.settingsSubtitle")}</p>
        </div>
      </div>

      {feedback && <div className={`alert alert-${feedback.type} py-2`}>{feedback.message}</div>}

      {isLoading ? <LoadingSpinner /> : (
        <form className="row g-4" onSubmit={handleSubmit}>
          <div className="col-12 col-xl-6">
            <div className="card shadow-sm h-100">
              <div className="card-header"><i className="fas fa-globe me-1" />{t("web.settingsBasic")}</div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label small fw-semibold">{t("web.settingsSiteTitle")}</label>
                  <input className="form-control" value={form.site_title} onChange={(e) => setField("site_title", e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">{t("web.settingsTagline")}</label>
                  <input className="form-control" value={form.site_tagline} onChange={(e) => setField("site_tagline", e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">{t("web.settingsFavicon")}</label>
                  <div className="input-group">
                    <input className="form-control" value={form.favicon} onChange={(e) => setField("favicon", e.target.value)} placeholder="https://…/favicon.ico" />
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setMediaPickerField("favicon")} title={t("web.chooseFromMedia")}><i className="fas fa-images" /></button>
                  </div>
                  <div className="form-text">{t("web.settingsFaviconHint")}</div>
                </div>
                <div className="mb-0">
                  <label className="form-label small fw-semibold">{t("web.settingsLogo")}</label>
                  <input className="form-control" value={form.site_logo} onChange={(e) => setField("site_logo", e.target.value)} placeholder="https://…/logo.png" />
                </div>
              </div>
            </div>
          </div>

          <div className="col-12 col-xl-6">
            <div className="card shadow-sm mb-4">
              <div className="card-header"><i className="fas fa-magnifying-glass me-1" />{t("web.settingsSeo")}</div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label small fw-semibold">{t("web.settingsMetaDescription")}</label>
                  <textarea className="form-control" rows="2" value={form.meta_description} onChange={(e) => setField("meta_description", e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">{t("web.settingsSiteMeta")}</label>
                  <textarea className="form-control" rows="3" value={form.site_meta} onChange={(e) => setField("site_meta", e.target.value)} />
                </div>
                <div className="mb-0">
                  <label className="form-label small fw-semibold">{t("web.settingsCanonical")}</label>
                  <input className="form-control" value={form.canonical_url} onChange={(e) => setField("canonical_url", e.target.value)} placeholder="https://…" />
                </div>
              </div>
            </div>

            <div className="card shadow-sm">
              <div className="card-header"><i className="fas fa-share-nodes me-1" />{t("web.settingsOpenGraph")}</div>
              <div className="card-body">
                <div className="mb-3">
                  <label className="form-label small fw-semibold">{t("web.settingsOgTitle")}</label>
                  <input className="form-control" value={form.og_title} onChange={(e) => setField("og_title", e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">{t("web.settingsOgDescription")}</label>
                  <textarea className="form-control" rows="2" value={form.og_description} onChange={(e) => setField("og_description", e.target.value)} />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-semibold">{t("web.settingsOgType")}</label>
                  <input className="form-control" value={form.og_type} onChange={(e) => setField("og_type", e.target.value)} placeholder="website" />
                </div>
                <div className="mb-0">
                  <label className="form-label small fw-semibold">{t("web.settingsOgImage")}</label>
                  <div className="input-group">
                    <input className="form-control" value={form.og_image} onChange={(e) => setField("og_image", e.target.value)} placeholder="https://…/og.jpg" />
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setMediaPickerField("og_image")} title={t("web.chooseFromMedia")}><i className="fas fa-images" /></button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="col-12">
            <div className="d-flex justify-content-end">
              <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
                <i className="fas fa-save me-2" />{t("web.save")}
              </button>
            </div>
          </div>
        </form>
      )}

      {mediaPickerField && (
        <MediaPickerModal
          title={mediaPickerField === "favicon" ? t("web.settingsFavicon") : t("web.settingsOgImage")}
          onSelect={pickMedia}
          onClose={() => setMediaPickerField(null)}
        />
      )}
    </>
  );
}
