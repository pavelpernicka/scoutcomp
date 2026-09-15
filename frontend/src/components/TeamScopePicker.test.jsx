import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import TeamScopePicker from "./TeamScopePicker";

const teams = [
  { id: 1, name: "Foxes" },
  { id: 2, name: "Wolves" },
];

describe("TeamScopePicker", () => {
  it("starts with the whole unit", () => {
    render(<TeamScopePicker value={[]} onChange={vi.fn()} teams={teams} />);
    expect(screen.getByRole("button")).toHaveTextContent(/Whole unit/i);
  });

  it("selects a team and shows its name in the button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <TeamScopePicker value={[]} onChange={onChange} teams={teams} />
    );

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("checkbox", { name: "Foxes" }));
    expect(onChange).toHaveBeenLastCalledWith([1]);

    rerender(
      <TeamScopePicker value={[1]} onChange={onChange} teams={teams} />
    );
    expect(screen.getByRole("button")).toHaveTextContent("Foxes");
  });

  it("can select multiple teams", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    const { rerender } = render(
      <TeamScopePicker value={[1]} onChange={onChange} teams={teams} />
    );

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("checkbox", { name: "Wolves" }));
    expect(onChange).toHaveBeenLastCalledWith([1, 2]);

    rerender(
      <TeamScopePicker value={[1, 2]} onChange={onChange} teams={teams} />
    );
    expect(screen.getByRole("button")).toHaveTextContent("Foxes, Wolves");
  });

  it("switches back to whole unit via radio button", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <TeamScopePicker value={[1, 2]} onChange={onChange} teams={teams} />
    );

    await user.click(screen.getByRole("button"));
    await user.click(screen.getByRole("radio"));
    expect(onChange).toHaveBeenLastCalledWith([]);
  });

  it("closes the dropdown when clicking outside", async () => {
    const user = userEvent.setup();

    render(
      <TeamScopePicker value={[]} onChange={vi.fn()} teams={teams} />
    );

    await user.click(screen.getByRole("button"));
    expect(screen.getByRole("checkbox", { name: "Foxes" })).toBeVisible();

    await user.click(document.body);
    expect(screen.queryByRole("checkbox", { name: "Foxes" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button")).toHaveTextContent("Foxes");
  });
});
