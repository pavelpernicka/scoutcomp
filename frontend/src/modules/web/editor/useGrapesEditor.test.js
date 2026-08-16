import { describe, expect, it, vi } from "vitest";

import { subscribeToEditorChanges } from "./useGrapesEditor";

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
});
