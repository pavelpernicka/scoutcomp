import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import PreviewDialog from "./PreviewDialog";

describe("PreviewDialog", () => {
  it("uses a full preview stage and closes with Escape", () => {
    const onClose = vi.fn();
    const { container } = render(<PreviewDialog html="<main>Preview</main>" device="Desktop" onClose={onClose} />);

    expect(container.querySelector(".web-editor-preview-stage")).toBeTruthy();
    expect(container.querySelector(".web-editor-preview-frame-wrapper")).toHaveAttribute("data-device", "Desktop");
    expect(container.querySelector(".web-editor-preview-frame-wrapper")).toHaveStyle({ maxWidth: "1200px" });
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
