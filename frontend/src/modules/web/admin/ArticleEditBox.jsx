import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import "./ArticleEditBox.css";

import { renderMarkdown } from "../../../utils/markdown";

const asHtml = (value) => {
  const source = value || "";
  return source.trim().startsWith("<") ? source : renderMarkdown(source).__html;
};

function ToolButton({ title, active, onClick, children, disabled }) {
  return <button type="button" className={`btn btn-sm ${active ? "btn-primary" : "btn-outline-secondary"}`} title={title} aria-label={title} onClick={onClick} disabled={disabled}>{children}</button>;
}

ToolButton.propTypes = {
  title: PropTypes.string.isRequired,
  active: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
  disabled: PropTypes.bool,
};

/** Reusable, deliberately focused rich-text field for CMS articles. */
export default function ArticleEditBox({ value, onChange, disabled = false }) {
  const [, setRevision] = useState(0);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3, 4] } })],
    content: asHtml(value),
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => onChange(instance.getHTML()),
    onSelectionUpdate: () => setRevision((revision) => revision + 1),
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!disabled);
  }, [editor, disabled]);

  useEffect(() => {
    if (!editor) return;
    const next = asHtml(value);
    if (editor.getHTML() !== next) editor.commands.setContent(next, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="article-editbox border rounded p-3 text-muted">Načítám editor…</div>;
  const command = (callback) => () => callback(editor.chain().focus()).run();

  return <div className="article-editbox border rounded overflow-hidden">
    <div className="article-editbox-toolbar d-flex flex-wrap gap-1 p-2 border-bottom bg-light" role="toolbar" aria-label="Nástroje editoru článku">
      <ToolButton title="Nadpis" active={editor.isActive("heading", { level: 2 })} disabled={disabled} onClick={command((chain) => chain.toggleHeading({ level: 2 }))}>H2</ToolButton>
      <ToolButton title="Tučné" active={editor.isActive("bold")} disabled={disabled} onClick={command((chain) => chain.toggleBold())}><strong>B</strong></ToolButton>
      <ToolButton title="Kurzíva" active={editor.isActive("italic")} disabled={disabled} onClick={command((chain) => chain.toggleItalic())}><em>I</em></ToolButton>
      <ToolButton title="Přeškrtnutí" active={editor.isActive("strike")} disabled={disabled} onClick={command((chain) => chain.toggleStrike())}><s>S</s></ToolButton>
      <ToolButton title="Odrážky" active={editor.isActive("bulletList")} disabled={disabled} onClick={command((chain) => chain.toggleBulletList())}><i className="fas fa-list-ul" /></ToolButton>
      <ToolButton title="Číslovaný seznam" active={editor.isActive("orderedList")} disabled={disabled} onClick={command((chain) => chain.toggleOrderedList())}><i className="fas fa-list-ol" /></ToolButton>
      <ToolButton title="Citace" active={editor.isActive("blockquote")} disabled={disabled} onClick={command((chain) => chain.toggleBlockquote())}><i className="fas fa-quote-right" /></ToolButton>
      <ToolButton title="Vrátit" disabled={disabled || !editor.can().undo()} onClick={command((chain) => chain.undo())}><i className="fas fa-rotate-left" /></ToolButton>
      <ToolButton title="Znovu" disabled={disabled || !editor.can().redo()} onClick={command((chain) => chain.redo())}><i className="fas fa-rotate-right" /></ToolButton>
    </div>
    <EditorContent editor={editor} className="article-editbox-content" />
  </div>;
}

ArticleEditBox.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  disabled: PropTypes.bool,
};
