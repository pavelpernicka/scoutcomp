import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";

import MediaPickerModal from "../modules/web/media/MediaPickerModal";
import api from "../services/api";
import { renderMarkdown } from "../utils/markdown";

const asHtml = (value) => {
  const source = value || "";
  return source.trim().startsWith("<") ? source : renderMarkdown(source).__html;
};

const toolbarButtons = [
  "undo", "redo", "|", "bold", "italic", "underline", "strikethrough", "|",
  "font", "fontsize", "paragraph", "textColor", "|", "ul", "ol", "outdent", "indent", "align", "|",
  "insertLink", "insertImage", "gifSearch", "embed", "symbols", "detailsBlock", "infoBox", "table", "hr", "|", "source", "fullsize", "preview", "print", "search",
];

const mediaBlobs = new Map();
const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

function editorHtml(value) {
  const container = document.createElement("div");
  container.innerHTML = asHtml(value);
  container.querySelectorAll("img[src^='/api/web/media/']").forEach((node) => {
    node.dataset.mediaSrc = node.getAttribute("src");
    node.setAttribute("src", EMPTY_IMAGE);
  });
  return container.innerHTML;
}

function editorValue(value) {
  const container = document.createElement("div");
  container.innerHTML = value || "";
  container.querySelectorAll("[data-media-src]").forEach((node) => node.setAttribute("src", node.dataset.mediaSrc));
  return container.innerHTML;
}

async function hydrateEditorMedia(editor) {
  const nodes = [...editor.editor.querySelectorAll("img[src^='/api/web/media/'], img[data-media-src]")];
  await Promise.all(nodes.map(async (node) => {
    const source = node.dataset.mediaSrc || node.getAttribute("src");
    if (!source) return;
    node.dataset.mediaSrc = source;
    try {
      let blobUrl = mediaBlobs.get(source);
      if (!blobUrl) {
        const { data } = await api.get(source.replace(/^\/api\//, "/"), { responseType: "blob" });
        blobUrl = URL.createObjectURL(data);
        mediaBlobs.set(source, blobUrl);
      }
      node.setAttribute("src", blobUrl);
    } catch {
      // Keep the canonical URL; it remains valid in public output after publish.
    }
  }));
}

function mediaHtml(item) {
  const element = document.createElement(item.is_image ? "img" : "a");
  element.setAttribute("data-media-id", String(item.id));
  if (item.is_image) {
    element.setAttribute("src", EMPTY_IMAGE);
    element.setAttribute("data-media-src", item.url);
    element.setAttribute("alt", item.alt || item.filename || "");
    return `<figure>${element.outerHTML}</figure>`;
  }
  element.setAttribute("href", item.url);
  element.textContent = item.filename || "Soubor";
  return `<p>${element.outerHTML}</p>`;
}

/** A shared Jodit editor with the application's central media picker. */
export default function RichTextEditor({ value, onChange, disabled = false, height = 360, placeholder, className = "" }) {
  const hostRef = useRef(null);
  const editorRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const [mediaPickerMode, setMediaPickerMode] = useState(null);
  const [dialog, setDialog] = useState(null);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  valueRef.current = value;

  useEffect(() => {
    if (!hostRef.current) return undefined;
    let disposed = false;
    let editor;
    const initialize = async () => {
      await import("jodit/esm/plugins/all.js");
      const [{ Jodit }] = await Promise.all([
        import("jodit"),
        import("jodit/es2021/jodit.min.css"),
      ]);
      if (disposed || !hostRef.current) return;
      editor = Jodit.make(hostRef.current, {
        readonly: disabled,
        height,
        placeholder: placeholder || "",
        toolbarAdaptive: false,
        toolbarButtonSize: "middle",
        buttons: toolbarButtons,
        buttonsMD: toolbarButtons,
        showCharsCounter: true,
        showWordsCounter: true,
        showXPathInStatusbar: true,
        controls: {
          insertImage: { icon: "image", tooltip: "Vložit obrázek", exec: (instance) => { instance.s.save(); setDialog({ type: "image" }); return false; } },
          gifSearch: { icon: "smile", tooltip: "Hledat GIF", exec: (instance) => { instance.s.save(); setDialog({ type: "gif" }); return false; } },
          insertLink: { icon: "link", tooltip: "Vložit odkaz", exec: (instance) => { instance.s.save(); setDialog({ type: "link" }); return false; } },
          textColor: { icon: "brush", tooltip: "Barva textu", exec: (instance) => { instance.s.save(); setDialog({ type: "color" }); return false; } },
          embed: { icon: "video", tooltip: "Vložit video nebo iframe", exec: (instance) => { instance.s.save(); setDialog({ type: "embed" }); return false; } },
          detailsBlock: { icon: "plus", tooltip: "Rozbalovací sekce", exec: (instance) => { instance.s.save(); setDialog({ type: "details" }); return false; } },
          infoBox: { icon: "info", tooltip: "Informační box", exec: (instance) => { instance.s.save(); setDialog({ type: "info" }); return false; } },
        },
        uploader: { insertImageAsBase64URI: false },
      });
      editor.value = editorHtml(valueRef.current);
      hydrateEditorMedia(editor);
      editor.events.on("change", (nextValue) => onChangeRef.current(editorValue(nextValue)));
      editorRef.current = editor;
    };
    initialize();
    return () => {
      disposed = true;
      editorRef.current = null;
      editor?.destruct();
    };
    // The editor owns its state after creation; value is synchronized below.
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setReadOnly(disabled);
  }, [disabled]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = asHtml(value);
    if (editorValue(editor.value) !== next) {
      editor.value = editorHtml(next);
      hydrateEditorMedia(editor);
    }
  }, [value]);

  const selectMedia = (item) => {
    const editor = editorRef.current;
    if (mediaPickerMode === "image" && !item.is_image) return;
    setMediaPickerMode(null);
    if (!editor || disabled) return;
    editor.s.restore();
    editor.s.insertHTML(mediaHtml(item));
    hydrateEditorMedia(editor);
    editor.synchronizeValues();
    onChangeRef.current(editorValue(editor.value));
  };

  const insertDialogContent = (html) => {
    const editor = editorRef.current;
    setDialog(null);
    if (!editor || disabled || html === false) return;
    if (html !== null) {
      editor.s.restore();
      if (html) editor.s.insertHTML(html);
    }
    editor.synchronizeValues();
    onChangeRef.current(editorValue(editor.value));
  };

  return <div className={`rich-text-editor ${className}`.trim()}>
    <div ref={hostRef} />
    {mediaPickerMode && <MediaPickerModal title={mediaPickerMode === "image" ? "Vybrat obrázek z galerie" : "Vybrat médium"} onSelect={selectMedia} onClose={() => setMediaPickerMode(null)} />}
    {dialog?.type === "gif" && <GifPickerDialog onClose={() => setDialog(null)} onInsert={insertDialogContent} />}
    {dialog && dialog.type !== "gif" && <EditorDialog dialog={dialog} editor={editorRef.current} onClose={() => setDialog(null)} onInsert={insertDialogContent} onOpenGallery={() => { setDialog(null); setMediaPickerMode("image"); }} />}
  </div>;
}

function GifPickerDialog({ onClose, onInsert }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [state, setState] = useState("idle");

  useEffect(() => {
    if (!query.trim()) { setItems([]); setState("idle"); return undefined; }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setState("loading");
      try {
        const params = new URLSearchParams({
          action: "query", format: "json", origin: "*", generator: "search",
          gsrnamespace: "6", gsrlimit: "24", gsrsearch: `${query.trim().slice(0, 50)} filemime:image/gif`,
          prop: "imageinfo", iiprop: "url|mime", iiurlwidth: "240",
        });
        const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, { signal: controller.signal });
        if (!response.ok) throw new Error();
        const payload = await response.json();
        setItems(Object.values(payload.query?.pages || {}).filter((page) => page.imageinfo?.[0]?.mime === "image/gif"));
        setState("ready");
      } catch (error) {
        if (error.name !== "AbortError") setState("error");
      }
    }, 280);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [query]);

  const choose = (gif) => {
    const info = gif.imageinfo?.[0];
    if (!info?.url) return;
    const image = document.createElement("img");
    image.src = info.url;
    image.alt = (gif.title || "GIF").replace(/^File:/, "");
    image.loading = "lazy";
    const source = document.createElement("a");
    source.href = `https://commons.wikimedia.org/wiki/${encodeURIComponent(gif.title.replace(/ /g, "_"))}`;
    source.target = "_blank";
    source.rel = "noopener noreferrer";
    source.textContent = "Zdroj: Wikimedia Commons";
    onInsert(`<figure>${image.outerHTML}<figcaption>${source.outerHTML}</figcaption></figure>`);
  };

  return createPortal(<div className="rich-text-dialog-backdrop" role="dialog" aria-modal="true" aria-label="Hledat GIF" onClick={(event) => event.stopPropagation()}>
    <div className="rich-text-dialog rich-text-gif-dialog" onClick={(event) => event.stopPropagation()}>
      <div className="rich-text-dialog-heading"><h2>Hledat GIF</h2><button type="button" className="btn-close" onClick={onClose} /></div>
      <>
        <input className="form-control" autoFocus value={query} placeholder="Např. radost, tábor, potlesk…" onChange={(event) => setQuery(event.target.value)} />
        {state === "loading" && <p className="rich-text-dialog-help">Vyhledávám GIFy…</p>}
        {state === "error" && <p className="text-danger small mb-0">GIFy se nepodařilo načíst.</p>}
        {state === "ready" && <div className="rich-text-gif-grid">{items.map((gif) => <button type="button" key={gif.pageid} className="rich-text-gif-tile" title={gif.title || "GIF"} onClick={() => choose(gif)}><img src={gif.imageinfo?.[0]?.thumburl || gif.imageinfo?.[0]?.url} alt="" loading="lazy" /></button>)}</div>}
      </>
      <small className="rich-text-gif-credit">Wikimedia Commons</small>
    </div>
  </div>, document.body);
}

GifPickerDialog.propTypes = { onClose: PropTypes.func.isRequired, onInsert: PropTypes.func.isRequired };

function EditorDialog({ dialog, editor, onClose, onInsert, onOpenGallery }) {
  const [value, setValue] = useState(dialog.type === "color" ? "#1f4f37" : "");
  const [linkText, setLinkText] = useState("");
  const title = { color: "Barva textu", link: "Vložit odkaz", image: "Vložit obrázek", embed: "Video nebo iframe", details: "Rozbalovací sekce", info: "Informační box" }[dialog.type];
  const submit = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (dialog.type === "color") {
      editor?.s.restore();
      editor?.execCommand("foreColor", false, value);
      onInsert(null);
      return;
    }
    if (dialog.type === "link") {
      try {
        const url = new URL(value, window.location.origin);
        if (!["http:", "https:", "mailto:", "tel:"].includes(url.protocol)) throw new Error();
        const link = document.createElement("a");
        link.href = value;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = linkText.trim() || value;
        onInsert(link.outerHTML);
      } catch { return; }
      return;
    }
    if (dialog.type === "image") {
      try {
        const url = new URL(value);
        if (!["http:", "https:"].includes(url.protocol)) throw new Error();
        const image = document.createElement("img");
        image.src = url.href;
        image.alt = "";
        image.loading = "lazy";
        onInsert(`<figure>${image.outerHTML}</figure>`);
      } catch { return; }
      return;
    }
    if (dialog.type === "embed") {
      const source = value.match(/src=["']([^"']+)["']/i)?.[1] || value;
      try {
        const url = new URL(source);
        const youtube = ["www.youtube.com", "www.youtube-nocookie.com"].includes(url.hostname) && url.pathname.startsWith("/embed/");
        const vimeo = url.hostname === "player.vimeo.com" && url.pathname.startsWith("/video/");
        if (!youtube && !vimeo) throw new Error();
        onInsert(`<iframe src="${url.href}" title="Vložené video" width="560" height="315" loading="lazy" allowfullscreen></iframe>`);
      } catch { return; }
      return;
    }
    if (dialog.type === "details") onInsert(`<details><summary>${value || "Více informací"}</summary><p>Sem napište rozbalený obsah.</p></details>`);
    if (dialog.type === "info") onInsert(`<aside class="rich-text-infobox" role="note"><strong>${value || "Důležitá informace"}</strong><p>Sem napište obsah informačního boxu.</p></aside>`);
  };
  return createPortal(<div className="rich-text-dialog-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
    <form className="rich-text-dialog" onSubmit={submit} onClick={(event) => event.stopPropagation()}>
      <div className="rich-text-dialog-heading"><h2>{title}</h2><button type="button" className="btn-close" onClick={onClose} /></div>
      {dialog.type === "color" ? <input className="form-control form-control-color" type="color" value={value} onChange={(event) => setValue(event.target.value)} /> : <>
        <label>{dialog.type === "link" ? "Adresa odkazu" : dialog.type === "image" ? "URL obrázku" : dialog.type === "embed" ? "URL YouTube/Vimeo nebo iframe kód" : dialog.type === "details" ? "Nadpis sekce" : "Nadpis boxu"}<input className="form-control mt-1" autoFocus type={dialog.type === "link" || dialog.type === "image" ? "url" : "text"} value={value} onChange={(event) => setValue(event.target.value)} /></label>
        {dialog.type === "link" && <label>Text odkazu <input className="form-control mt-1" value={linkText} onChange={(event) => setLinkText(event.target.value)} /></label>}
        {dialog.type === "image" && <button type="button" className="btn btn-outline-secondary" onClick={onOpenGallery}><i className="fas fa-images me-1" />Vybrat z galerie</button>}
      </>}
      {dialog.type === "embed" && <p className="rich-text-dialog-help">Povoleny jsou bezpečné HTTPS vložené přehrávače YouTube a Vimeo.</p>}
      <div className="rich-text-dialog-actions"><button type="button" className="btn btn-light" onClick={onClose}>Zrušit</button><button className="btn btn-primary" type="submit">Vložit</button></div>
    </form>
  </div>, document.body);
}

EditorDialog.propTypes = { dialog: PropTypes.object.isRequired, editor: PropTypes.object, onClose: PropTypes.func.isRequired, onInsert: PropTypes.func.isRequired, onOpenGallery: PropTypes.func.isRequired };

RichTextEditor.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
  height: PropTypes.number,
  placeholder: PropTypes.string,
  className: PropTypes.string,
};
