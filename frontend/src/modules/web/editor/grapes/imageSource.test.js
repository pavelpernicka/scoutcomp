import { describe, expect, it, vi } from "vitest";

import { setImageComponentSource } from "./imageSource";

describe("GrapesJS image source updates", () => {
  it("updates the model and mounted image immediately while retaining the durable media id", () => {
    const element = document.createElement("img");
    const values = { attributes: { src: "/media/1/file", "data-sc-media-id": "1" } };
    const component = {
      set: vi.fn((name, value) => { values[name] = value; }),
      addAttributes: vi.fn((attributes) => { values.attributes = { ...values.attributes, ...attributes }; }),
      removeAttributes: vi.fn((name) => { delete values.attributes[name]; }),
      getEl: () => element,
    };

    setImageComponentSource(component, {
      src: "blob:https://editor/new-preview",
      mediaId: 42,
      alt: "Tábor",
    });

    expect(component.set).toHaveBeenCalledWith("src", "blob:https://editor/new-preview");
    expect(values.attributes).toMatchObject({
      src: "blob:https://editor/new-preview",
      alt: "Tábor",
      "data-sc-media-id": "42",
    });
    expect(element.getAttribute("src")).toBe("blob:https://editor/new-preview");
  });
});
