import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const modes = [["pages", "fa-file-lines"], ["insert", "fa-plus"], ["layers", "fa-layer-group"]];
export default function EditorRail({ mode, open, onMode }) {
  const { t } = useTranslation();
  return <nav className="web-editor-rail" aria-label={t("web.editor.tools")}>{modes.map(([key, icon]) => <button key={key} type="button" className={open && mode === key ? "active" : ""} aria-expanded={open && mode === key} aria-controls="web-editor-left-panel" onClick={() => onMode(key)}><i className={`fas ${icon}`} /><span>{t(`web.editor.rail.${key}`)}</span></button>)}</nav>;
}
EditorRail.propTypes = { mode: PropTypes.string.isRequired, open: PropTypes.bool.isRequired, onMode: PropTypes.func.isRequired };
