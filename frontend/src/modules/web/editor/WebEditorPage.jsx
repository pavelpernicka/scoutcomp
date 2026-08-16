import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import { useAuth } from "../../../providers/AuthProvider";
import { cmsApi, normalizePage } from "../api/cms";
import EditorBreadcrumbs from "./EditorBreadcrumbs";
import EditorInspector from "./EditorInspector";
import EditorLeftPanel from "./EditorLeftPanel";
import EditorRail from "./EditorRail";
import EditorTopbar from "./EditorTopbar";
import PreviewDialog from "./PreviewDialog";
import RevisionsDialog from "./RevisionsDialog";
import { detachLinkedResource, insertLinkedResource, insertLinkedGlobalPart } from "./resourceBlocks";
import useDraftAutosave from "./useDraftAutosave";
import useGrapesEditor from "./useGrapesEditor";
import MediaPickerModal from "../media/MediaPickerModal";
import api from "../../../services/api";
import "../styles/editor.css";

const safeId = (value) => String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
const EMPTY = [];

export default function WebEditorPage() {
  const { id } = useParams();
  const pageId = Number(id);
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [canvasElement, setCanvasElement] = useState(null);
  const containerRef = useMemo(() => ({ current: canvasElement }), [canvasElement]);
  const pageRef = useRef(null);
  const autosaveRef = useRef(null);
  const savedDirtyCountRef = useRef(undefined);
  const [mode, setMode] = useState("insert");
  const [leftOpen, setLeftOpen] = useState(true);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const [device, setDeviceState] = useState("Desktop");
  const [selected, setSelected] = useState(null);
  const [pageForm, setPageForm] = useState({ title: "", path_segment: "", meta_description: "", template_id: null });
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [publishedNotice, setPublishedNotice] = useState("");
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);

  const pageQuery = useQuery({ queryKey: ["web", "page", pageId], queryFn: () => cmsApi.getPageEditorData(pageId).then((data) => normalizePage({ ...data, project_data: data.project_data || data.data })), enabled: Number.isFinite(pageId) });
  const pagesQuery = useQuery({ queryKey: ["web", "pages"], queryFn: cmsApi.listPages });
  const sourcesQuery = useQuery({ queryKey: ["web", "data-sources"], queryFn: cmsApi.listDataSources, retry: 1 });
  const sectionsQuery = useQuery({ queryKey: ["web", "design", "sections"], queryFn: () => cmsApi.listDesignResources("sections"), retry: 1 });
  const componentsQuery = useQuery({ queryKey: ["web", "design", "components"], queryFn: () => cmsApi.listDesignResources("components"), retry: 1 });
  const mediaQuery = useQuery({ queryKey: ["web", "media"], queryFn: () => cmsApi.listMedia({ limit: 100, offset: 0 }), retry: 1 });
  const templatesQuery = useQuery({ queryKey: ["web", "templates"], queryFn: cmsApi.listTemplates, retry: 1 });
  const globalPartsQuery = useQuery({ queryKey: ["web", "global-parts"], queryFn: cmsApi.listGlobalParts, retry: 1 });
  const canvasStylesQuery = useQuery({ queryKey: ["web", "canvas-styles"], queryFn: cmsApi.getCanvasStyles, retry: 1 });
  const page = pageQuery.data;
  pageRef.current = pageForm;

  useEffect(() => { if (page) setPageForm({ title: page.title || "", path_segment: page.path_segment || page.slug || "", meta_description: page.meta_description || "", template_id: page.template_id || null }); }, [page]);

  const sections = Array.isArray(sectionsQuery.data) ? sectionsQuery.data : sectionsQuery.data?.items || EMPTY;
  const dataSources = Array.isArray(sourcesQuery.data) ? sourcesQuery.data : sourcesQuery.data?.items || EMPTY;
  const components = Array.isArray(componentsQuery.data) ? componentsQuery.data : componentsQuery.data?.items || EMPTY;
  const templates = Array.isArray(templatesQuery.data) ? templatesQuery.data : templatesQuery.data?.items || EMPTY;
  const globalParts = Array.isArray(globalPartsQuery.data) ? globalPartsQuery.data : globalPartsQuery.data?.items || EMPTY;
  const canvasStyles = canvasStylesQuery.data?.css ? [{ href: "", css: canvasStylesQuery.data.css }] : [];
  const templateCSSQuery = useQuery({
    queryKey: ["web", "template", page?.template_id],
    queryFn: () => cmsApi.getTemplate(page.template_id).then((tpl) => tpl?.published_css || tpl?.css || ""),
    enabled: !!(page?.template_id),
    retry: 1,
  });

  const handleDirty = useCallback((dirty) => { if (dirty) autosaveRef.current?.schedule(); }, []);
  const editor = useGrapesEditor({
    containerRef,
    projectData: page?.project_data,
    legacyHtml: page?.html || "",
    legacyCss: page?.draft_css || "",
    dataSources,
    blocks: EMPTY,
    translate: t,
    language: i18n.language,
    loadKey: page?.id,
    canvasStyles: templateCSSQuery.data ? [...canvasStyles, { href: "", css: templateCSSQuery.data }] : canvasStyles,
    onDirtyChange: handleDirty,
    onSelectionChange: setSelected,
    onError: () => setPreviewError(t("web.errors.editorLoad")),
  });

  const getPayload = useCallback(() => {
    const snapshot = editor.getSnapshot();
    savedDirtyCountRef.current = snapshot?.dirtyCount;
    return { project_data: snapshot?.projectData, draft_css: snapshot?.css || "", title: pageRef.current.title.trim(), path_segment: pageRef.current.path_segment, meta_description: pageRef.current.meta_description || null, template_id: pageRef.current.template_id };
  }, [editor]);
  const saveDraft = useCallback((payload) => cmsApi.saveDraft(pageId, payload).then((result) => {
    editor.markSaved(savedDirtyCountRef.current);
    return result;
  }), [editor, pageId]);
  const autosave = useDraftAutosave({ enabled: Boolean(page && editor.isReady), scopeKey: pageId, initialVersion: page?.draft_version || 0, getPayload, saveDraft });
  autosaveRef.current = autosave;

  useEffect(() => {
    const media = Array.isArray(mediaQuery.data) ? mediaQuery.data : mediaQuery.data?.items || [];
    if (media.length === 0) return;
    let cancelled = false;
    // Fetch protected media as blobs so the editor iframe can display them
    // without requiring browser auth headers on raw <img src> requests.
    Promise.all(media.filter((item) => item.is_image).map(async (item) => {
      try {
        const { data } = await api.get(item.url.replace(/^\/api\//, "/"), { responseType: "blob" });
        return { ...item, blobUrl: URL.createObjectURL(data) };
      } catch { return null; }
    })).then((results) => {
      if (cancelled) return;
      const assets = results.filter(Boolean).map((item) => ({ src: item.blobUrl, name: item.filename, attributes: { alt: item.alt || "" } }));
      if (editor.editorRef.current && assets.length) {
        editor.editorRef.current.AssetManager.add(assets);
      }
    });
    return () => { cancelled = true; };
  }, [editor.editorRef, mediaQuery.data]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); void autosave.saveNow().catch(() => {}); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [autosave]);

  useEffect(() => {
    const warnBeforeUnload = (event) => {
      if (!autosave.hasPendingChanges) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [autosave.hasPendingChanges]);

  const previewMutation = useMutation({
    mutationFn: () => cmsApi.previewPage(pageId, { ...getPayload(), expected_version: autosave.version }),
    onMutate: () => { setPreview(""); setPreviewError(""); },
    onSuccess: (result) => setPreview(result.html || ""),
    onError: (error) => setPreviewError(error?.response?.data?.detail || t("web.errors.preview")),
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      const savedVersion = autosave.status === "saved" ? autosave.version : await autosave.saveNow();
      return cmsApi.publishPage(pageId, savedVersion ?? autosave.version);
    },
    onSuccess: () => { setPublishedNotice(t("web.editor.publishedNotice")); queryClient.invalidateQueries({ queryKey: ["web", "pages"] }); queryClient.invalidateQueries({ queryKey: ["web", "page", pageId] }); },
  });

  const changeTitle = (title) => { setPageForm((current) => ({ ...current, title })); autosave.schedule(); };
  const handleMediaSelect = useCallback(async (mediaItem) => {
    setMediaPickerOpen(false);
    const instance = editor.editorRef.current;
    if (!instance) return;
    if (mediaItem.is_image || (mediaItem.mime && mediaItem.mime.startsWith("image/"))) {
      let src = mediaItem.url;
      // GrapesJS iframe has no auth; fetch the blob so it displays.
      try {
        const { data } = await api.get(mediaItem.url.replace(/^\/api\//, "/"), { responseType: "blob" });
        src = URL.createObjectURL(data);
      } catch { /* fall back to raw URL (broken icon if auth-required) */ }
      instance.addComponents({
        type: "image",
        attributes: {
          src,
          alt: mediaItem.alt || "",
          "data-sc-media-id": String(mediaItem.id),
        },
      });
    } else {
      instance.addComponents({
        type: "link",
        content: mediaItem.filename,
        attributes: { href: mediaItem.url, target: "_blank", "data-sc-media-id": String(mediaItem.id) },
      });
    }
  }, [editor.editorRef]);
  const changePageForm = (patch) => { setPageForm((current) => ({ ...current, ...patch })); autosave.schedule(); };
  const selectedComponent = selected ? editor.editorRef.current?.getSelected() : null;
  const selectComponent = (component) => editor.editorRef.current?.select(component);
  const duplicateSelected = () => { if (!selectedComponent) return; const clone = selectedComponent.clone(); selectedComponent.parent()?.append(clone, { at: selectedComponent.index() + 1 }); };
  const deleteSelected = () => selectedComponent?.remove?.();
  const handleClone = useCallback(async (kind, definition) => {
    const apiKind = kind === "sections" ? "sections" : "components";
    try {
      const cloned = await cmsApi.cloneDesignResource(apiKind, definition.id);
      queryClient.invalidateQueries({ queryKey: ["web", "design", apiKind] });
      return cloned;
    } catch (error) {
      console.error("clone failed", error);
      return null;
    }
  }, [queryClient]);
  const handleDetach = useCallback(async (component, definition) => {
    if (!component || !editor.editorRef.current || !definition) return;
    const kind = component.get("resourceKind") === "section" ? "sections" : "components";
    try {
      const materialized = await cmsApi.materializeDesignResource(kind, definition.id, {
        props: component.get("props") || {},
        variant: component.get("variant") || null,
        expected_version: definition.draft_version,
      });
      detachLinkedResource(component, materialized, definition);
    } catch (error) {
      console.error("detach materialization failed", error);
    }
  }, [editor.editorRef]);
  const insertCatalogItem = (catalog, item) => {
    if (catalog === "data") return editor.addBlock(`sc-data-${safeId(item.id)}`);
    const instance = editor.editorRef.current;
    if (!instance) return [];
    if (catalog === "globalParts") return insertLinkedGlobalPart(instance, item);
    return insertLinkedResource(instance, item, catalog);
  };
  const navigateAfterSave = async (destination) => {
    if (autosave.hasPendingChanges) {
      try { await autosave.saveNow(); }
      catch { return; }
    }
    navigate(destination);
  };

  if (pageQuery.isLoading) return <div className="web-editor-loading"><LoadingSpinner /></div>;
  if (pageQuery.isError || !page) return <div className="web-editor-load-error"><h1>{t("web.errors.pageLoad")}</h1><button className="btn btn-primary" onClick={() => navigate("/admin/web/pages")}>{t("web.editor.back")}</button></div>;

  const changeMode = (nextMode) => {
    if (mode === nextMode) setLeftOpen((current) => !current);
    else { setMode(nextMode); setLeftOpen(true); }
  };

  return <div className={`web-editor-shell ${leftOpen ? "" : "left-closed"} ${inspectorOpen ? "" : "inspector-closed"}`}>
    <EditorTopbar title={pageForm.title} path={page.path || `/${pageForm.path_segment}`} device={device} saveStatus={autosave.status} inspectorOpen={inspectorOpen} canUndo={editor.canUndo} canRedo={editor.canRedo} canPublish={can("web.publish") || can("web.manage")} publishing={publishMutation.isPending} onBack={() => { void navigateAfterSave("/admin/web/pages"); }} onTitleChange={changeTitle} onUndo={editor.undo} onRedo={editor.redo} onDevice={(next) => { setDeviceState(next); editor.setDevice(next); }} onToggleInspector={() => setInspectorOpen((current) => !current)} onMedia={() => setMediaPickerOpen(true)} onPreview={() => previewMutation.mutate()} onPublish={() => publishMutation.mutate()} onSave={() => { void autosave.saveNow().catch(() => {}); }} />
    <EditorRail mode={mode} open={leftOpen} onMode={changeMode} />
    <EditorLeftPanel mode={mode} pages={pagesQuery.data || EMPTY} currentPageId={pageId} pageForm={pageForm} templates={templates} components={components} sections={sections} globalParts={globalParts} dataSources={dataSources} editor={editor.editorRef.current} selected={selectedComponent} onOpenPage={(nextId) => { void navigateAfterSave(`/admin/web/pages/${nextId}/editor`); }} onPageFormChange={changePageForm} onRevisions={() => setRevisionsOpen(true)} onInsert={insertCatalogItem} onSelect={selectComponent} />
    <main className="web-editor-workbench"><div className="web-editor-canvas" ref={setCanvasElement} />{!editor.isReady && <div className="web-editor-canvas-loading"><i className="fas fa-spinner fa-spin" />{t("web.editor.loadingCanvas")}</div>}<EditorBreadcrumbs selected={selectedComponent} onSelect={selectComponent} /></main>
    <EditorInspector selected={selectedComponent} dataSources={dataSources} resources={{ components, sections }} onDuplicate={duplicateSelected} onDelete={deleteSelected} onClone={handleClone} onDetach={handleDetach} />
    <div className="web-editor-mobile-note">{t("web.editor.wideScreenHint")}</div>
    <div className="visually-hidden" aria-live="polite">{publishedNotice || t(`web.editor.saveStates.${autosave.status}`)}</div>
    {autosave.conflict && <div className="web-editor-conflict" role="alert"><i className="fas fa-triangle-exclamation" /><span><strong>{t("web.editor.conflictTitle")}</strong>{t("web.editor.conflictBody")}</span><button type="button" className="btn btn-sm btn-light" onClick={() => window.location.reload()}>{t("web.editor.reloadLatest")}</button></div>}
    {(preview !== null || previewMutation.isPending || previewError) && <PreviewDialog html={preview || ""} loading={previewMutation.isPending} error={previewError} device={device} onClose={() => { setPreview(null); setPreviewError(""); }} />}
    {revisionsOpen && <RevisionsDialog pageId={pageId} onClose={() => setRevisionsOpen(false)} />}
    {mediaPickerOpen && <MediaPickerModal onSelect={handleMediaSelect} onClose={() => setMediaPickerOpen(false)} />}
  </div>;
}
