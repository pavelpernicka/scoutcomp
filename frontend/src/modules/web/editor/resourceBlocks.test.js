import { describe, expect, it, vi } from "vitest";
import { cloneResourceComponents, getResourceComponent, insertResource, linkedResourceInstance, linkedTemplatePart, linkedGlobalPart } from "./resourceBlocks";

describe("builder resource insertion", () => {
  it("reads the canonical Grapes frame component before legacy page.component", () => {
    const resource = { project_data: { pages: [{ component: { tagName: "legacy" }, frames: [{ component: { tagName: "main" } }] }] } };
    expect(getResourceComponent(resource)).toEqual({ tagName: "main" });
  });

  it("clones patterns but keeps template parts linked", () => {
    const pattern = { project_data: { pages: [{ frames: [{ component: { type: "wrapper", components: [{ type: "text", content: "Hello" }] } }] }] } };
    const clone = cloneResourceComponents(pattern);
    clone[0].content = "Changed";
    expect(getResourceComponent(pattern).components[0].content).toBe("Hello");
    expect(linkedTemplatePart({ qualified_key: "theme:header", id: 4 })).toEqual({ type: "sc-template-part", resourceId: "theme:header" });
    expect(linkedGlobalPart({ qualified_key: "site.footer", id: 7 })).toEqual({ type: "sc-global-part", resourceId: "site.footer" });
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
});
