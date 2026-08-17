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

  it("offers reusable Ontario, Font Awesome and safe Bootstrap starters", () => {
    const ids = createPrimitiveBlocks((key) => key).map((block) => block.id);

    expect(ids).toEqual(expect.arrayContaining([
      "sc-fa-icon",
      "sc-organic-edge",
      "sc-photo-mask",
      "bs-alert",
      "bs-badge",
      "bs-breadcrumb",
      "bs-card",
      "bs-button-group",
      "bs-list-group",
      "bs-accordion",
      "bs-pagination",
      "bs-table-responsive",
      "bs-ratio",
      "bs-progress",
      "bs-callout",
    ]));
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

  it("offers purpose-built card starters for public teams and posts", () => {
    const blocks = createDataSourceBlocks([
      { id: "core.teams", label: "Družiny", collection: true, fields: { name: {}, logo_url: {}, url: {} } },
      { id: "core.posts", label: "Příspěvky", collection: true, fields: { title: {}, cover_url: {}, url: {} } },
      { id: "core.events", label: "Schůzky", collection: true, fields: { title: {}, start_at: {} } },
    ], (key) => key);

    const team = blocks.find((block) => block.id === "sc-data-core-teams");
    const post = blocks.find((block) => block.id === "sc-data-core-posts");
    const meeting = blocks.find((block) => block.id === "sc-data-core-events");
    expect(team.content.params).toEqual({ limit: 6 });
    expect(team.content.components[0].components[0].scBindings).toEqual({
      src: { scope: "context", field: "logo_url" },
      alt: { scope: "context", field: "name" },
    });
    const postRepeat = post.content.components[0];
    const pagination = post.content.components[1];
    expect(postRepeat.components[0].components[0].scBindings.src.field).toBe("cover_url");
    expect(postRepeat.params.page).toEqual({ $scBinding: { scope: "page", field: "query.page" } });
    expect(pagination.type).toBe("sc-pagination");
    expect(meeting.content.params).toEqual({ limit: 6, kind: "meeting" });
  });
});
