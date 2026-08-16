import { beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
}));

vi.mock("../../../services/api", () => ({ default: http }));

import { cmsApi } from "./cms";

describe("CMS design resource API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    http.post.mockResolvedValue({ data: { ok: true } });
    http.put.mockResolvedValue({ data: { draft_version: 4 } });
  });

  it("saves canonical project data, CSS, and an optimistic version", async () => {
    const payload = {
      qualified_key: "site:hero",
      name: "Hero",
      project_data: { scoutcomp: { schemaVersion: 2 }, pages: [] },
      css: ".hero{display:grid}",
      expected_version: 3,
    };

    await cmsApi.updateDesignResource("sections", 17, payload);

    expect(http.put).toHaveBeenCalledWith("/web/design/sections/17", payload);
  });

  it("publishes templates and updates sections", async () => {
    await cmsApi.publishTemplate(4, 7);

    expect(http.post).toHaveBeenCalledWith("/web/templates/4/publish", { expected_version: 7 });
  });
});
