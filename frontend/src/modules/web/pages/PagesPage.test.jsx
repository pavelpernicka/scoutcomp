import { fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { cmsApi } from "../api/cms";
import PagesPage from "./PagesPage";

describe("PagesPage copy-on-create templates", () => {
  afterEach(() => vi.restoreAllMocks());

  it("offers published site and active-theme templates and sends source_template_id", async () => {
    vi.spyOn(cmsApi, "listPages").mockResolvedValue([]);
    vi.spyOn(cmsApi, "listTemplates").mockResolvedValue([
      { id: 11, name: "Site draft", usage_mode: "copy_on_create", published_version: 0 },
      { id: 12, name: "Site published", usage_mode: "copy_on_create", published_version: 1 },
      { id: 13, name: "Active published", usage_mode: "copy_on_create", published_version: 2, theme_version_id: 8 },
      { id: 14, name: "Old theme", usage_mode: "copy_on_create", published_version: 1, theme_version_id: 5 },
      { id: 15, name: "Linked layout", usage_mode: "linked_layout", published_version: 1, theme_version_id: 8 },
    ]);
    vi.spyOn(cmsApi, "getCanvasStyles").mockResolvedValue({ active_theme_version_id: 8, css: "" });
    const createPage = vi.spyOn(cmsApi, "createPage").mockResolvedValue({ id: 99 });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter>
          <PagesPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.click(container.querySelector(".web-admin-page-header button"));
    fireEvent.change(container.querySelector("#new-page-title"), { target: { value: "Demo page" } });

    await waitFor(() => expect(container.querySelector("#new-page-template")).not.toBeDisabled());
    const templateSelect = container.querySelector("#new-page-template");
    expect(Array.from(templateSelect.options).map((option) => option.value)).toEqual(["", "12", "13"]);
    fireEvent.change(templateSelect, { target: { value: "13" } });
    fireEvent.submit(container.querySelector(".web-inline-create"));

    await waitFor(() => expect(createPage).toHaveBeenCalledWith({
      title: "Demo page",
      slug: "demo-page",
      parent_id: null,
      position: 0,
      source_template_id: 13,
      data: null,
    }));
  });
});
