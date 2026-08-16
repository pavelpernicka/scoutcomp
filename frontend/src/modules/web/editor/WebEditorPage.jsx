import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import { useAuth } from "../../../providers/AuthProvider";
import { cmsApi, normalizePage } from "../api/cms";
import { TEMPLATE_USAGE_MODES, templatesForUsage } from "../templateContracts";
import EditorBreadcrumbs from "./EditorBreadcrumbs";
import EditorInspector from "./EditorInspector";
import EditorLeftPanel from "./EditorLeftPanel";
import EditorRail from "./EditorRail";
import EditorTopbar from "./EditorTopbar";
import PreviewDialog from "./PreviewDialog";
import RevisionsDialog from "./RevisionsDialog";
import { detachLinkedResource, filterCatalogResources, insertLinkedResource, linkedResourceInstance } from "./resourceBlocks";
import { insertEditorComponents } from "./editorInsertion";
import useDraftAutosave from "./useDraftAutosave";
import useGrapesEditor from "./useGrapesEditor";
import MediaPickerModal from "../media/MediaPickerModal";
import api from "../../../services/api";
import "../styles/editor.css";

const safeId = (value) => String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "-");
const EMPTY = [];
const isCompactViewport = () => typeof window !== "undefined"
  && Boolean(window.matchMedia?.("(max-width: 900px)")?.matches);

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
  const editorTemplateIdRef = useRef(null);
  const autosaveRef = useRef(null);
  const savedDirtyCountRef = useRef(undefined);
  const [mode, setMode] = useState("insert");
  const [leftOpen, setLeftOpen] = useState(() => !isCompactViewport());
  const [inspectorOpen, setInspectorOpen] = useState(() => !isCompactViewport());
  const [device, setDeviceState] = useState("Desktop");
  const [selected, setSelected] = useState(null);
  const [pageForm, setPageForm] = useState({ title: "", path_segment: "", meta_description: "", template_id: null });
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState("");
  const [publishedNotice, setPublishedNotice] = useState("");
  const [revisionsOpen, setRevisionsOpen] = useState(false);
  const [mediaPickerTarget, setMediaPickerTarget] = useState(null); // null | "insert" | GrapesJS image component

  const pageQuery = useQuery({ queryKey: ["web", "page", pageId], queryFn: () => cmsApi.getPageEditorData(pageId).then((data) => normalizePage({ ...data, project_data: data.project_data || data.data })), enabled: Number.isFinite(pageId) });
  const pagesQuery = useQuery({ queryKey: ["web", "pages"], queryFn: cmsApi.listPages });
  const sourcesQuery = useQuery({ queryKey: ["web", "data-sources"], queryFn: cmsApi.listDataSources, retry: 1 });
  const sectionsQuery = useQuery({ queryKey: ["web", "design", "sections"], queryFn: () => cmsApi.listDesignResources("sections"), retry: 1 });
  const componentsQuery = useQuery({ queryKey: ["web", "design", "components"], queryFn: () => cmsApi.listDesignResources("components"), retry: 1 });
  const mediaQuery = useQuery({ queryKey: ["web", "media"], queryFn: () => cmsApi.listMedia({ limit: 100, offset: 0 }), retry: 1 });
  const templatesQuery = useQuery({ queryKey: ["web", "templates"], queryFn: cmsApi.listTemplates, retry: 1 });
  const canvasStylesQuery = useQuery({ queryKey: ["web", "canvas-styles"], queryFn: cmsApi.getCanvasStyles, retry: 1 });
  const page = pageQuery.data;
  pageRef.current = pageForm;

  useEffect(() => {
    if (!page) return;
    const next = { title: page.title || "", path_segment: page.path_segment || page.slug || "", meta_description: page.meta_description || "", template_id: page.template_id || null };
    pageRef.current = next;
    editorTemplateIdRef.current = page.template_id || null;
    setPageForm(next);
  }, [page]);

  const activeThemeVersionId = canvasStylesQuery.data?.active_theme_version_id ?? null;
  const sections = filterCatalogResources(sectionsQuery.data, activeThemeVersionId);
  const dataSources = Array.isArray(sourcesQuery.data) ? sourcesQuery.data : sourcesQuery.data?.items || EMPTY;
  const components = filterCatalogResources(componentsQuery.data, activeThemeVersionId);
  const templates = templatesForUsage(
    filterCatalogResources(templatesQuery.data, activeThemeVersionId),
    TEMPLATE_USAGE_MODES.linkedLayout,
  );
  const canvasStyles = canvasStylesQuery.data?.css ? [{ href: "", css: canvasStylesQuery.data.css }] : [];
  const editorBlocks = useMemo(() => [
    ...components.map((item) => ({
      id: `sc-resource-component-${item.id}`,
      label: item.name,
      category: t("web.editor.catalog.components"),
      content: linkedResourceInstance(item, "component"),
      attributes: { title: item.description || item.name },
    })),
    ...sections.map((item) => ({
      id: `sc-resource-section-${item.id}`,
      label: item.name,
      category: t("web.editor.catalog.sections"),
      content: linkedResourceInstance(item, "section"),
      attributes: { title: item.description || item.name },
    })),
  ], [components, sections, t]);
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
    blocks: editorBlocks,
    translate: t,
    language: i18n.language,
    loadKey: page ? `${page.id}:${page.draft_version}:${page.template_id || "none"}` : undefined,
    canvasStyles: templateCSSQuery.data ? [...canvasStyles, { href: "", css: templateCSSQuery.data }] : canvasStyles,
    preferContentSlotInsertion: true,
    onDirtyChange: handleDirty,
    onSelectionChange: setSelected,
    onError: () => setPreviewError(t("web.errors.editorLoad")),
  });

  const getPayload = useCallback(() => {
    const snapshot = editor.getSnapshot();
    savedDirtyCountRef.current = snapshot?.dirtyCount;
    return { project_data: snapshot?.projectData, draft_css: snapshot?.css || "", title: pageRef.current.title.trim(), path_segment: pageRef.current.path_segment, meta_description: pageRef.current.meta_description || null, template_id: pageRef.current.template_id, editor_template_id: editorTemplateIdRef.current };
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
        const instance = editor.editorRef.current;
        instance.AssetManager.add(assets);
        const previewById = new Map(results.filter(Boolean).map((item) => [String(item.id), item.blobUrl]));
        const replacePersistedMediaUrls = (component) => {
          const mediaId = component?.getAttributes?.()?.["data-sc-media-id"];
          const previewUrl = previewById.get(String(mediaId || ""));
          if (previewUrl) component.addAttributes?.({ src: previewUrl });
          component?.components?.().forEach?.(replacePersistedMediaUrls);
        };
        replacePersistedMediaUrls(instance.getWrapper?.());
      }
    });
    return () => { cancelled = true; };
  }, [editor.editorRef, mediaQuery.data]);

  useEffect(() => {
    const instance = editor.editorRef.current;
    const definitions = [...components, ...sections].filter((item) => item.preview_url);
    if (!instance || definitions.length === 0) return undefined;
    let cancelled = false;
    Promise.all(definitions.map(async (item) => {
      try {
        const { data } = await api.get(item.preview_url.replace(/^\/api\//, "/"), { responseType: "blob" });
        return [String(item.qualified_key || item.id), URL.createObjectURL(data)];
      } catch { return null; }
    })).then((entries) => {
      if (cancelled) return;
      const previews = new Map(entries.filter(Boolean));
      const apply = (component) => {
        if (component?.get?.("type") === "sc-resource-instance") {
          const url = previews.get(String(component.get("resourceId") || ""));
          if (url && component.get("previewUrl") !== url) component.set("previewUrl", url, { avoidStore: true });
        }
        component?.components?.().forEach?.(apply);
      };
      apply(instance.getWrapper?.());
    });
    return () => { cancelled = true; };
  }, [activeThemeVersionId, componentsQuery.data, editor.editorRef, sectionsQuery.data]);

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
    mutationFn: async () => {
      const savedVersion = await autosave.saveNow();
      return cmsApi.previewPage(pageId, { ...getPayload(), expected_version: savedVersion });
    },
    onMutate: () => { setPreview(""); setPreviewError(""); },
    onSuccess: (result) => setPreview(result.html || ""),
    onError: (error) => setPreviewError(error?.response?.data?.detail || t("web.errors.preview")),
  });
  const publishMutation = useMutation({
    mutationFn: async () => {
      // Always persist a fresh GrapesJS snapshot. Some commands (notably raw
      // code replacement and plugin actions) can bypass generic update events.
      const savedVersion = await autosave.saveNow();
      return cmsApi.publishPage(pageId, savedVersion);
    },
    onSuccess: () => { setPublishedNotice(t("web.editor.publishedNotice")); queryClient.invalidateQueries({ queryKey: ["web", "pages"] }); queryClient.invalidateQueries({ queryKey: ["web", "page", pageId] }); },
  });

  const changeTitle = (title) => {
    const next = { ...pageRef.current, title };
    pageRef.current = next;
    setPageForm(next);
    autosave.schedule();
  };
  const openMediaPicker = useCallback((target = "insert") => setMediaPickerTarget(target), []);
  const handleMediaSelect = useCallback(async (mediaItem) => {
    const target = mediaPickerTarget;
    setMediaPickerTarget(null);
    const instance = editor.editorRef.current;
    if (!instance) return;
    if (mediaItem.is_image || (mediaItem.mime && mediaItem.mime.startsWith("image/"))) {
      let src = mediaItem.url;
      // GrapesJS iframe has no auth; fetch the blob so it displays.
      try {
        const { data } = await api.get(mediaItem.url.replace(/^\/api\//, "/"), { responseType: "blob" });
        src = URL.createObjectURL(data);
      } catch { /* fall back to raw URL (broken icon if auth-required) */ }
      const attributes = {
        // Keep a blob URL only in the currently-open authenticated canvas.
        // The renderer derives the durable public URL from data-sc-media-id.
        src,
        alt: mediaItem.alt || "",
        "data-sc-media-id": String(mediaItem.id),
      };
      if (target && target !== "insert" && target.get?.("type") === "image") {
        target.addAttributes?.(attributes);
        target.set?.("src", src);
        autosaveRef.current?.schedule();
        return;
      }
      insertEditorComponents(instance, {
        type: "image",
        attributes,
      });
    } else {
      insertEditorComponents(instance, {
        type: "link",
        content: mediaItem.filename,
        attributes: { href: mediaItem.url, target: "_blank", "data-sc-media-id": String(mediaItem.id) },
      });
    }
  }, [editor.editorRef, mediaPickerTarget]);

  useEffect(() => {
    const instance = editor.editorRef.current;
    if (!instance || !editor.isReady) return undefined;
    const command = "sc:select-media";
    instance.Commands.add(command, {
      run: (_editor, _sender, options = {}) => {
        const component = options.component || instance.getSelected?.();
        if (component?.get?.("type") === "image") openMediaPicker(component);
      },
    });
    const addImageToolbarAction = (component) => {
      if (component?.get?.("type") !== "image") return;
      const toolbar = component.get?.("toolbar") || [];
      if (toolbar.some((item) => item.command === command)) return;
      component.set?.("toolbar", [...toolbar, {
        attributes: { class: "fa fa-images", title: t("web.chooseFromMedia") },
        command,
      }]);
    };
    instance.on("component:selected", addImageToolbarAction);
    addImageToolbarAction(instance.getSelected?.());
    return () => {
      instance.off("component:selected", addImageToolbarAction);
      instance.Commands.remove(command);
    };
  }, [editor.editorRef, editor.isReady, openMediaPicker, t]);
  const changePageForm = (patch) => {
    const next = { ...pageRef.current, ...patch };
    pageRef.current = next;
    setPageForm(next);
    autosave.schedule();
    if (Object.prototype.hasOwnProperty.call(patch, "template_id")) {
      // The current GrapesJS document still contains the old linked shell.
      // Save its page-owned slot content first, then ask the backend for a
      // freshly composed document using the newly selected template.
      void autosaveRef.current?.saveNow()
        .then(() => pageQuery.refetch())
        .catch(() => {});
    }
  };
  const selectedComponent = selected ? editor.editorRef.current?.getSelected() : null;
  const selectComponent = (component) => editor.editorRef.current?.select(component);
  const duplicateSelected = () => { if (!selectedComponent) return; const clone = selectedComponent.clone(); selectedComponent.parent()?.append(clone, { at: selectedComponent.index() + 1 }); };
  const deleteSelected = () => selectedComponent?.remove?.();
  const handleClone = useCallback(async (component, kind, definition) => {
    const apiKind = kind === "sections" ? "sections" : "components";
    try {
      const cloned = await cmsApi.cloneDesignResource(apiKind, definition.id);
      component?.set?.({
        resourceKind: apiKind === "sections" ? "section" : "component",
        resourceId: cloned.qualified_key || String(cloned.id),
        resourceName: cloned.name,
        props: { ...(component.get?.("props") || cloned.default_props || {}) },
      });
      autosaveRef.current?.schedule();
      queryClient.invalidateQueries({ queryKey: ["web", "design", apiKind] });
      return cloned;
    } catch (error) {
      console.error("clone failed", error);
      return null;
    }
  }, [queryClient]);
  const handleEditDefinition = useCallback(async (component, kind, definition) => {
    const apiKind = kind === "sections" ? "sections" : "components";
    let editable = definition;
    if (definition.is_locked || definition.theme_version_id) {
      editable = await handleClone(component, kind, definition);
    }
    if (!editable) return;
    try { await autosaveRef.current?.saveNow(); } catch { return; }
    navigate(`/admin/web/design/${apiKind}/${editable.id}/editor`);
  }, [handleClone, navigate]);
  const handleEditTemplate = useCallback(async (templateId) => {
    const definition = templates.find((item) => String(item.id) === String(templateId));
    if (!definition) return;
    let editable = definition;
    if (definition.theme_version_id || definition.is_system) {
      try {
        editable = await cmsApi.cloneTemplate(definition.id);
        queryClient.invalidateQueries({ queryKey: ["web", "templates"] });
        const next = { ...pageRef.current, template_id: editable.id };
        pageRef.current = next;
        setPageForm(next);
        autosaveRef.current?.schedule();
      } catch (error) {
        console.error("template clone failed", error);
        return;
      }
    }
    try { await autosaveRef.current?.saveNow(); } catch { return; }
    navigate(`/admin/web/design/templates/${editable.id}/editor`);
  }, [navigate, queryClient, templates]);
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
      autosaveRef.current?.schedule();
    } catch (error) {
      console.error("detach materialization failed", error);
      throw error;
    }
  }, [editor.editorRef]);
  const insertCatalogItem = (catalog, item) => {
    if (catalog === "data") return editor.addBlock(`sc-data-${safeId(item.id)}`);
    const instance = editor.editorRef.current;
    if (!instance) return [];
    return insertLinkedResource(instance, item, catalog);
  };
  const navigateAfterSave = async (destination) => {
    if (autosave.hasPendingChanges) {
      try { await autosave.saveNow(); }
      catch { return; }
    }
    navigate(destination);
  };
  const closePreview = useCallback(() => {
    setPreview(null);
    setPreviewError("");
  }, []);

  if (pageQuery.isLoading) return <div className="web-editor-loading"><LoadingSpinner /></div>;
  if (pageQuery.isError || !page) return <div className="web-editor-load-error"><h1>{t("web.errors.pageLoad")}</h1><button className="btn btn-primary" onClick={() => navigate("/admin/web/pages")}>{t("web.editor.back")}</button></div>;

  const changeMode = (nextMode) => {
    if (isCompactViewport()) setInspectorOpen(false);
    if (mode === nextMode) setLeftOpen((current) => !current);
    else { setMode(nextMode); setLeftOpen(true); }
  };
  const toggleInspector = () => {
    const next = !inspectorOpen;
    if (next && isCompactViewport()) setLeftOpen(false);
    setInspectorOpen(next);
  };

  return <div className={`web-editor-shell ${leftOpen ? "" : "left-closed"} ${inspectorOpen ? "" : "inspector-closed"}`}>
    <EditorTopbar title={pageForm.title} path={page.path || `/${pageForm.path_segment}`} device={device} saveStatus={autosave.status} inspectorOpen={inspectorOpen} canUndo={editor.canUndo} canRedo={editor.canRedo} canPublish={can("web.publish") || can("web.manage")} publishing={publishMutation.isPending} onBack={() => { void navigateAfterSave("/admin/web/pages"); }} onTitleChange={changeTitle} onUndo={editor.undo} onRedo={editor.redo} onDevice={(next) => { setDeviceState(next); editor.setDevice(next); }} onToggleInspector={toggleInspector} onPreview={() => previewMutation.mutate()} onPublish={() => publishMutation.mutate()} onSave={() => { void autosave.saveNow().catch(() => {}); }} />
    <EditorRail mode={mode} open={leftOpen} onMode={changeMode} onMedia={() => openMediaPicker()} />
    <EditorLeftPanel mode={mode} pages={pagesQuery.data || EMPTY} currentPageId={pageId} pageForm={pageForm} templates={templates} components={components} sections={sections} dataSources={dataSources} editor={editor.editorRef.current} selected={selectedComponent} onOpenPage={(nextId) => { void navigateAfterSave(`/admin/web/pages/${nextId}/editor`); }} onPageFormChange={changePageForm} onEditTemplate={handleEditTemplate} onRevisions={() => setRevisionsOpen(true)} onInsert={insertCatalogItem} onSelect={selectComponent} />
    <main className="web-editor-workbench"><div className="web-editor-canvas" ref={setCanvasElement} />{!editor.isReady && <div className="web-editor-canvas-loading"><i className="fas fa-spinner fa-spin" />{t("web.editor.loadingCanvas")}</div>}<EditorBreadcrumbs selected={selectedComponent} onSelect={selectComponent} /></main>
    <EditorInspector selected={selectedComponent} dataSources={dataSources} resources={{ components, sections }} onDuplicate={duplicateSelected} onDelete={deleteSelected} onClone={handleClone} onDetach={handleDetach} onEditDefinition={handleEditDefinition} onEditTemplate={handleEditTemplate} onContentChange={() => autosave.schedule()} />
    <div className="web-editor-mobile-note">{t("web.editor.wideScreenHint")}</div>
    <div className="visually-hidden" aria-live="polite">{publishedNotice || t(`web.editor.saveStates.${autosave.status}`)}</div>
    {autosave.conflict && <div className="web-editor-conflict" role="alert"><i className="fas fa-triangle-exclamation" /><span><strong>{t("web.editor.conflictTitle")}</strong>{t("web.editor.conflictBody")}</span><button type="button" className="btn btn-sm btn-light" onClick={() => window.location.reload()}>{t("web.editor.reloadLatest")}</button></div>}
    {(preview !== null || previewMutation.isPending || previewError) && <PreviewDialog html={preview || ""} loading={previewMutation.isPending} error={previewError} device={device} onClose={closePreview} />}
    {revisionsOpen && <RevisionsDialog pageId={pageId} onClose={() => setRevisionsOpen(false)} />}
    {mediaPickerTarget && <MediaPickerModal title={t("web.chooseFromMedia")} onSelect={handleMediaSelect} onClose={() => setMediaPickerTarget(null)} />}
  </div>;
}
