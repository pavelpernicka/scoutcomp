import { useEffect, useRef } from "react";
import PropTypes from "prop-types";

import api from "../services/api";
import { renderMarkdown } from "../utils/markdown";

const blobCache = new Map();

/** Renders sanitized rich text and loads protected CMS images with the auth client. */
export default function RichTextContent({ value, className, as: Tag = "div" }) {
  const ref = useRef(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return undefined;
    let cancelled = false;
    const images = [...root.querySelectorAll("img[data-media-src]")];
    images.forEach(async (image) => {
      const source = image.dataset.mediaSrc;
      if (!source) return;
      try {
        let blobUrl = blobCache.get(source);
        if (!blobUrl) {
          const { data } = await api.get(source.replace(/^\/api\//, "/"), { responseType: "blob" });
          blobUrl = URL.createObjectURL(data);
          blobCache.set(source, blobUrl);
        }
        if (!cancelled) image.src = blobUrl;
      } catch {
        // The safe placeholder remains when the viewer has no media access.
      }
    });
    return () => { cancelled = true; };
  }, [value]);

  return <Tag ref={ref} className={className} dangerouslySetInnerHTML={renderMarkdown(value)} />;
}

RichTextContent.propTypes = {
  value: PropTypes.string,
  className: PropTypes.string,
  as: PropTypes.elementType,
};
