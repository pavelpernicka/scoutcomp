import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PropTypes from "prop-types";
import { useTranslation } from "react-i18next";

import "./ImageLightbox.css";

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const INITIAL_TRANSFORM = { scale: MIN_SCALE, x: 0, y: 0 };
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

/** Full-screen, keyboard-accessible preview shared by protected and public images. */
export default function ImageLightbox({ image, onClose }) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const viewportRef = useRef(null);
  const imageRef = useRef(null);
  const pointersRef = useRef(new Map());
  const gestureRef = useRef(null);
  const transformRef = useRef(INITIAL_TRANSFORM);
  const [transform, setTransform] = useState(INITIAL_TRANSFORM);
  const [isGesturing, setIsGesturing] = useState(false);

  const applyTransform = (candidate) => {
    const scale = clamp(candidate.scale, MIN_SCALE, MAX_SCALE);
    const renderedImage = imageRef.current;
    const viewport = viewportRef.current;
    const maxX = renderedImage && viewport
      ? Math.max(0, (renderedImage.clientWidth * scale - viewport.clientWidth) / 2)
      : 0;
    const maxY = renderedImage && viewport
      ? Math.max(0, (renderedImage.clientHeight * scale - viewport.clientHeight) / 2)
      : 0;
    const next = {
      scale,
      x: scale === MIN_SCALE ? 0 : clamp(candidate.x, -maxX, maxX),
      y: scale === MIN_SCALE ? 0 : clamp(candidate.y, -maxY, maxY),
    };
    transformRef.current = next;
    setTransform(next);
  };

  const zoomAt = (nextScale, point) => {
    const current = transformRef.current;
    const renderedImage = imageRef.current;
    if (!renderedImage || !point) {
      applyTransform({ ...current, scale: nextScale });
      return;
    }
    const rect = renderedImage.getBoundingClientRect();
    const baseCenter = {
      x: rect.left + rect.width / 2 - current.x,
      y: rect.top + rect.height / 2 - current.y,
    };
    const local = {
      x: (point.x - baseCenter.x - current.x) / current.scale,
      y: (point.y - baseCenter.y - current.y) / current.scale,
    };
    const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE);
    applyTransform({
      scale,
      x: point.x - baseCenter.x - local.x * scale,
      y: point.y - baseCenter.y - local.y * scale,
    });
  };

  const beginPinch = () => {
    const points = [...pointersRef.current.values()].slice(0, 2);
    if (points.length < 2) return;
    const [first, second] = points;
    const current = transformRef.current;
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect) return;
    gestureRef.current = {
      type: "pinch",
      distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      midpoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 },
      baseCenter: {
        x: rect.left + rect.width / 2 - current.x,
        y: rect.top + rect.height / 2 - current.y,
      },
      transform: { ...current },
    };
  };

  const handlePointerDown = (event) => {
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may fail when the browser has already cancelled the touch.
    }
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setIsGesturing(true);
    if (pointersRef.current.size >= 2) beginPinch();
    else gestureRef.current = {
      type: "pan",
      point: { x: event.clientX, y: event.clientY },
      transform: { ...transformRef.current },
    };
  };

  const handlePointerMove = (event) => {
    if (!pointersRef.current.has(event.pointerId)) return;
    event.preventDefault();
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointersRef.current.size >= 2) {
      if (gestureRef.current?.type !== "pinch") beginPinch();
      const gesture = gestureRef.current;
      const [first, second] = [...pointersRef.current.values()].slice(0, 2);
      if (!gesture || !first || !second) return;
      const midpoint = { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
      const scale = clamp(
        gesture.transform.scale * Math.hypot(second.x - first.x, second.y - first.y) / gesture.distance,
        MIN_SCALE,
        MAX_SCALE,
      );
      const local = {
        x: (gesture.midpoint.x - gesture.baseCenter.x - gesture.transform.x) / gesture.transform.scale,
        y: (gesture.midpoint.y - gesture.baseCenter.y - gesture.transform.y) / gesture.transform.scale,
      };
      applyTransform({
        scale,
        x: midpoint.x - gesture.baseCenter.x - local.x * scale,
        y: midpoint.y - gesture.baseCenter.y - local.y * scale,
      });
      return;
    }
    const gesture = gestureRef.current;
    if (gesture?.type !== "pan" || transformRef.current.scale <= MIN_SCALE) return;
    applyTransform({
      ...transformRef.current,
      x: gesture.transform.x + event.clientX - gesture.point.x,
      y: gesture.transform.y + event.clientY - gesture.point.y,
    });
  };

  const handlePointerEnd = (event) => {
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size === 1) {
      const point = [...pointersRef.current.values()][0];
      gestureRef.current = { type: "pan", point, transform: { ...transformRef.current } };
    } else if (pointersRef.current.size === 0) {
      gestureRef.current = null;
      setIsGesturing(false);
    }
  };

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !image) return undefined;
    const originalOverflow = document.documentElement.style.overflow;
    pointersRef.current.clear();
    gestureRef.current = null;
    transformRef.current = INITIAL_TRANSFORM;
    setTransform(INITIAL_TRANSFORM);
    setIsGesturing(false);
    document.documentElement.style.overflow = "hidden";
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open && typeof dialog.close === "function") dialog.close();
      document.documentElement.style.overflow = originalOverflow;
      image.opener?.focus?.({ preventScroll: true });
    };
  }, [image]);

  if (!image) return null;
  return createPortal(
    <dialog
      ref={dialogRef}
      className="image-lightbox"
      aria-label={t("posts.imagePreview")}
      onCancel={(event) => { event.preventDefault(); onClose(); }}
      onClick={(event) => {
        if (event.target === event.currentTarget || event.target.classList.contains("image-lightbox__figure")) onClose();
      }}
    >
      <button type="button" className="image-lightbox__close" onClick={onClose}>
        <i className="fas fa-xmark" aria-hidden="true" />
        <span>{t("common.close")}</span>
      </button>
      <figure className="image-lightbox__figure">
        <div
          ref={viewportRef}
          className={`image-lightbox__viewport${isGesturing ? " is-gesturing" : ""}`}
          data-zoomed={transform.scale > MIN_SCALE ? "true" : "false"}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onLostPointerCapture={handlePointerEnd}
          onDoubleClick={(event) => zoomAt(
            transformRef.current.scale > MIN_SCALE ? MIN_SCALE : 2.5,
            { x: event.clientX, y: event.clientY },
          )}
          onWheel={(event) => {
            event.preventDefault();
            zoomAt(transformRef.current.scale + (event.deltaY < 0 ? .35 : -.35), { x: event.clientX, y: event.clientY });
          }}
        >
          <img
            ref={imageRef}
            src={image.src}
            alt={image.alt || ""}
            className="image-lightbox__image"
            draggable="false"
            style={{ transform: `translate3d(${transform.x}px,${transform.y}px,0) scale(${transform.scale})` }}
          />
        </div>
      </figure>
      <div className="image-lightbox__zoom-controls" role="group" aria-label={t("posts.zoomControls")}>
        <button type="button" disabled={transform.scale <= MIN_SCALE} onClick={() => zoomAt(transformRef.current.scale - .5)} aria-label={t("posts.zoomOut")} title={t("posts.zoomOut")}><i className="fas fa-minus" aria-hidden="true" /></button>
        <output aria-live="polite">{Math.round(transform.scale * 100)}%</output>
        <button type="button" disabled={transform.scale >= MAX_SCALE} onClick={() => zoomAt(transformRef.current.scale + .5)} aria-label={t("posts.zoomIn")} title={t("posts.zoomIn")}><i className="fas fa-plus" aria-hidden="true" /></button>
        <button type="button" disabled={transform.scale === MIN_SCALE} onClick={() => applyTransform(INITIAL_TRANSFORM)} aria-label={t("posts.resetZoom")} title={t("posts.resetZoom")}><i className="fas fa-rotate-left" aria-hidden="true" /></button>
      </div>
    </dialog>,
    document.body,
  );
}

ImageLightbox.propTypes = {
  image: PropTypes.shape({
    src: PropTypes.string.isRequired,
    alt: PropTypes.string,
    opener: PropTypes.shape({ focus: PropTypes.func }),
  }),
  onClose: PropTypes.func.isRequired,
};
