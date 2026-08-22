import { describe, expect, it } from "vitest";

import {
  buildPostDraftPayload,
  buildMenuDraftPayload,
  descendantMenuIds,
  flattenMenuTree,
  normalizeCollection,
  serializeMenuItems,
} from "./contentContracts";

describe("CMS content API contracts", () => {
  it("normalizes both legacy arrays and paginated collections", () => {
    expect(normalizeCollection([{ id: 1 }])).toEqual([{ id: 1 }]);
    expect(normalizeCollection({ items: [{ id: 2 }], total: 1 })).toEqual([{ id: 2 }]);
    expect(normalizeCollection(null)).toEqual([]);
  });

  it("preserves the complete post draft and optimistic version when editing", () => {
    expect(buildPostDraftPayload(
      { id: 7, draft_version: 4, seo_title: "SEO", noindex: true },
      { title: "  News  ", slug: "news", excerpt: "Intro", body: "Full body", cover_media_id: "12", event_id: "31" },
    )).toEqual({
      title: "News",
      excerpt: null,
      body: "Full body",
      cover_media_id: 12,
      event_id: 31,
      published: true,
      seo_title: "SEO",
      meta_description: null,
      canonical_url: null,
      og_image_id: null,
      noindex: true,
      sitemap_include: true,
      expected_version: 4,
    });
  });

  it("round-trips arbitrary-depth typed menu trees in parent-first order", () => {
    const tree = [{
      id: 10,
      label: "Home",
      item_type: "page",
      page_id: 1,
      children: [{
        id: 11,
        parent_id: 10,
        label: "News",
        item_type: "post",
        post_id: 2,
        target: "_blank",
        rel: "noopener noreferrer",
        children: [{
          id: 12,
          parent_id: 11,
          label: "External",
          item_type: "external",
          url: "https://example.test",
          children: [],
        }],
      }],
    }];

    const flat = flattenMenuTree(tree);
    expect(flat.map(({ id, depth }) => [id, depth])).toEqual([[10, 0], [11, 1], [12, 2]]);
    expect(serializeMenuItems(flat)).toMatchObject([
      { id: 10, item_type: "page", page_id: 1, parent_id: null },
      { id: 11, item_type: "post", post_id: 2, parent_id: 10, target: "_blank" },
      { id: 12, item_type: "external", url: "https://example.test", parent_id: 11 },
    ]);
  });

  it("identifies every descendant so the UI cannot create a cycle", () => {
    const items = [
      { id: 1, parent_id: null },
      { id: 2, parent_id: 1 },
      { id: 3, parent_id: 2 },
    ];
    expect([...descendantMenuIds(items, 1)]).toEqual([2, 3]);
  });

  it("includes the menu version in every draft replacement", () => {
    expect(buildMenuDraftPayload(
      { name: "  Main menu ", location: " Main ", draft_version: 9 },
      [{ id: -1, label: "Link", item_type: "external", url: "/contact", parent_id: null }],
    )).toMatchObject({
      name: "Main menu",
      location: "main",
      expected_version: 9,
      items: [{ id: -1, item_type: "external", url: "/contact" }],
    });
  });
});
