import { useTranslation } from "react-i18next";
import PropTypes from "prop-types";

const SEMANTIC_VARIANTS = [
  "primary", "secondary", "success", "danger", "warning", "info", "light", "dark",
];

function firstColor(colors, keys, fallback) {
  for (const key of keys) {
    const match = colors.find((item) => item.key === key);
    if (match?.value) return match.value;
  }
  return fallback;
}

function readableTextColor(color) {
  const match = /^#([0-9a-f]{6})$/i.exec(String(color || "").trim());
  if (!match) return "#111111";
  const channels = [0, 2, 4].map((offset) => parseInt(match[1].slice(offset, offset + 2), 16) / 255);
  const linear = channels.map((value) => value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  return luminance > 0.42 ? "#111111" : "#ffffff";
}

export default function ThemeSettingsPreview({ themeName, configSchema, values }) {
  const { t } = useTranslation();
  const colors = Object.entries(configSchema)
    .filter(([, schema]) => schema?.type === "color")
    .map(([key, schema]) => ({
      key,
      label: schema.label || key,
      value: values[key] ?? schema.default ?? "transparent",
    }));

  const primary = firstColor(colors, ["primary_color", "bootstrap_primary", "primary"], "#255c9e");
  const primaryDark = firstColor(colors, ["primary_dark_color", "nav_scrolled", "bootstrap_dark", "dark"], primary);
  const pale = firstColor(colors, ["primary_pale_color", "bootstrap_light", "light"], "#eef3f6");
  const accent = firstColor(colors, ["accent_color", "bootstrap_warning", "warning", "accent"], primary);
  const warmSurface = firstColor(colors, ["warm_surface_color", "background_color", "bg"], "#ffffff");
  const text = firstColor(colors, ["text_color", "text"], "#252b31");
  const footer = firstColor(colors, ["footer_color"], primaryDark);
  const footerLink = firstColor(colors, ["footer_link_color"], pale);
  const navigation = firstColor(colors, ["nav_scrolled", "primary_dark_color"], primaryDark);
  const semanticColors = SEMANTIC_VARIANTS.map((variant) => {
    const item = colors.find(({ key }) => key === `bootstrap_${variant}` || key === variant);
    return item ? { ...item, variant } : null;
  }).filter(Boolean);

  const style = {
    "--theme-preview-primary": primary,
    "--theme-preview-primary-dark": primaryDark,
    "--theme-preview-pale": pale,
    "--theme-preview-accent": accent,
    "--theme-preview-warm": warmSurface,
    "--theme-preview-text": text,
    "--theme-preview-footer": footer,
    "--theme-preview-footer-link": footerLink,
    "--theme-preview-nav": navigation,
  };

  return (
    <aside className="web-theme-settings-preview" style={style} aria-label={t("web.templateSettings.preview")}>
      <div className="web-theme-preview-heading">
        <small>{t("web.templateSettings.preview")}</small>
        <strong>{themeName || t("web.templateSettings.previewTitle")}</strong>
      </div>

      <div className="web-theme-preview-site">
        <div className="web-theme-preview-nav">
          <span className="web-theme-preview-mark" aria-hidden="true">▲</span>
          <strong>{themeName || t("web.templateSettings.previewNav")}</strong>
          <span aria-hidden="true">☰</span>
        </div>
        <div className="web-theme-preview-content">
          <small>{t("web.templateSettings.previewEyebrow")}</small>
          <h3>{t("web.templateSettings.previewTitle")}</h3>
          <p>{t("web.templateSettings.previewText")}</p>
          <div className="web-theme-preview-actions">
            <button type="button">{t("web.templateSettings.previewButton")}</button>
            <a href="#theme-preview-palette" onClick={(event) => event.preventDefault()}>{t("web.templateSettings.previewLink")}</a>
          </div>
          <div className="web-theme-preview-surface">
            <strong>{t("web.templateSettings.previewSurface")}</strong>
            <span>{t("web.templateSettings.previewSurfaceText")}</span>
          </div>
        </div>
        <div className="web-theme-preview-accent" aria-hidden="true" />
        <div className="web-theme-preview-footer">
          <strong>{themeName || t("web.templateSettings.previewNav")}</strong>
          <a href="#theme-preview-palette" onClick={(event) => event.preventDefault()}>{t("web.templateSettings.previewLink")}</a>
        </div>
      </div>

      {semanticColors.length > 0 && <section className="web-theme-preview-section">
        <h4>{t("web.templateSettings.previewVariants")}</h4>
        <div className="web-theme-preview-variants">
          {semanticColors.map((item) => <span key={item.key} style={{ backgroundColor: item.value, color: readableTextColor(item.value) }}>
            {item.variant}
          </span>)}
        </div>
      </section>}

      <section className="web-theme-preview-section" id="theme-preview-palette">
        <h4>{t("web.templateSettings.previewPalette")}</h4>
        {colors.length > 0 ? <div className="web-theme-preview-palette">
          {colors.map((item) => <div key={item.key} className="web-theme-preview-swatch">
            <span style={{ backgroundColor: item.value }} aria-hidden="true" />
            <div><strong>{item.label}</strong><code>{item.value}</code></div>
          </div>)}
        </div> : <p className="text-muted mb-0">{t("web.templateSettings.previewNoColors")}</p>}
      </section>
    </aside>
  );
}

ThemeSettingsPreview.propTypes = {
  themeName: PropTypes.string,
  configSchema: PropTypes.objectOf(PropTypes.shape({
    type: PropTypes.string,
    label: PropTypes.string,
    default: PropTypes.oneOfType([PropTypes.string, PropTypes.number, PropTypes.bool]),
  })).isRequired,
  values: PropTypes.object.isRequired,
};
