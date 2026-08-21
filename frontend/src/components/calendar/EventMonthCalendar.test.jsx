import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import EventMonthCalendar from "./EventMonthCalendar";

const event = (id, title, hour) => ({
  id,
  title,
  starts_at: `2026-08-21T${String(hour).padStart(2, "0")}:00:00Z`,
  ends_at: `2026-08-21T${String(hour + 1).padStart(2, "0")}:00:00Z`,
});

const commonProps = {
  viewDate: new Date(2026, 7, 1),
  getEventColor: () => "#198754",
  getEventLabel: (item) => `${String(new Date(item.starts_at).getUTCHours()).padStart(2, "0")}:00`,
};

describe("EventMonthCalendar", () => {
  it("opens excess compact-calendar events in a modal and makes them clickable", async () => {
    const user = userEvent.setup();
    const onEventClick = vi.fn();
    render(<EventMonthCalendar
      {...commonProps}
      compact
      onEventClick={onEventClick}
      events={[
        event(1, "First event", 8),
        event(2, "Second event", 9),
        event(3, "Third event", 10),
        event(4, "Fourth event", 11),
      ]}
    />);

    const visibleBars = document.querySelectorAll(".calendar-event-bar");
    expect(visibleBars).toHaveLength(2);
    expect(visibleBars[0].textContent.indexOf("First event")).toBeLessThan(
      visibleBars[0].textContent.indexOf("08:00")
    );
    const overflow = document.querySelector(".calendar-event-overflow-trigger");
    expect(overflow).toHaveTextContent("+2");
    await act(async () => user.click(overflow));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("First event");
    expect(dialog).toHaveTextContent("Second event");
    expect(dialog).toHaveTextContent("Third event");
    expect(dialog).toHaveTextContent("Fourth event");
    await act(async () => user.click(screen.getByRole("button", { name: /Third event/i })));

    expect(onEventClick).toHaveBeenCalledWith(expect.objectContaining({ id: 3 }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("uses day clicks for the event list or creation according to permission", async () => {
    const user = userEvent.setup();
    const multiDayEvent = {
      id: 3,
      title: "Multi-day event",
      starts_at: "2026-08-20T08:00:00Z",
      ends_at: "2026-08-22T18:00:00Z",
    };
    const { unmount } = render(<EventMonthCalendar
      {...commonProps}
      events={[event(1, "First event", 8), event(2, "Second event", 9), multiDayEvent]}
    />);

    const day = screen.getByText("21").closest(".calendar-day");
    await act(async () => user.click(day));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("First event");
    expect(dialog).toHaveTextContent("Second event");
    expect(dialog).toHaveTextContent("8/20/2026");
    expect(dialog).toHaveTextContent("8/22/2026");
    unmount();

    const onCreateDay = vi.fn();
    render(<EventMonthCalendar
      {...commonProps}
      canCreate
      onCreateDay={onCreateDay}
      events={[]}
    />);

    const authorizedDay = screen.getByText("21").closest(".calendar-day");
    await user.click(authorizedDay);

    expect(onCreateDay).toHaveBeenCalledWith(expect.any(Date));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
