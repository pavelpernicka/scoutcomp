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

  it("regenerates template previews through the template contract", async () => {
    await cmsApi.regenerateTemplatePreview(4);

    expect(http.post).toHaveBeenCalledWith("/web/templates/4/preview");
  });

  it("clones a template through the consolidated templates endpoint", async () => {
    await cmsApi.cloneTemplate(4, { name: "Homepage copy" });

    expect(http.post).toHaveBeenCalledWith("/web/templates/4/clone", { name: "Homepage copy" });
  });

  it("downloads a whole-site export as a blob", async () => {
    http.get.mockResolvedValue({ data: new Blob(["zip"]) });

    await cmsApi.downloadSiteExport();

    expect(http.get).toHaveBeenCalledWith("/web/export", { responseType: "blob" });
  });

  it("exposes only the consolidated template and section contracts", () => {
    expect(cmsApi.listPageTemplates).toBeUndefined();
    expect(cmsApi.listGlobalParts).toBeUndefined();
    expect(cmsApi.listTemplates).toBeTypeOf("function");
    expect(cmsApi.listDesignResources).toBeTypeOf("function");
  });
});
