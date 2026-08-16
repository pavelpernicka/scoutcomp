import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

const devices = [["Desktop", "fa-desktop"], ["Tablet", "fa-tablet-screen-button"], ["Mobile", "fa-mobile-screen-button"]];

export default function EditorTopbar({ title, path, device, saveStatus, inspectorOpen, canUndo, canRedo, canPublish, publishing, onBack, onTitleChange, onUndo, onRedo, onDevice, onToggleInspector, onPreview, onPublish, onSave }) {
  const { t } = useTranslation();
  const saveState = <><i className={`fas ${saveStatus === "saving" ? "fa-spinner fa-spin" : saveStatus === "saved" ? "fa-check" : saveStatus === "conflict" ? "fa-triangle-exclamation" : "fa-circle"}`} />{t(`web.editor.saveStates.${saveStatus}`)}</>;
  const saveIsActionable = saveStatus === "failed" || saveStatus === "unsaved";
  return <header className="web-editor-topbar">
    <button type="button" className="web-editor-icon-button" onClick={onBack} title={t("web.editor.back")}><i className="fas fa-arrow-left" /><span className="visually-hidden">{t("web.editor.back")}</span></button>
    <div className="web-editor-document"><input aria-label={t("web.fields.pageTitle")} value={title} onChange={(e) => onTitleChange(e.target.value)} /><span>{path.startsWith("/") ? path : `/${path}`}</span></div>
    <div className="web-editor-history" role="group" aria-label={t("web.editor.historyActions")}><button type="button" disabled={!canUndo} onClick={onUndo} title={t("web.editor.undo")}><i className="fas fa-rotate-left" /></button><button type="button" disabled={!canRedo} onClick={onRedo} title={t("web.editor.redo")}><i className="fas fa-rotate-right" /></button></div>
    <div className="web-editor-devices" role="group" aria-label={t("web.editor.viewport")}>
      {devices.map(([name, icon]) => <button key={name} type="button" className={device === name ? "active" : ""} aria-pressed={device === name} onClick={() => onDevice(name)} title={t(`web.editor.devices.${name.toLowerCase()}`)}><i className={`fas ${icon}`} /><span className="visually-hidden">{t(`web.editor.devices.${name.toLowerCase()}`)}</span></button>)}
    </div>
    <button type="button" className={`web-editor-icon-button ${inspectorOpen ? "active" : ""}`} aria-expanded={inspectorOpen} aria-controls="web-editor-inspector" onClick={onToggleInspector} title={t("web.editor.inspectorLabel")}><i className="fas fa-sliders" /><span className="visually-hidden">{t("web.editor.inspectorLabel")}</span></button>
    {saveIsActionable ? <button type="button" className={`web-editor-save-state ${saveStatus}`} onClick={onSave}>{saveState}</button> : <span className={`web-editor-save-state ${saveStatus}`} role="status">{saveState}</span>}
    <div className="web-editor-primary-actions"><button type="button" className="btn btn-sm btn-outline-secondary" onClick={onPreview}><i className="fas fa-eye me-2" />{t("web.preview")}</button>{canPublish && <button type="button" className="btn btn-sm btn-primary" disabled={publishing || saveStatus === "conflict"} onClick={onPublish}><i className="fas fa-arrow-up-from-bracket me-2" />{publishing ? t("web.states.publishing") : t("web.editor.publish")}</button>}</div>
  </header>;
}

EditorTopbar.propTypes = { title: PropTypes.string.isRequired, path: PropTypes.string.isRequired, device: PropTypes.string.isRequired, saveStatus: PropTypes.string.isRequired, inspectorOpen: PropTypes.bool.isRequired, canUndo: PropTypes.bool, canRedo: PropTypes.bool, canPublish: PropTypes.bool, publishing: PropTypes.bool, onBack: PropTypes.func.isRequired, onTitleChange: PropTypes.func.isRequired, onUndo: PropTypes.func.isRequired, onRedo: PropTypes.func.isRequired, onDevice: PropTypes.func.isRequired, onToggleInspector: PropTypes.func.isRequired, onPreview: PropTypes.func.isRequired, onPublish: PropTypes.func.isRequired, onSave: PropTypes.func.isRequired };
