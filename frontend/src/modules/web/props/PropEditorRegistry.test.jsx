import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ResourcePropsEditor } from "./PropEditorRegistry";

describe("ResourcePropsEditor", () => {
  it("preserves typed select and multiselect values", () => {
    const onChange = vi.fn();
    const schema = [
      { id: "limit", type: "select", label: "Limit", options: [{ value: 3, label: "Three" }, { value: 6, label: "Six" }] },
      { id: "flags", type: "multiselect", label: "Flags", options: [{ value: true, label: "Yes" }, { value: false, label: "No" }] },
    ];
    const { rerender } = render(<ResourcePropsEditor schema={schema} value={{ limit: 3, flags: [true] }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "6" } });
    expect(onChange).toHaveBeenLastCalledWith({ limit: 6, flags: [true] });

    rerender(<ResourcePropsEditor schema={schema} value={{ limit: 6, flags: [true] }} onChange={onChange} />);
    const flags = screen.getByLabelText("Flags");
    Array.from(flags.options).forEach((option) => { option.selected = option.value === "false"; });
    fireEvent.change(flags);
    expect(onChange).toHaveBeenLastCalledWith({ limit: 6, flags: [false] });
  });

  it("uses bounded alignment choices instead of free text", () => {
    const onChange = vi.fn();
    render(<ResourcePropsEditor schema={[{ id: "align", type: "alignment", label: "Alignment" }]} value={{ align: "start" }} onChange={onChange} />);

    fireEvent.change(screen.getByLabelText("Alignment"), { target: { value: "center" } });
    expect(onChange).toHaveBeenCalledWith({ align: "center" });
    expect(screen.getByLabelText("Alignment").tagName).toBe("SELECT");
  });
});
