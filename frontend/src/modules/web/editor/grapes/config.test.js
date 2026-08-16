import { describe, expect, it } from "vitest";

import { createEditorConfig } from "./config";

describe("GrapesJS editor configuration", () => {
  it("does not replace the selector escape function with a boolean", () => {
    const config = createEditorConfig({ container: document.createElement("div") });

    expect(config.selectorManager.componentFirst).toBe(true);
    expect(config.selectorManager.escapeName).toBeUndefined();
  });
});
