import { useState } from "react";
import PropTypes from "prop-types";

import { renderMarkdown } from "../utils/markdown";

const tools = [
  ["B", "**", "Tučný text"],
  ["I", "*", "Kurzíva"],
  ["H", "## ", "Nadpis"],
  ["•", "- ", "Seznam"],
  ["↗", "[odkaz](https://)", "Odkaz"],
];

/** Lightweight, reusable Markdown authoring control; never emits HTML into storage. */
export default function MarkdownEditor({ value, onChange, rows = 10, placeholder, disabled }) {
  const [preview, setPreview] = useState(false);
  const insert = (prefix) => onChange(`${value || ""}${value ? "\n" : ""}${prefix}`);
  return <div className="markdown-editor">
    <div className="btn-group btn-group-sm mb-2" role="toolbar" aria-label="Markdown tools">
      {tools.map(([label, prefix, title]) => <button key={prefix} type="button" className="btn btn-outline-secondary" title={title} disabled={disabled} onClick={() => insert(prefix)}>{label}</button>)}
      <button type="button" className={`btn ${preview ? "btn-primary" : "btn-outline-secondary"}`} onClick={() => setPreview((open) => !open)}>{preview ? "Editor" : "Náhled"}</button>
    </div>
    {preview
      ? <div className="markdown-preview border rounded p-3 bg-light" dangerouslySetInnerHTML={renderMarkdown(value || "")} />
      : <textarea className="form-control web-template-code" rows={rows} value={value || ""} placeholder={placeholder} disabled={disabled} onChange={(event) => onChange(event.target.value)} />}
  </div>;
}

MarkdownEditor.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  rows: PropTypes.number,
  placeholder: PropTypes.string,
  disabled: PropTypes.bool,
};
