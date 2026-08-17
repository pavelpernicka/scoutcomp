import DOMPurify from "dompurify";
import { marked } from "marked";

marked.setOptions({ breaks: true });

export const EMPTY_IMAGE = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
  if (node.tagName === "IMG" && node.getAttribute("src")?.startsWith("/api/web/media/")) {
    node.setAttribute("data-media-src", node.getAttribute("src"));
    node.setAttribute("src", EMPTY_IMAGE);
  }
  if (node.tagName === "IFRAME") {
    try {
      const url = new URL(node.getAttribute("src"), window.location.origin);
      const allowed = (
        (url.hostname === "www.youtube.com" || url.hostname === "www.youtube-nocookie.com") && url.pathname.startsWith("/embed/")
      ) || (url.hostname === "player.vimeo.com" && url.pathname.startsWith("/video/"));
      if (!allowed || url.protocol !== "https:") node.remove();
    } catch {
      node.remove();
    }
  }
});

export const renderMarkdown = (markdown) => ({
  __html: DOMPurify.sanitize(marked.parse(markdown || ""), {
    ADD_TAGS: ["iframe", "video", "source", "figure", "figcaption", "details", "summary", "aside"],
    ADD_ATTR: ["allow", "allowfullscreen", "controls", "data-media-id", "frameborder", "loading", "loop", "muted", "playsinline", "poster", "preload", "referrerpolicy"],
  }),
});
