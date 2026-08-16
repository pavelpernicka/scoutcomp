import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import PropTypes from "prop-types";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import { useAuth } from "../../../providers/AuthProvider";
import { cmsApi } from "../api/cms";
import { linkedResourceInstance } from "../editor/resourceBlocks";
import useGrapesEditor from "../editor/useGrapesEditor";
import ResourcePropSchemaEditor from "./ResourcePropSchemaEditor";
import "../styles/editor.css";
import "./resource-editor.css";

const endpointKinds = {};
const devices = [["Desktop", "fa-desktop"], ["Tablet", "fa-tablet-screen-button"], ["Mobile", "fa-mobile-screen-button"]];

const itemsFrom = (value) => Array.isArray(value) ? value : value?.items || [];

export default function DesignResourceEditorPage({ kind }) {
  const { id } = useParams();
  const resourceId = Number(id);
  const endpointKind = endpointKinds[kind] || kind;
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [canvasElement, setCanvasElement] = useState(null);
  const containerRef = useMemo(() => ({ current: canvasElement }), [canvasElement]);
  const [form, setForm] = useState({ name: "", description: "", qualified_key: "", part_kind: "custom", prop_schema: [], default_props: {}, variants: [] });
  const formRef = useRef(form);
  const [draftVersion, setDraftVersion] = useState(1);
  const versionRef = useRef(1);
  const [status, setStatus] = useState("saved");
  const [error, setError] = useState("");
  const [device, setDeviceState] = useState("Desktop");
  const [leftPanel, setLeftPanel] = useState("insert");
  const [rightPanel, setRightPanel] = useState("style");
  const savedDirtyCountRef = useRef(undefined);
  const editGenerationRef = useRef(0);
  const savedGenerationRef = useRef(0);
  const lastSaveCleanRef = useRef(true);

  const listRequest = kind === "templates" ? cmsApi.listTemplates : () => cmsApi.listDesignResources(endpointKind);
  const queryKey = ["web", "design", endpointKind];
  const resourcesQuery = useQuery({ queryKey, queryFn: listRequest });
  const canvasStylesQuery = useQuery({
    queryKey: ["web", "canvas-styles"],
    queryFn: cmsApi.getCanvasStyles,
    retry: 1,
  });
  const sourcesQuery = useQuery({
    queryKey: ["web", "data-sources"],
    queryFn: cmsApi.listDataSources,
    enabled: can("web.design.manage") || can("web.manage"),
    retry: false,
  });
  // Sections can embed components; templates can embed sections+components.
  const sectionsQuery = useQuery({
    queryKey: ["web", "design", "sections", "catalog"],
    queryFn: () => cmsApi.listDesignResources("sections"),
    enabled: kind === "templates",
    retry: 1,
  });
  const componentsQuery = useQuery({
    queryKey: ["web", "design", "components", "catalog"],
    queryFn: () => cmsApi.listDesignResources("components"),
    enabled: kind === "templates" || kind === "sections",
    retry: 1,
  });
  const resource = itemsFrom(resourcesQuery.data).find((item) => item.id === resourceId);
  const readOnly = Boolean(resource?.is_locked || resource?.theme_version_id);
  const canPublish = can("web.publish") || can("web.manage");

  useEffect(() => {
    if (!resource) return;
    const next = {
      name: resource.name || "",
      description: resource.description || "",
      qualified_key: resource.qualified_key || resource.key || "",
      part_kind: resource.part_kind || "custom",
      prop_schema: resource.prop_schema || [],
      default_props: resource.default_props || {},
      variants: resource.variants || [],
    };
    setForm(next);
    formRef.current = next;
    setDraftVersion(resource.draft_version || 1);
    versionRef.current = resource.draft_version || 1;
    editGenerationRef.current = 0;
    setStatus("saved");
    setError("");
  }, [resource]);

  const editorBlocks = useMemo(() => {
    const blocks = [];
    if (kind === "templates") {
      blocks.push({
        id: "sc-template-content-slot",
        label: t("web.resourceEditor.contentSlot"),
        category: t("web.editor.catalog.structure"),
        content: { type: "sc-slot", name: "content", components: [] },
      });
    }
    // Insert reusable sections into templates.
    if (kind === "templates") {
      itemsFrom(sectionsQuery.data).forEach((section) => {
        blocks.push({
          id: `sc-section-${section.id}`,
          label: section.name,
          category: t("web.editor.catalog.sections"),
          content: linkedResourceInstance(section, "section"),
        });
      });
    }
    // Insert reusable components into templates and sections.
    if (kind === "templates" || kind === "sections") {
      itemsFrom(componentsQuery.data).forEach((component) => {
        blocks.push({
          id: `sc-component-${component.id}`,
          label: component.name,
          category: t("web.editor.catalog.components"),
          content: linkedResourceInstance(component, "component"),
        });
      });
    }
    return blocks;
  }, [kind, t, sectionsQuery.data, componentsQuery.data]);

  const editor = useGrapesEditor({
    containerRef,
    projectData: resource?.project_data,
    legacyCss: resource?.css || "",
    loadKey: resource?.id,
    dataSources: itemsFrom(sourcesQuery.data),
    blocks: editorBlocks,
    canvasStyles: canvasStylesQuery.data?.css ? [{ href: "", css: canvasStylesQuery.data.css }] : [],
    translate: t,
    onDirtyChange: (dirty) => { if (dirty && !readOnly) setStatus("unsaved"); },
    onReady: (instance) => {
      if (resource?.css) instance.addStyle(resource.css);
      instance.clearDirtyCount();
    },
    onError: () => setError(t("web.errors.editorLoad")),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const snapshot = editor.getSnapshot();
      if (!snapshot) throw new Error(t("web.errors.editorLoad"));
      savedDirtyCountRef.current = snapshot.dirtyCount;
      savedGenerationRef.current = editGenerationRef.current;
      const current = formRef.current;
      const common = {
        name: current.name.trim(),
        description: current.description.trim() || null,
        project_data: snapshot.projectData,
        css: snapshot.css || resource?.css || "",
        prop_schema: current.prop_schema || [],
        default_props: current.default_props || {},
        variants: current.variants || [],
        expected_version: versionRef.current,
      };
      return kind === "templates"
        ? cmsApi.updateTemplate(resourceId, { ...common, key: current.qualified_key, qualified_key: current.qualified_key, template_kind: resource?.template_kind || "layout" })
        : cmsApi.updateDesignResource(endpointKind, resourceId, { ...common, qualified_key: current.qualified_key, part_kind: current.part_kind });
    },
    onMutate: () => { setStatus("saving"); setError(""); },
    onSuccess: (saved) => {
      const nextVersion = saved.draft_version || versionRef.current + 1;
      versionRef.current = nextVersion;
      setDraftVersion(nextVersion);
      const clean = savedGenerationRef.current === editGenerationRef.current
        && editor.markSaved(savedDirtyCountRef.current);
      lastSaveCleanRef.current = clean;
      setStatus(clean ? "saved" : "unsaved");
      if (clean) {
        queryClient.setQueryData(queryKey, (current) => {
          if (!Array.isArray(current)) return current;
          return current.map((item) => item.id === resourceId ? saved : item);
        });
      }
    },
    onError: (requestError) => {
      const conflict = requestError?.response?.status === 409;
      setStatus(conflict ? "conflict" : "failed");
      setError(requestError?.response?.data?.detail || t(conflict ? "web.resourceEditor.conflict" : "web.resourceEditor.saveFailed"));
    },
  });

  const save = useCallback(() => {
    if (readOnly) return Promise.resolve({ version: draftVersion, clean: true });
    if (saveMutation.isPending) return Promise.resolve({ version: draftVersion, clean: false });
    return saveMutation.mutateAsync().then((saved) => ({
      version: saved.draft_version,
      clean: lastSaveCleanRef.current,
    }));
  }, [draftVersion, readOnly, saveMutation]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      const saved = status === "saved"
        ? { version: versionRef.current, clean: true }
        : await save();
      if (!saved.clean) throw new Error(t("web.resourceEditor.saveBeforePublish"));
      return kind === "templates"
        ? cmsApi.publishTemplate(resourceId, saved.version)
        : cmsApi.publishDesignResource(endpointKind, resourceId, saved.version);
    },
    onSuccess: (published) => {
      setStatus("saved");
      queryClient.setQueryData(queryKey, (current) => Array.isArray(current)
        ? current.map((item) => item.id === resourceId ? published : item)
        : current);
    },
    onError: (requestError) => setError(requestError?.response?.data?.detail || requestError?.message || t("web.resourceEditor.publishFailed")),
  });

  const regeneratePreview = useMutation({
    mutationFn: () => cmsApi.regenerateDesignPreview(endpointKind, resourceId),
    onSuccess: (updated) => {
      queryClient.setQueryData(queryKey, (current) => Array.isArray(current)
        ? current.map((item) => item.id === resourceId ? updated : item)
        : current);
      setStatus("saved");
    },
  });

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [save]);

  const changeForm = (field, value) => {
    editGenerationRef.current += 1;
    const next = { ...formRef.current, [field]: value };
    formRef.current = next;
    setForm(next);
    if (!readOnly) setStatus("unsaved");
  };

  if (resourcesQuery.isLoading) return <div className="web-editor-loading"><LoadingSpinner /></div>;
  if (resourcesQuery.isError || !resource) return <div className="web-editor-load-error"><h1>{t("web.resourceEditor.notFound")}</h1><button className="btn btn-primary" onClick={() => navigate(`/admin/web/design/${kind}`)}>{t("web.editor.back")}</button></div>;

  return <div className="web-editor-shell web-resource-editor-shell">
    <header className="web-editor-topbar">
      <button type="button" className="web-editor-icon-button" onClick={() => navigate(`/admin/web/design/${kind}`)} title={t("web.resourceEditor.back")}><i className="fas fa-arrow-left" /></button>
      <div className="web-editor-document"><input aria-label={t("web.fields.name")} value={form.name} disabled={readOnly} onChange={(event) => changeForm("name", event.target.value)} /><span>{t(`web.design.${kind}`)} · {form.qualified_key}</span></div>
      <div className="web-editor-history" role="group" aria-label={t("web.editor.historyActions")}><button type="button" disabled={!editor.canUndo || readOnly} onClick={editor.undo}><i className="fas fa-rotate-left" /></button><button type="button" disabled={!editor.canRedo || readOnly} onClick={editor.redo}><i className="fas fa-rotate-right" /></button></div>
      <div className="web-editor-devices" role="group" aria-label={t("web.editor.viewport")}>{devices.map(([name, icon]) => <button key={name} type="button" className={device === name ? "active" : ""} aria-pressed={device === name} onClick={() => { setDeviceState(name); editor.setDevice(name); }} title={t(`web.editor.devices.${name.toLowerCase()}`)}><i className={`fas ${icon}`} /></button>)}</div>
      {readOnly ? <span className="web-editor-save-state"><i className="fas fa-lock" />{t("web.resourceEditor.readOnly")}</span> : <button type="button" className={`web-editor-save-state ${status}`} disabled={saveMutation.isPending || !form.name.trim() || !form.qualified_key.trim()} onClick={save}><i className={`fas ${status === "saving" ? "fa-spinner fa-spin" : status === "saved" ? "fa-check" : status === "conflict" ? "fa-triangle-exclamation" : "fa-circle"}`} />{t(`web.editor.saveStates.${status}`)}</button>}
      {!readOnly && <button type="button" className="btn btn-sm btn-outline-secondary" title={t("web.resourceEditor.regeneratePreview")} disabled={regeneratePreview.isPending} onClick={() => regeneratePreview.mutate()}><i className={`fas ${regeneratePreview.isPending ? "fa-spinner fa-spin" : "fa-rotate"}`} /></button>}
      {canPublish && !readOnly && <button type="button" className="btn btn-sm btn-primary" disabled={publishMutation.isPending || saveMutation.isPending || status === "conflict"} onClick={() => publishMutation.mutate()}><i className="fas fa-arrow-up-from-bracket me-2" />{publishMutation.isPending ? t("web.states.publishing") : t("web.editor.publish")}</button>}
    </header>

    <aside className="web-resource-editor-left">
      <div className="web-editor-catalog-tabs"><button type="button" className={leftPanel === "insert" ? "active" : ""} onClick={() => setLeftPanel("insert")}>{t("web.editor.insert")}</button><button type="button" className={leftPanel === "layers" ? "active" : ""} onClick={() => setLeftPanel("layers")}>{t("web.editor.layers")}</button></div>
      <div className={`web-editor-block-manager ${leftPanel === "insert" ? "" : "d-none"}`} />
      <div className={`web-editor-layer-manager ${leftPanel === "layers" ? "" : "d-none"}`} />
      <div className="web-resource-fields">
        <label><span>{t("web.resourceEditor.key")}</span><input value={form.qualified_key} disabled={readOnly} onChange={(event) => changeForm("qualified_key", event.target.value)} /></label>
        <label><span>{t("web.resourceEditor.description")}</span><textarea rows="3" value={form.description} disabled={readOnly} onChange={(event) => changeForm("description", event.target.value)} /></label>
        
      </div>
    </aside>

    <main className="web-editor-workbench"><div className="web-editor-canvas" ref={setCanvasElement} />{!editor.isReady && <div className="web-editor-canvas-loading"><i className="fas fa-spinner fa-spin" />{t("web.editor.loadingCanvas")}</div>}</main>

    <aside className="web-editor-inspector web-resource-editor-right">
      <div className="web-editor-inspector-tabs"><button type="button" className={rightPanel === "style" ? "active" : ""} onClick={() => setRightPanel("style")}>{t("web.editor.inspectorTabs.style")}</button><button type="button" className={rightPanel === "content" ? "active" : ""} onClick={() => setRightPanel("content")}>{t("web.editor.inspectorTabs.content")}</button>{kind !== "templates" && <button type="button" className={rightPanel === "props" ? "active" : ""} onClick={() => setRightPanel("props")}>{t("web.props.tab")}</button>}</div>
      <div className={`web-editor-style-manager ${rightPanel === "style" ? "" : "d-none"}`} />
      <div className={`web-editor-trait-manager ${rightPanel === "content" ? "" : "d-none"}`} />
      {kind !== "templates" && rightPanel === "props" && <ResourcePropSchemaEditor
        schema={form.prop_schema}
        defaults={form.default_props}
        disabled={readOnly}
        onChange={(propSchema, defaultProps) => {
          const next = { ...formRef.current, prop_schema: propSchema, default_props: defaultProps };
          formRef.current = next;
          setForm(next);
          editGenerationRef.current += 1;
          setStatus("unsaved");
        }}
      />}
    </aside>

    {(error || status === "conflict") && <div className="web-editor-conflict" role="alert"><i className="fas fa-triangle-exclamation" /><span><strong>{status === "conflict" ? t("web.editor.conflictTitle") : t("web.resourceEditor.error")}</strong>{error}</span>{status === "conflict" && <button type="button" className="btn btn-sm btn-light" onClick={() => window.location.reload()}>{t("web.editor.reloadLatest")}</button>}</div>}
    <span className="visually-hidden" aria-live="polite">{t(`web.editor.saveStates.${status}`)}</span>
  </div>;
}

DesignResourceEditorPage.propTypes = { kind: PropTypes.oneOf(["templates", "components", "sections"]).isRequired };
