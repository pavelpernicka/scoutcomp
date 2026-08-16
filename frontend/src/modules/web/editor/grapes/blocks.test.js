import { describe, expect, it } from "vitest";

import { createPrimitiveBlocks } from "./blocks";

describe("builder primitive blocks", () => {
  it("does not offer legacy template-part or global-part insertions", () => {
    const blockIds = createPrimitiveBlocks((key) => key).map((block) => block.id);

    expect(blockIds).toContain("sc-section");
    expect(blockIds).not.toContain("sc-template-part");
    expect(blockIds).not.toContain("sc-global-part");
  });
});
