import { useCallback, useEffect, useRef, useState } from "react";
import grapesjs from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";

import {
  configureEditor,
  createEditorConfig,
  fontFamilyOptions,
  getEditorSnapshot,
  inlineCanvasCss,
  loadEditorProject,
  registerBuilderBlocks,
} from "./grapes";
import { insertEditorComponents } from "./editorInsertion";

const selectedSummary = (component) => {
  if (!component) return null;
  const parent = component.parent?.();
  return {
    id: component.getId?.() || component.cid,
    type: component.get?.("type") || "default",
    name: component.getName?.() || component.get?.("name") || "",
    parentId: parent?.getId?.() || parent?.cid || null,
  };
};

const report = (callback, value) => callback?.(value);

export const subscribeToEditorChanges = (editor, onChange) => {
  const model = editor.getModel?.();
  editor.on("update", onChange);
  model?.on?.("change:changesCount", onChange);

  return () => {
    editor.off("update", onChange);
    model?.off?.("change:changesCount", onChange);
  };
};

export const clampCanvasToolbar = (editor, inset = 8) => {
  const toolbar = editor?.Canvas?.getToolbarEl?.();
  const boundary = editor?.Canvas?.getElement?.() || toolbar?.offsetParent;
  if (!toolbar || !boundary || toolbar.style.display === "none") return false;

  const toolbarRect = toolbar.getBoundingClientRect?.();
  const boundaryRect = boundary.getBoundingClientRect?.();
  if (!toolbarRect || !boundaryRect || !toolbarRect.width || !toolbarRect.height) return false;

  const currentLeft = Number.parseFloat(toolbar.style.left) || toolbar.offsetLeft || 0;
  const currentTop = Number.parseFloat(toolbar.style.top) || toolbar.offsetTop || 0;
  const availableWidth = Math.max(0, boundaryRect.width - inset * 2);
  toolbar.style.maxWidth = `${availableWidth}px`;

  let shiftX = 0;
  if (toolbarRect.width >= availableWidth) shiftX = boundaryRect.left + inset - toolbarRect.left;
  else if (toolbarRect.left < boundaryRect.left + inset) shiftX = boundaryRect.left + inset - toolbarRect.left;
  else if (toolbarRect.right > boundaryRect.right - inset) shiftX = boundaryRect.right - inset - toolbarRect.right;

  let shiftY = 0;
  if (toolbarRect.top < boundaryRect.top + inset) shiftY = boundaryRect.top + inset - toolbarRect.top;
  else if (toolbarRect.bottom > boundaryRect.bottom - inset) shiftY = boundaryRect.bottom - inset - toolbarRect.bottom;

  toolbar.style.left = `${Math.round(currentLeft + shiftX)}px`;
  toolbar.style.top = `${Math.round(currentTop + shiftY)}px`;
  return Boolean(shiftX || shiftY);
};

/** Keep the device viewport real while making narrow previews useful to edit. */
export const calculateFitZoom = (availableWidth, deviceWidth, { minimum = 50, maximum = 240, gutter = 32 } = {}) => {
  const available = Number(availableWidth);
  const logical = Number(deviceWidth);
  if (!Number.isFinite(available) || !Number.isFinite(logical) || available <= 0 || logical <= 0) return 100;
  return Math.round(Math.max(minimum, Math.min(maximum, ((available - gutter) / logical) * 100)));
};

/** Keep shared theme CSS before GrapesJS page-owned rules in the iframe. */
export const applyInlineCanvasStyles = (editor, css) => {
  const head = editor?.Canvas?.getDocument?.()?.head;
  if (!head) return null;
  let styleNode = head.querySelector("#sc-canvas-styles");
  if (!css) {
    styleNode?.remove();
    return null;
  }
  if (!styleNode) {
    styleNode = head.ownerDocument.createElement("style");
    styleNode.id = "sc-canvas-styles";
    styleNode.setAttribute("data-scoutcomp", "canvas");
    // The public cascade is theme/global/template first and page-owned
    // GrapesJS CSS last. Appending here would reverse that order when the
    // shared styles arrive after editor initialization.
    head.prepend(styleNode);
  }
  if (styleNode.textContent !== css) styleNode.textContent = css;
  return styleNode;
};

/**
 * Owns one GrapesJS 0.21.9 instance for a mounted editor shell.
 *
 * React receives only small UI summaries. The component/style/page models stay
 * in GrapesJS and callers obtain canonical JSON explicitly through getSnapshot.
 */
export function useGrapesEditor({
  containerRef,
  projectData,
  legacyHtml = "",
  legacyCss = "",
  loadKey,
  dataSources = [],
  blocks = [],
  translate,
  language = "cs",
  devices,
  styleSectors,
  fontSets = [],
  canvasStyles = [],
  editorConfig,
  preferContentSlotInsertion = false,
  onDirtyChange,
  onSelectionChange,
  onHistoryChange,
  onReady,
  onError,
} = {}) {
  const editorRef = useRef(null);
  const loadedInputRef = useRef(null);
  const inputRef = useRef({ projectData, legacyHtml, legacyCss, loadKey });
  const catalogueRef = useRef({ dataSources, blocks, translate, language });
  const callbacksRef = useRef({
    onDirtyChange,
    onSelectionChange,
    onHistoryChange,
    onReady,
    onError,
  });
  const [isReady, setIsReady] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [selected, setSelected] = useState(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [canvasZoom, setCanvasZoom] = useState(100);

  inputRef.current = { projectData, legacyHtml, legacyCss, loadKey };
  catalogueRef.current = { dataSources, blocks, translate, language };
  callbacksRef.current = {
    onDirtyChange,
    onSelectionChange,
    onHistoryChange,
    onReady,
    onError,
  };

  const updateHistoryState = useCallback((editor) => {
    const next = {
      canUndo: editor.UndoManager.hasUndo(),
      canRedo: editor.UndoManager.hasRedo(),
    };
    setCanUndo(next.canUndo);
    setCanRedo(next.canRedo);
    report(callbacksRef.current.onHistoryChange, next);
  }, []);

  const updateDirtyState = useCallback((editor) => {
    const next = editor.getDirtyCount() > 0;
    setIsDirty(next);
    report(callbacksRef.current.onDirtyChange, next);
    updateHistoryState(editor);
  }, [updateHistoryState]);

  const loadProject = useCallback((input = {}) => {
    const editor = editorRef.current;
    if (!editor) return null;
    const result = loadEditorProject(editor, input);
    loadedInputRef.current = {
      key: input.loadKey,
      projectData: input.projectData,
      legacyHtml: input.legacyHtml,
      legacyCss: input.legacyCss,
    };
    setIsDirty(false);
    setSelected(null);
    updateHistoryState(editor);
    report(callbacksRef.current.onDirtyChange, false);
    report(callbacksRef.current.onSelectionChange, null);
    return result;
  }, [updateHistoryState]);

  useEffect(() => {
    const container = containerRef?.current;
    if (!container || editorRef.current) return undefined;

    let editor;
    let active = true;
    try {
      const baseConfig = createEditorConfig({
        container,
        devices,
        styleSectors,
        fontSets,
        canvasStyles,
        language: catalogueRef.current.language,
        translate: catalogueRef.current.translate,
      });
      editor = grapesjs.init({ ...baseConfig, ...editorConfig, container });
      editorRef.current = editor;
      configureEditor(editor, catalogueRef.current);

      const onUpdate = () => updateDirtyState(editor);
      const onSelection = (component) => {
        const summary = selectedSummary(component || editor.getSelected());
        setSelected(summary);
        report(callbacksRef.current.onSelectionChange, summary);
      };
      const onDeselection = () => {
        if (editor.getSelected()) return;
        setSelected(null);
        report(callbacksRef.current.onSelectionChange, null);
      };
      const onHistory = () => updateHistoryState(editor);
      let toolbarFrame = 0;
      const scheduleToolbarClamp = () => {
        if (toolbarFrame) window.cancelAnimationFrame(toolbarFrame);
        toolbarFrame = window.requestAnimationFrame(() => {
          toolbarFrame = 0;
          clampCanvasToolbar(editor);
        });
      };
      const unsubscribeChanges = subscribeToEditorChanges(editor, onUpdate);

      editor.on("component:selected", onSelection);
      editor.on("component:deselected", onDeselection);
      editor.on("undo", onHistory);
      editor.on("redo", onHistory);
      const toolbarEvents = [
        "component:selected",
        "component:update",
        "canvas:tools:update",
        "canvas:refresh",
        "canvas:scroll",
        "canvas:frame:load",
      ];
      toolbarEvents.forEach((event) => editor.on(event, scheduleToolbarClamp));
      window.addEventListener("resize", scheduleToolbarClamp);

      const initial = inputRef.current;
      if (initial.projectData !== undefined || initial.legacyHtml || initial.legacyCss) {
        loadProject(initial);
      }
      editor.onReady(() => {
        if (!active) return;
        setIsReady(true);
        report(callbacksRef.current.onReady, editor);
      });

      return () => {
        active = false;
        unsubscribeChanges();
        editor.off("component:selected", onSelection);
        editor.off("component:deselected", onDeselection);
        editor.off("undo", onHistory);
        editor.off("redo", onHistory);
        toolbarEvents.forEach((event) => editor.off(event, scheduleToolbarClamp));
        window.removeEventListener("resize", scheduleToolbarClamp);
        if (toolbarFrame) window.cancelAnimationFrame(toolbarFrame);
        editor.destroy();
        if (editorRef.current === editor) editorRef.current = null;
      };
    } catch (error) {
      editor?.destroy();
      editorRef.current = null;
      report(callbacksRef.current.onError, error);
      return undefined;
    }
  }, [
    containerRef,
    loadProject,
    updateDirtyState,
    updateHistoryState,
  ]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isReady) return;
    registerBuilderBlocks(editor, { dataSources, blocks, translate });
  }, [blocks, dataSources, isReady, translate]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isReady) return;
    const property = editor.StyleManager?.getProperty?.("typography", "font-family");
    property?.set?.("options", fontFamilyOptions(fontSets));
  }, [fontSets, isReady]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isReady) return undefined;

    const css = inlineCanvasCss(canvasStyles);

    // GrapesJS renders the canvas inside an iframe. Inline CSS cannot go
    // through `canvas.styles` (that config expects <link> URLs), so we keep
    // a dedicated <style id="sc-canvas-styles"> element in the frame head and
    // update its textContent whenever the published tokens/theme CSS change.
    const applyCanvasStyles = () => applyInlineCanvasStyles(editor, css);

    // GrapesJS fires these events at different stages of frame lifecycle.
    // We try to apply on each one to cover both initial load and re-renders.
    editor.on("canvas:frame:load:head", applyCanvasStyles);
    editor.on("canvas:frame:load:body", applyCanvasStyles);
    editor.on("canvas:frame:load", applyCanvasStyles);

    // Also try on component:update and load events
    editor.on("load", applyCanvasStyles);
    editor.on("component:update", applyCanvasStyles);

    // Immediate attempt + retries to handle race between effect and iframe ready
    applyCanvasStyles();
    const t1 = window.setTimeout(applyCanvasStyles, 80);
    const t2 = window.setTimeout(applyCanvasStyles, 300);
    const t3 = window.setTimeout(applyCanvasStyles, 1000);

    return () => {
      editor.off("canvas:frame:load:head", applyCanvasStyles);
      editor.off("canvas:frame:load:body", applyCanvasStyles);
      editor.off("canvas:frame:load", applyCanvasStyles);
      editor.off("load", applyCanvasStyles);
      editor.off("component:update", applyCanvasStyles);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      window.clearTimeout(t3);
    };
  }, [canvasStyles, isReady]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !isReady || projectData === undefined) return;
    const loaded = loadedInputRef.current;
    const alreadyLoaded = loadKey !== undefined
      ? loaded?.key === loadKey
      : loaded?.projectData === projectData
        && loaded?.legacyHtml === legacyHtml
        && loaded?.legacyCss === legacyCss;
    if (!alreadyLoaded) {
      loadProject({ projectData, legacyHtml, legacyCss, loadKey });
    }
  }, [isReady, legacyCss, legacyHtml, loadKey, loadProject, projectData]);

  const getSnapshot = useCallback(() => {
    const editor = editorRef.current;
    return editor ? getEditorSnapshot(editor) : null;
  }, []);

  const markSaved = useCallback((dirtyCountAtSave) => {
    const editor = editorRef.current;
    if (!editor) return false;
    if (dirtyCountAtSave !== undefined && editor.getDirtyCount() !== dirtyCountAtSave) {
      return false;
    }
    editor.clearDirtyCount();
    setIsDirty(false);
    report(callbacksRef.current.onDirtyChange, false);
    return true;
  }, []);

  const undo = useCallback(() => editorRef.current?.UndoManager.undo(), []);
  const redo = useCallback(() => editorRef.current?.UndoManager.redo(), []);
  const setDevice = useCallback((deviceId) => {
    const manager = editorRef.current?.Devices;
    if (!manager) return undefined;
    const requested = String(deviceId).toLowerCase();
    const device = manager.getAll().find((item) =>
      String(item.id || item.get?.("id") || item.get?.("name")).toLowerCase() === requested
      || String(item.get?.("name") || "").toLowerCase() === requested,
    );
    return manager.select(device || deviceId);
  }, []);
  const fitDevice = useCallback((deviceId) => {
    const editor = editorRef.current;
    const manager = editor?.Devices;
    const canvas = editor?.Canvas;
    if (!manager || !canvas) return 100;
    const requested = String(deviceId || "desktop").toLowerCase();
    const device = manager.getAll().find((item) =>
      String(item.id || item.get?.("id") || item.get?.("name")).toLowerCase() === requested
      || String(item.get?.("name") || "").toLowerCase() === requested,
    );
    const width = String(device?.get?.("width") || device?.width || "");
    const logicalWidth = Number.parseFloat(width);
    const availableWidth = canvas.getElement?.()?.clientWidth || containerRef?.current?.clientWidth || 0;
    const zoom = Number.isFinite(logicalWidth) && logicalWidth > 0
      ? calculateFitZoom(availableWidth, logicalWidth, {
        minimum: requested === "desktop" ? 25 : requested === "tablet" ? 40 : 50,
        maximum: requested === "mobile" ? 240 : 100,
      })
      : 100;
    canvas.setZoom?.(zoom);
    editor.refresh?.({ tools: true });
    setCanvasZoom(zoom);
    return zoom;
  }, [containerRef]);
  const addBlock = useCallback((blockId) => {
    const editor = editorRef.current;
    const block = editor?.BlockManager.get(blockId);
    if (!editor || !block) return [];
    if (preferContentSlotInsertion) {
      return insertEditorComponents(editor, block.get("content"));
    }
    return editor.addComponents(block.get("content"));
  }, [preferContentSlotInsertion]);

  return {
    editorRef,
    isReady,
    isDirty,
    selected,
    canUndo,
    canRedo,
    canvasZoom,
    loadProject,
    getSnapshot,
    markSaved,
    undo,
    redo,
    setDevice,
    fitDevice,
    addBlock,
  };
}

export default useGrapesEditor;
