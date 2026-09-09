import { useEffect, useRef } from "react";
import PropTypes from "prop-types";

import api from "../services/api";
import { renderMarkdown } from "../utils/markdown";

const blobCache = new Map();

/** Renders sanitized rich text and loads protected CMS images with the auth client. */
export default function RichTextContent({ value, className, as: Tag = "div", onImageActivate, imageActivationLabel = "" }) {
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

  useEffect(() => {
    const root = ref.current;
    if (!root || !onImageActivate) return undefined;
    const images = [...root.querySelectorAll("img")];
    images.forEach((image) => {
      image.classList.add("rich-text-zoomable-image");
      image.tabIndex = 0;
      image.setAttribute("role", "button");
      const description = image.alt?.trim();
      image.setAttribute("aria-label", description && imageActivationLabel ? `${imageActivationLabel}: ${description}` : description || imageActivationLabel);
    });
    return () => {
      images.forEach((image) => {
        image.classList.remove("rich-text-zoomable-image");
        image.removeAttribute("tabindex");
        image.removeAttribute("role");
        image.removeAttribute("aria-label");
      });
    };
  }, [imageActivationLabel, onImageActivate, value]);

  const activateImage = (event) => {
    if (!onImageActivate) return;
    const image = event.target.closest?.("img");
    if (!image || !ref.current?.contains(image)) return;
    if (event.type === "keydown" && !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    const src = image.currentSrc || image.src;
    if (src) onImageActivate?.({ src, alt: image.alt || image.title || "", opener: image });
  };

  return <Tag ref={ref} className={className} onClick={activateImage} onKeyDown={activateImage} dangerouslySetInnerHTML={renderMarkdown(value)} />;
}

RichTextContent.propTypes = {
  value: PropTypes.string,
  className: PropTypes.string,
  as: PropTypes.elementType,
  onImageActivate: PropTypes.func,
  imageActivationLabel: PropTypes.string,
};
