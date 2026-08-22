export const normalizeCollection = (payload) => {
  if (Array.isArray(payload)) return payload;
  return Array.isArray(payload?.items) ? payload.items : [];
};

export const buildPostDraftPayload = (post, form) => ({
  title: form.title.trim(),
  excerpt: null,
  body: form.body || null,
  cover_media_id: form.cover_media_id ? Number(form.cover_media_id) : null,
  event_id: form.event_id ? Number(form.event_id) : null,
  // Saving from the post modal is the publish action; draft/unpublish remains
  // available explicitly from the list actions.
  published: true,
  seo_title: post.seo_title ?? null,
  meta_description: post.meta_description ?? null,
  canonical_url: post.canonical_url ?? null,
  og_image_id: post.og_image_id ?? null,
  noindex: post.noindex ?? false,
  sitemap_include: post.sitemap_include ?? true,
  ...(post.id ? { expected_version: post.draft_version } : {}),
});

export const flattenMenuTree = (nodes, depth = 0) =>
  (nodes || []).flatMap((node) => [
    {
      id: node.id,
      label: node.label || "",
      item_type: node.item_type || (node.page_id || node.page_slug ? "page" : "external"),
      page_id: node.page_id ?? null,
      post_id: node.post_id ?? null,
      page_slug: node.page_slug ?? null,
      url: node.url ?? null,
      target: node.target ?? null,
      rel: node.rel ?? null,
      parent_id: node.parent_id ?? null,
      position: node.position ?? 0,
      depth,
    },
    ...flattenMenuTree(node.children, depth + 1),
  ]);

export const nextTemporaryMenuId = (items) =>
  Math.min(0, ...(items || []).map((item) => Number(item.id) || 0)) - 1;

export const descendantMenuIds = (items, parentId) => {
  const descendants = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of items) {
      if (
        item.parent_id != null
        && (item.parent_id === parentId || descendants.has(item.parent_id))
        && !descendants.has(item.id)
      ) {
        descendants.add(item.id);
        changed = true;
      }
    }
  }
  return descendants;
};

export const serializeMenuItems = (items) => {
  const usable = (items || []).filter((item) => item.label.trim());
  const ids = new Set(usable.map((item) => item.id));
  const children = new Map();
  usable.forEach((item, order) => {
    const parentId = ids.has(item.parent_id) ? item.parent_id : null;
    const siblings = children.get(parentId) || [];
    siblings.push({ item, order });
    children.set(parentId, siblings);
  });

  const result = [];
  const visited = new Set();
  const visit = (parentId) => {
    for (const { item } of children.get(parentId) || []) {
      if (visited.has(item.id)) continue;
      visited.add(item.id);
      result.push({
        id: item.id,
        label: item.label.trim(),
        item_type: item.item_type,
        page_id: item.item_type === "page" ? item.page_id : null,
        post_id: item.item_type === "post" ? item.post_id : null,
        page_slug: item.item_type === "page" ? item.page_slug : null,
        url: item.item_type === "external" ? item.url || null : null,
        target: item.target || null,
        rel: item.rel || null,
        parent_id: parentId,
        position: result.length,
      });
      visit(item.id);
    }
  };
  visit(null);
  return result;
};

export const buildMenuDraftPayload = (menu, items) => ({
  name: menu.name.trim(),
  location: menu.location.trim().toLowerCase(),
  items: serializeMenuItems(items),
  expected_version: menu.draft_version,
});
