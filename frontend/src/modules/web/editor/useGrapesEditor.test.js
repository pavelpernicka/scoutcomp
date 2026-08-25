import { describe, expect, it, vi } from "vitest";

import { applyInlineCanvasStyles, calculateFitZoom, clampCanvasToolbar, subscribeToEditorChanges } from "./useGrapesEditor";

const emitter = () => {
  const listeners = new Map();
  return {
    on: vi.fn((event, handler) => listeners.set(event, handler)),
    off: vi.fn((event, handler) => {
      if (listeners.get(event) === handler) listeners.delete(event);
    }),
    trigger: (event) => listeners.get(event)?.(),
  };
};

describe("GrapesJS change tracking", () => {
  it("observes the dirty counter even when GrapesJS does not emit update", () => {
    const model = emitter();
    const editor = { ...emitter(), getModel: () => model };
    const onChange = vi.fn();

    const unsubscribe = subscribeToEditorChanges(editor, onChange);
    model.trigger("change:changesCount");

    expect(onChange).toHaveBeenCalledTimes(1);
    unsubscribe();
    model.trigger("change:changesCount");
    editor.trigger("update");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clamps the component toolbar inside its visible canvas boundary", () => {
    const boundary = { getBoundingClientRect: () => ({ left: 10, top: 10, right: 210, bottom: 160, width: 200, height: 150 }) };
    const toolbar = {
      offsetParent: { getBoundingClientRect: () => ({ left: 0, top: 0, right: 20, bottom: 20, width: 20, height: 20 }) },
      offsetLeft: 190,
      offsetTop: -10,
      style: { left: "190px", top: "-10px", display: "" },
      getBoundingClientRect: () => ({ left: 190, top: 0, right: 250, bottom: 28, width: 60, height: 28 }),
    };
    const editor = { Canvas: { getToolbarEl: () => toolbar, getElement: () => boundary } };

    expect(clampCanvasToolbar(editor)).toBe(true);
    expect(toolbar.style.left).toBe("142px");
    expect(toolbar.style.top).toBe("8px");
    expect(toolbar.style.maxWidth).toBe("184px");
  });

  it("fits a real mobile viewport into the available canvas without changing its logical width", () => {
    expect(calculateFitZoom(782, 375)).toBe(200);
    expect(calculateFitZoom(1400, 375)).toBe(240);
    expect(calculateFitZoom(280, 375)).toBe(66);
    expect(calculateFitZoom(0, 375)).toBe(100);
    expect(calculateFitZoom(600, 1200, { minimum: 25, maximum: 100 })).toBe(47);
  });

  it("places late theme CSS before page-owned GrapesJS CSS", () => {
    const frameDocument = document.implementation.createHTMLDocument("canvas");
    const pageStyles = frameDocument.createElement("style");
    pageStyles.id = "gjs-css-rules";
    pageStyles.textContent = "p { line-height: 1; }";
    frameDocument.head.appendChild(pageStyles);
    const editor = { Canvas: { getDocument: () => frameDocument } };

    applyInlineCanvasStyles(editor, "p { line-height: 1.8; }");
    applyInlineCanvasStyles(editor, "p { line-height: 1.8; }");

    expect(frameDocument.head.firstElementChild.id).toBe("sc-canvas-styles");
    const sharedStyles = frameDocument.head.querySelectorAll("#sc-canvas-styles");
    expect(sharedStyles).toHaveLength(1);
    expect(sharedStyles[0].textContent).toContain("line-height: 1.8");
    expect(sharedStyles[0].compareDocumentPosition(pageStyles) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
