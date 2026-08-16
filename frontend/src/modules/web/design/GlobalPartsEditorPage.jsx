import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";

import LoadingSpinner from "../../../components/LoadingSpinner";
import { useAuth } from "../../../providers/AuthProvider";
import { cmsApi } from "../api/cms";
import useGrapesEditor from "../editor/useGrapesEditor";
import "../styles/editor.css";

const devices = [
  ["Desktop", "fa-desktop"],
  ["Tablet", "fa-tablet-screen-button"],
  ["Mobile", "fa-mobile-screen-button"],
];

const itemsFrom = (value) => (Array.isArray(value) ? value : value?.items || []);

export default function GlobalPartsEditorPage() {
  const { id } = useParams();
  const partId = Number(id);
  const { t } = useTranslation();
  const { can } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [canvasElement, setCanvasElement] = useState(null);
  const containerRef = useMemo(() => ({ current: canvasElement }), [canvasElement]);
  const [form, setForm] = useState({ name: "", description: "", qualified_key: "" });
  const formRef = useRef(form);
  const versionRef = useRef(1);
  const [status, setStatus] = useState("saved");
  const [error, setError] = useState("");
  const [device, setDeviceState] = useState("Desktop");
  const [leftPanel, setLeftPanel] = useState("insert");
  const [rightPanel, setRightPanel] = useState("style");
  const savedDirtyCountRef = useRef(undefined);

  const partsQuery = useQuery({
    queryKey: ["web", "global-parts"],
    queryFn: cmsApi.listGlobalParts,
  });
  const canvasStylesQuery = useQuery({
    queryKey: ["web", "canvas-styles"],
    queryFn: cmsApi.getCanvasStyles,
    retry: 1,
  });

  const part = itemsFrom(partsQuery.data).find((item) => item.id === partId);
  const canPublish = can("web.publish") || can("web.manage");

  useEffect(() => {
    if (!part) return;
    setForm({
      name: part.name || "",
      description: part.description || "",
      qualified_key: part.qualified_key || "",
    });
    formRef.current = {
      name: part.name || "",
      description: part.description || "",
      qualified_key: part.qualified_key || "",
    };
    versionRef.current = part.draft_version || 1;
    setStatus("saved");
    setError("");
  }, [part]);

  const editor = useGrapesEditor({
    containerRef,
    projectData: part?.project_data,
    legacyCss: part?.css || "",
    loadKey: part?.id,
    dataSources: [],
    blocks: [],
    canvasStyles: canvasStylesQuery.data?.css ? [{ href: "", css: canvasStylesQuery.data.css }] : [],
    translate: t,
    onDirtyChange: (dirty) => {
      if (dirty) setStatus("unsaved");
    },
    onReady: (instance) => {
      if (part?.css) instance.addStyle(part.css);
      instance.clearDirtyCount();
    },
    onError: () => setError(t("web.errors.editorLoad")),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const snapshot = editor.getSnapshot();
      if (!snapshot) throw new Error(t("web.errors.editorLoad"));
      savedDirtyCountRef.current = snapshot.dirtyCount;
      const current = formRef.current;
      return cmsApi.updateGlobalPart(partId, {
        name: current.name.trim(),
        description: current.description.trim() || null,
        qualified_key: current.qualified_key,
        project_data: snapshot.projectData,
        css: snapshot.css || part?.css || "",
        expected_version: versionRef.current,
      });
    },
    onMutate: () => {
      setStatus("saving");
      setError("");
    },
    onSuccess: (saved) => {
      versionRef.current = saved.draft_version || versionRef.current + 1;
      const clean = editor.markSaved(savedDirtyCountRef.current);
      setStatus(clean ? "saved" : "unsaved");
      if (clean) {
        queryClient.setQueryData(["web", "global-parts"], (current) =>
          Array.isArray(current)
            ? current.map((item) => (item.id === partId ? saved : item))
            : current,
        );
      }
    },
    onError: (requestError) => {
      const conflict = requestError?.response?.status === 409;
      setStatus(conflict ? "conflict" : "failed");
      setError(
        requestError?.response?.data?.detail ||
          t(conflict ? "web.resourceEditor.conflict" : "web.resourceEditor.saveFailed"),
      );
    },
  });

  const save = useCallback(() => {
    if (saveMutation.isPending) return;
    saveMutation.mutate();
  }, [saveMutation]);

  const publishMutation = useMutation({
    mutationFn: async () => {
      // Ensure saved before publish
      if (status !== "saved") {
        await saveMutation.mutateAsync();
      }
      return cmsApi.publishGlobalPart(partId, versionRef.current);
    },
    onSuccess: (published) => {
      setStatus("saved");
      queryClient.setQueryData(["web", "global-parts"], (current) =>
        Array.isArray(current)
          ? current.map((item) => (item.id === partId ? published : item))
          : current,
      );
    },
    onError: (requestError) =>
      setError(
        requestError?.response?.data?.detail ||
          requestError?.message ||
          t("web.resourceEditor.publishFailed"),
      ),
  });

  useEffect(() => {
    const handler = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [save]);

  if (partsQuery.isLoading) return <div className="web-editor-loading"><LoadingSpinner /></div>;
  if (partsQuery.isError || !part)
    return (
      <div className="web-editor-load-error">
        <h1>{t("web.resourceEditor.notFound")}</h1>
        <button className="btn btn-primary" onClick={() => navigate("/admin/web/design/global-parts")}>
          {t("web.editor.back")}
        </button>
      </div>
    );

  return (
    <div className="web-editor-shell web-resource-editor-shell">
      <header className="web-editor-topbar">
        <button
          type="button"
          className="web-editor-icon-button"
          onClick={() => navigate("/admin/web/design/global-parts")}
          title={t("web.resourceEditor.back")}
        >
          <i className="fas fa-arrow-left" />
        </button>
        <div className="web-editor-document">
          <input
            aria-label={t("web.fields.name")}
            value={form.name}
            onChange={(event) => {
              formRef.current = { ...formRef.current, name: event.target.value };
              setForm({ ...formRef.current });
              setStatus("unsaved");
            }}
          />
          <span>{t("web.design.parts")} · {form.qualified_key}</span>
        </div>
        <div className="web-editor-history" role="group" aria-label={t("web.editor.historyActions")}>
          <button type="button" disabled={!editor.canUndo} onClick={editor.undo}>
            <i className="fas fa-rotate-left" />
          </button>
          <button type="button" disabled={!editor.canRedo} onClick={editor.redo}>
            <i className="fas fa-rotate-right" />
          </button>
        </div>
        <div className="web-editor-devices" role="group" aria-label={t("web.editor.viewport")}>
          {devices.map(([name, icon]) => (
            <button
              key={name}
              type="button"
              className={device === name ? "active" : ""}
              aria-pressed={device === name}
              onClick={() => {
                setDeviceState(name);
                editor.setDevice(name);
              }}
              title={t(`web.editor.devices.${name.toLowerCase()}`)}
            >
              <i className={`fas ${icon}`} />
            </button>
          ))}
        </div>
        <button
          type="button"
          className={`web-editor-save-state ${status}`}
          disabled={saveMutation.isPending || !form.name.trim() || !form.qualified_key.trim()}
          onClick={save}
        >
          <i
            className={`fas ${
              status === "saving"
                ? "fa-spinner fa-spin"
                : status === "saved"
                  ? "fa-check"
                  : status === "conflict"
                    ? "fa-triangle-exclamation"
                    : "fa-circle"
            }`}
          />
          {t(`web.editor.saveStates.${status}`)}
        </button>
        {canPublish && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={publishMutation.isPending || saveMutation.isPending || status === "conflict"}
            onClick={() => publishMutation.mutate()}
          >
            <i className="fas fa-arrow-up-from-bracket me-2" />
            {publishMutation.isPending ? t("web.states.publishing") : t("web.editor.publish")}
          </button>
        )}
      </header>

      <aside className="web-resource-editor-left">
        <div className="web-editor-catalog-tabs">
          <button
            type="button"
            className={leftPanel === "insert" ? "active" : ""}
            onClick={() => setLeftPanel("insert")}
          >
            {t("web.editor.insert")}
          </button>
          <button
            type="button"
            className={leftPanel === "layers" ? "active" : ""}
            onClick={() => setLeftPanel("layers")}
          >
            {t("web.editor.layers")}
          </button>
        </div>
        <div className={`web-editor-block-manager ${leftPanel === "insert" ? "" : "d-none"}`} />
        <div className={`web-editor-layer-manager ${leftPanel === "layers" ? "" : "d-none"}`} />
        <div className="web-resource-fields">
          <label>
            <span>{t("web.resourceEditor.key")}</span>
            <input
              value={form.qualified_key}
              onChange={(event) => {
                formRef.current = { ...formRef.current, qualified_key: event.target.value };
                setForm({ ...formRef.current });
                setStatus("unsaved");
              }}
            />
          </label>
          <label>
            <span>{t("web.resourceEditor.description")}</span>
            <textarea
              rows="3"
              value={form.description}
              onChange={(event) => {
                formRef.current = { ...formRef.current, description: event.target.value };
                setForm({ ...formRef.current });
                setStatus("unsaved");
              }}
            />
          </label>
        </div>
      </aside>

      <main className="web-editor-workbench">
        <div className="web-editor-canvas" ref={setCanvasElement} />
        {!editor.isReady && (
          <div className="web-editor-canvas-loading">
            <i className="fas fa-spinner fa-spin" />
            {t("web.editor.loadingCanvas")}
          </div>
        )}
      </main>

      <aside className="web-editor-inspector web-resource-editor-right">
        <div className="web-editor-inspector-tabs">
          <button
            type="button"
            className={rightPanel === "style" ? "active" : ""}
            onClick={() => setRightPanel("style")}
          >
            {t("web.editor.inspectorTabs.style")}
          </button>
          <button
            type="button"
            className={rightPanel === "content" ? "active" : ""}
            onClick={() => setRightPanel("content")}
          >
            {t("web.editor.inspectorTabs.content")}
          </button>
        </div>
        <div className={`web-editor-style-manager ${rightPanel === "style" ? "" : "d-none"}`} />
        <div className={`web-editor-trait-manager ${rightPanel === "content" ? "" : "d-none"}`} />
      </aside>

      {(error || status === "conflict") && (
        <div className="web-editor-conflict" role="alert">
          <i className="fas fa-triangle-exclamation" />
          <span>
            <strong>
              {status === "conflict"
                ? t("web.editor.conflictTitle")
                : t("web.resourceEditor.error")}
            </strong>
            {error}
          </span>
          {status === "conflict" && (
            <button
              type="button"
              className="btn btn-sm btn-light"
              onClick={() => window.location.reload()}
            >
              {t("web.editor.reloadLatest")}
            </button>
          )}
        </div>
      )}
      <span className="visually-hidden" aria-live="polite">
        {t(`web.editor.saveStates.${status}`)}
      </span>
    </div>
  );
}
