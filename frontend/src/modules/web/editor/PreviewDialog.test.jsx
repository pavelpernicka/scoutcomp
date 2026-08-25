import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PreviewDialog, { calculatePreviewFit } from "./PreviewDialog";

describe("PreviewDialog", () => {
  it("uses a full preview stage and closes with Escape", () => {
    const onClose = vi.fn();
    const { container } = render(<PreviewDialog html="<main>Preview</main>" device="Desktop" onClose={onClose} />);

    expect(container.querySelector(".web-editor-preview-stage")).toBeTruthy();
    expect(container.querySelector(".web-editor-preview-frame-wrapper")).toHaveAttribute("data-device", "Desktop");
    expect(container.querySelector(".web-editor-preview-frame-wrapper")).toHaveStyle({ width: "1200px" });
    expect(calculatePreviewFit(600, 700, 1200)).toEqual({
      scale: 0.5,
      displayWidth: 600,
      displayHeight: 700,
      logicalHeight: 1400,
    });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
