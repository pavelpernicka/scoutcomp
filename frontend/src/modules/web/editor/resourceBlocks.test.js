import { describe, expect, it, vi } from "vitest";
import { cloneResourceComponents, filterCatalogResources, getResourceComponent, insertLinkedResource, insertResource, linkedResourceInstance } from "./resourceBlocks";

describe("builder resource insertion", () => {
  it("reads the canonical Grapes frame component before legacy page.component", () => {
    const resource = { project_data: { pages: [{ component: { tagName: "legacy" }, frames: [{ component: { tagName: "main" } }] }] } };
    expect(getResourceComponent(resource)).toEqual({ tagName: "main" });
  });

  it("clones reusable resource components without mutating their definition", () => {
    const pattern = { project_data: { pages: [{ frames: [{ component: { type: "wrapper", components: [{ type: "text", content: "Hello" }] } }] }] } };
    const clone = cloneResourceComponents(pattern);
    clone[0].content = "Changed";
    expect(getResourceComponent(pattern).components[0].content).toBe("Hello");
  });

  it("merges reusable resource styles into the destination project", () => {
    const addComponents = vi.fn(() => ["component"]);
    const setRule = vi.fn();
    const resource = {
      project_data: { pages: [{ frames: [{
        component: { type: "wrapper", components: [{ type: "text", content: "Card" }] },
        styles: [{
          selectors: [{ name: "card" }], style: { color: "red" },
          atRuleType: "media", mediaText: "(max-width: 768px)",
        }],
      }] }] },
    };
    expect(insertResource({ addComponents, Css: { setRule, addRules: vi.fn() } }, resource)).toEqual(["component"]);
    expect(setRule).toHaveBeenCalledWith(".card", { color: "red" }, {
      atRuleType: "media", atRuleParams: "(max-width: 768px)", addStyles: true,
    });
  });

  it("creates a linked instance that stores only identity and prop values", () => {
    const resource = {
      id: 9,
      qualified_key: "site:contact-card",
      name: "Contact card",
      default_props: { title: "Contact" },
      project_data: { pages: [{ component: { content: "must not be copied" } }] },
    };
    expect(linkedResourceInstance(resource, "components")).toEqual({
      type: "sc-resource-instance",
      resourceKind: "component",
      resourceId: "site:contact-card",
      resourceName: "Contact card",
      previewUrl: "",
      props: { title: "Contact" },
    });
  });

  it("inserts sections through the canonical linked WebSection contract", () => {
    const addComponents = vi.fn(() => ["section"]);
    const section = {
      id: 12,
      qualified_key: "site:hero",
      name: "Hero",
      default_props: { heading: "Welcome" },
    };

    expect(insertLinkedResource({ addComponents }, section, "sections")).toEqual(["section"]);
    expect(addComponents).toHaveBeenCalledWith({
      type: "sc-resource-instance",
      resourceKind: "section",
      resourceId: "site:hero",
      resourceName: "Hero",
      previewUrl: "",
      props: { heading: "Welcome" },
    });
  });

  it("keeps site-owned resources and only the active theme version", () => {
    const resources = [
      { id: 1, name: "Site card", theme_version_id: null },
      { id: 2, name: "Active card", theme_version_id: 8 },
      { id: 3, name: "Old card", theme_version_id: 5 },
    ];

    expect(filterCatalogResources(resources, 8).map((item) => item.id)).toEqual([1, 2]);
    expect(filterCatalogResources({ items: resources }, null).map((item) => item.id)).toEqual([1]);
  });
});
