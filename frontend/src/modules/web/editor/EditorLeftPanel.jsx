import { useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import MediaPreview from "../media/MediaPreview";
import EditorNavigator from "./EditorNavigator";

export default function EditorLeftPanel({
  mode,
  pages,
  currentPageId,
  pageForm,
  templates,
  components,
  sections,
  dataSources,
  editor,
  selected,
  onOpenPage,
  onPageFormChange,
  onTemplateChange,
  onEditTemplate,
  onRevisions,
  onInsert,
  onSelect,
}) {
  const { t } = useTranslation();
  const [catalog, setCatalog] = useState("components");
  const [search, setSearch] = useState("");
  const filter = (items) => (items || []).filter((item) =>
    String(item.name || item.label || item.id).toLowerCase().includes(search.toLowerCase()));
  const catalogItems = useMemo(() => ({
    components: filter(components),
    sections: filter(sections),
    data: filter(dataSources),
  }), [components, sections, dataSources, search]);
  const startDrag = (event, item) => {
    const blockId = catalog === "data"
      ? `sc-data-${String(item.id).replace(/[^a-zA-Z0-9_-]/g, "-")}`
      : `sc-resource-${catalog === "components" ? "component" : "section"}-${item.id}`;
    const block = editor?.BlockManager?.get?.(blockId);
    if (!block) return;
    event.dataTransfer.effectAllowed = "copy";
    editor.BlockManager.startDrag?.(block, event.nativeEvent);
  };

  useEffect(() => {
    document.querySelectorAll(".web-editor-block-manager .gjs-block").forEach((block) => {
      block.hidden = catalog === "components" && Boolean(search)
        && !block.textContent.toLowerCase().includes(search.toLowerCase());
    });
  }, [catalog, search]);

  return <aside id="web-editor-left-panel" className="web-editor-left" aria-label={t(`web.editor.rail.${mode}`)}>
    <div className={mode === "pages" ? "" : "d-none"}>
      <div className="web-editor-panel-heading"><h2>{t("web.nav.pages")}</h2></div>
      <div className="web-editor-page-list">{pages.map((page) => <button key={page.id} type="button" className={page.id === currentPageId ? "active" : ""} onClick={() => onOpenPage(page.id)}>
        <i className="far fa-file-lines" />
        <span>{page.title}<small>{page.path || `/${page.path_segment || page.slug}`}</small></span>
        {page.published_revision_id && <i className="fas fa-circle web-live-dot" title={t("web.states.published")} />}
      </button>)}</div>
      <div className="web-editor-document-settings">
        <h3>{t("web.editor.pageSettings")}</h3>
        <label><span>{t("web.fields.pathSegment")}</span><input value={pageForm.path_segment} onChange={(event) => onPageFormChange({ path_segment: event.target.value })} /></label>
        <label><span>{t("web.template")}</span><select value={pageForm.template_id || ""} onChange={(event) => onTemplateChange(event.target.value || null)}>
          <option value="">{t("web.editor.noTemplate")}</option>
          {templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
        </select></label>
        {pageForm.template_id && <button type="button" className="btn btn-sm btn-outline-light w-100 mb-2" onClick={() => onEditTemplate(pageForm.template_id)}><i className="fas fa-pen me-2" />{t("web.props.editTemplate")}</button>}
        <label><span>{t("web.metaDescription")}</span><textarea rows="3" value={pageForm.meta_description} onChange={(event) => onPageFormChange({ meta_description: event.target.value })} /></label>
        <button type="button" className="btn btn-sm btn-outline-light w-100" onClick={onRevisions}><i className="fas fa-clock-rotate-left me-2" />{t("web.revisions")}</button>
      </div>
    </div>
    <div className={mode === "insert" ? "" : "d-none"}>
      <div className="web-editor-panel-heading"><h2>{t("web.editor.insert")}</h2></div>
      <div className="web-editor-catalog-tabs" role="tablist">{["components", "sections", "data"].map((key) => <button key={key} type="button" role="tab" aria-selected={catalog === key} className={catalog === key ? "active" : ""} onClick={() => setCatalog(key)}>{t(`web.editor.catalog.${key}`)}</button>)}</div>
      <label className="web-editor-search"><i className="fas fa-magnifying-glass" /><span className="visually-hidden">{t("web.search")}</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("web.editor.searchCatalog")} /></label>
      <div className={catalog === "components" ? "web-editor-block-manager" : "web-editor-block-manager d-none"} />
      <div className="web-editor-catalog-list">{catalogItems[catalog]?.map((item) => {
        const preview = item.preview_url || (item.preview_media_id ? `/api/web/media/${item.preview_media_id}/file` : null);
        return <button key={item.id} type="button" draggable={Boolean(editor)} onDragStart={(event) => startDrag(event, item)} title={catalog === "data" ? (item.description || item.label || item.name || item.id) : undefined} onClick={() => onInsert(catalog, item)}>
          <span className="web-editor-catalog-icon">{preview ? <MediaPreview src={preview} alt="" /> : <i className={`fas ${catalog === "data" ? "fa-database" : "fa-layer-group"}`} />}</span>
          <span><strong>{item.name || item.label || item.id}</strong><small>{item.description || item.id}</small></span>
        </button>;
      })}{catalog !== "components" && catalogItems[catalog]?.length === 0 && <p className="web-editor-panel-empty">{t("web.empty.noResults")}</p>}</div>
    </div>
    <div className={mode === "layers" ? "" : "d-none"}>
      <div className="web-editor-panel-heading"><h2>{t("web.editor.navigator.title")}</h2></div>
      <EditorNavigator editor={editor} selected={selected} onSelect={onSelect} />
      <div className="web-editor-native-layer-manager" aria-hidden="true" />
    </div>
  </aside>;
}

EditorLeftPanel.propTypes = {
  mode: PropTypes.string.isRequired,
  pages: PropTypes.array.isRequired,
  currentPageId: PropTypes.number.isRequired,
  pageForm: PropTypes.object.isRequired,
  teams: PropTypes.array.isRequired,
  templates: PropTypes.array.isRequired,
  components: PropTypes.array.isRequired,
  sections: PropTypes.array.isRequired,
  dataSources: PropTypes.array.isRequired,
  editor: PropTypes.object,
  selected: PropTypes.object,
  onOpenPage: PropTypes.func.isRequired,
  onPageFormChange: PropTypes.func.isRequired,
  onTemplateChange: PropTypes.func.isRequired,
  onEditTemplate: PropTypes.func.isRequired,
  onRevisions: PropTypes.func.isRequired,
  onInsert: PropTypes.func.isRequired,
  onSelect: PropTypes.func.isRequired,
};
