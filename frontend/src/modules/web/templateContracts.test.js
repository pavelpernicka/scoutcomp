import { describe, expect, it } from "vitest";

import {
  TEMPLATE_USAGE_MODES,
  templatePersistenceFields,
  templatesForUsage,
} from "./templateContracts";

describe("consolidated WebTemplate contract", () => {
  const templates = [
    { id: 1, usage_mode: "linked_layout" },
    { id: 2, usage_mode: "copy_on_create" },
    { id: 3 },
  ];

  it("separates linked layouts from copy-on-create page templates", () => {
    expect(templatesForUsage(templates, TEMPLATE_USAGE_MODES.linkedLayout).map((item) => item.id)).toEqual([1, 3]);
    expect(templatesForUsage({ items: templates }, TEMPLATE_USAGE_MODES.copyOnCreate).map((item) => item.id)).toEqual([2]);
  });

  it("preserves a template usage mode when building an update", () => {
    expect(templatePersistenceFields({ template_kind: "layout", usage_mode: "copy_on_create" })).toEqual({
      template_kind: "layout",
      usage_mode: "copy_on_create",
    });
  });
});
