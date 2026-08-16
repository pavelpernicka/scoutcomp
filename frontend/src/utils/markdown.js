import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ breaks: true });

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export const renderMarkdown = (markdown) => ({
  __html: DOMPurify.sanitize(marked.parse(markdown || "")),
});
