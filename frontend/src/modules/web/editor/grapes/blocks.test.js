import { describe, expect, it } from "vitest";

import { createDataSourceBlocks, createPrimitiveBlocks } from "./blocks";

const STRUCTURAL_IDS = [
  "sc-columns",
  "sc-flex",
  "sc-grid",
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

    expect(blockIds).toContain("sc-columns");
    expect(blockIds).not.toContain("sc-template-part");
    expect(blockIds).not.toContain("sc-global-part");
    expect(blockIds).toContain("sc-menu");
    expect(blockIds).toContain("sc-calendar");
    expect(blocks.every((block) => block.media?.includes("fa-"))).toBe(true);
  });

  it("inserts the calendar with stable public renderer props", () => {
    const calendar = createPrimitiveBlocks((key) => key).find((block) => block.id === "sc-calendar");

    expect(calendar.content).toEqual({
      type: "sc-calendar",
      kind: "all",
      teamId: "",
      firstDayOfWeek: "monday",
      showDescription: true,
    });
    expect(calendar.media).toContain("fa-calendar-days");
  });

  it("inserts structural blocks with editable sample content", () => {
    const blocks = createPrimitiveBlocks((key) => key);

    for (const id of STRUCTURAL_IDS) {
      const block = blocks.find((item) => item.id === id);
      expect(block, id).toBeDefined();
      expect(block.content.components?.length, id).toBeGreaterThan(0);
    }
  });

  it("registers only platform blocks globally", () => {
    const ids = createPrimitiveBlocks((key) => key).map((block) => block.id);

    expect(ids).toEqual(expect.arrayContaining(["sc-text", "sc-image", "sc-columns", "sc-menu", "sc-calendar"]));
    expect(ids.some((id) => id.startsWith("bs-") || id.startsWith("layout-") || id.startsWith("block-"))).toBe(false);
    expect(ids).not.toEqual(expect.arrayContaining(["sc-fa-icon", "sc-photo-mask", "sc-button", "sc-container"]));
  });

  it("does not leak visual blocks from a bundled theme", () => {
    const ids = createPrimitiveBlocks((key) => key).map((block) => block.id);

    expect(ids).not.toEqual(expect.arrayContaining(["block-portrait-quote", "block-colored-cta", "layout-collage-2-1"]));
  });

  it("does not register Bootstrap starters without a theme declaration", () => {
    const ids = createPrimitiveBlocks((key) => key).map((block) => block.id);
    expect(ids.some((id) => id.startsWith("bs-"))).toBe(false);
  });

  it("does not register bundled-theme overlay starters globally", () => {
    const blocks = createPrimitiveBlocks((key) => key);

    for (const id of ["sc-photo-mask", "block-hero", "block-contact-hero", "block-organic-photo", "layout-photo-cta"]) {
      const block = blocks.find((item) => item.id === id);
      expect(block, id).toBeUndefined();
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
    expect(pagination).toMatchObject({ bindTo: "nearest", pageSize: 6, mode: "simple" });
    expect(pagination.source).toBeUndefined();
    expect(meeting.content.params).toEqual({ limit: 6, kind: "meeting" });
  });
});
