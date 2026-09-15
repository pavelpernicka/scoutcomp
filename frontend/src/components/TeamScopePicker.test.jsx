import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import TeamScopePicker from "./TeamScopePicker";

const teams = [
  { id: 1, name: "Foxes" },
  { id: 2, name: "Wolves" },
];

describe("TeamScopePicker", () => {
  it("adds teams to the current selection and can switch back to the whole unit", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(
      <TeamScopePicker value={[]} onChange={onChange} teams={teams} />
    );

    await user.click(screen.getByRole("checkbox", { name: "Foxes" }));
    expect(onChange).toHaveBeenLastCalledWith([1]);

    rerender(<TeamScopePicker value={[1]} onChange={onChange} teams={teams} />);
    await user.click(screen.getByRole("checkbox", { name: "Wolves" }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2]);

    await user.click(screen.getByRole("radio"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("does not offer the whole unit when the caller lacks global scope", () => {
    render(
      <TeamScopePicker
        value={[1]}
        onChange={vi.fn()}
        teams={teams}
        allowWholeUnit={false}
      />
    );

    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });
});
