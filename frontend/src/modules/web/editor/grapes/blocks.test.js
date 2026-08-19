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

  it("offers reusable Ontario, Font Awesome and safe Bootstrap starters", () => {
    const ids = createPrimitiveBlocks((key) => key).map((block) => block.id);

    expect(ids).toEqual(expect.arrayContaining([
      "sc-fa-icon",
      "sc-photo-mask",
      "layout-media-split",
      "block-section-heading",
      "block-hero",
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
      "bs-nav-pills",
      "bs-card-grid",
      "bs-dropdown",
      "bs-description-list",
      "bs-accordion-group",
    ]));
  });

  it("offers the extended graphic blocks and editorial layouts", () => {
    const ids = createPrimitiveBlocks((key) => key).map((block) => block.id);

    expect(ids).toEqual(expect.arrayContaining([
      "block-organic-photo",
      "block-portrait-quote",
      "block-colored-cta",
      "block-contact-row",
      "layout-photo-cta",
      "layout-collage-2-1",
      "layout-media-alternating",
      "layout-contact-split",
    ]));
  });

  it("keeps the new Bootstrap starters declarative and usable without theme JavaScript", () => {
    const blocks = createPrimitiveBlocks((key) => key);
    const dropdown = blocks.find((block) => block.id === "bs-dropdown");
    const cardGrid = blocks.find((block) => block.id === "bs-card-grid");
    const accordionGroup = blocks.find((block) => block.id === "bs-accordion-group");

    expect(dropdown.content.tagName).toBe("details");
    expect(cardGrid.content.components).toHaveLength(3);
    expect(accordionGroup.content.components).toHaveLength(3);
    expect(accordionGroup.content.components.every((component) => component.tagName === "details")).toBe(true);
  });

  it("marks image-overlay starters with the shared overlay contract", () => {
    const blocks = createPrimitiveBlocks((key) => key);

    for (const id of ["sc-photo-mask", "block-hero", "block-contact-hero", "block-organic-photo", "layout-photo-cta"]) {
      const block = blocks.find((item) => item.id === id);
      expect(block?.content?.attributes?.["data-sc-overlay"], id).toBe("true");
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
