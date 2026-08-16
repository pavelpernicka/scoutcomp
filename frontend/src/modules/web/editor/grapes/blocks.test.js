import { describe, expect, it } from "vitest";

import { createDataSourceBlocks, createPrimitiveBlocks } from "./blocks";

const STRUCTURAL_IDS = [
  "sc-container",
  "sc-box",
  "sc-section",
  "sc-semantic-article",
  "sc-semantic-header",
  "sc-semantic-footer",
  "sc-semantic-main",
  "sc-semantic-nav",
  "sc-semantic-aside",
];

describe("builder primitive blocks", () => {
  it("does not offer legacy template-part or global-part insertions", () => {
    const blocks = createPrimitiveBlocks((key) => key);
    const blockIds = blocks.map((block) => block.id);

    expect(blockIds).toContain("sc-section");
    expect(blockIds).not.toContain("sc-template-part");
    expect(blockIds).not.toContain("sc-global-part");
    expect(blockIds).toContain("sc-menu");
    expect(blocks.every((block) => block.media?.includes("fa-"))).toBe(true);
  });

  it("keeps structural blocks free of publishable placeholder content and styles", () => {
    const blocks = createPrimitiveBlocks((key) => key);

    for (const id of STRUCTURAL_IDS) {
      const block = blocks.find((item) => item.id === id);
      expect(block, id).toBeDefined();
      // The drop surface must not be modeled as a placeholder child: it would
      // be serialized into the public Project Data and published.
      expect(block.content.components, id).toBeUndefined();
      // Editor-only affordances live in `baseCss` (editorCanvasCss), not in
      // component styles that GrapesJS persists into the project CSS.
      expect(block.content.style, id).toBeUndefined();
      expect(block.content.attributes, id).toBeUndefined();
    }
  });

  it("adds a native tooltip to data-source blocks", () => {
    const [block] = createDataSourceBlocks([{
      id: "core.events",
      label: "Události",
      description: "Veřejné události oddílu",
      fields: [],
    }], (key) => key);

    expect(block.attributes.title).toBe("Veřejné události oddílu");
  });
});
