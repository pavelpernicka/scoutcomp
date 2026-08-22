import api from "../../services/api";

export const inventoryApi = {
  getOverview: async () => {
    const { data } = await api.get("/inventory/overview");
    return data;
  },
  getLabelTemplates: async () => {
    const { data } = await api.get("/inventory/label-templates");
    return data;
  },
  getLocations: async () => {
    const { data } = await api.get("/inventory/locations");
    return data;
  },
  getCategories: async () => {
    const { data } = await api.get("/inventory/categories");
    return data;
  },
  getFlags: async () => {
    const { data } = await api.get("/inventory/flags");
    return data;
  },
  getSets: async () => {
    const { data } = await api.get("/inventory/sets");
    return data;
  },
  createSet: async (payload) => {
    const { data } = await api.post("/inventory/sets", payload);
    return data;
  },
  updateSet: async (id, payload) => {
    const { data } = await api.patch(`/inventory/sets/${id}`, payload);
    return data;
  },
  deleteSet: async (id) => {
    await api.delete(`/inventory/sets/${id}`);
  },
  updateSetItems: async (id, payload) => {
    const { data } = await api.post(`/inventory/sets/${id}/items`, payload);
    return data;
  },
  addItemsToSet: async (id, payload) => {
    const { data } = await api.post(`/inventory/sets/${id}/items/add`, payload);
    return data;
  },
  createItem: async (payload) => {
    const { data } = await api.post("/inventory/items", payload);
    return data;
  },
  updateItem: async (id, payload) => {
    const { data } = await api.patch(`/inventory/items/${id}`, payload);
    return data;
  },
  getItem: async (id) => {
    const { data } = await api.get(`/inventory/items/${id}`);
    return data;
  },
  bulkUpdateItems: async (payload) => {
    const { data } = await api.post("/inventory/items/bulk", payload);
    return data;
  },
  bulkCreateLoans: async (payload) => {
    const { data } = await api.post("/inventory/items/bulk/loans", payload);
    return data;
  },
  addPhoto: async (id, payload) => {
    const { data } = await api.post(`/inventory/items/${id}/photos`, payload);
    return data;
  },
  deletePhoto: async (id) => {
    const { data } = await api.delete(`/inventory/photos/${id}`);
    return data;
  },
  createLoan: async (itemId, payload) => {
    const { data } = await api.post(`/inventory/items/${itemId}/loans`, payload);
    return data;
  },
  returnLoan: async (loanId, payload = {}) => {
    const { data } = await api.post(`/inventory/loans/${loanId}/return`, payload);
    return data;
  },
  findByQr: async (qrIdentifier) => {
    const { data } = await api.get(`/inventory/qr/${encodeURIComponent(qrIdentifier)}`);
    return data;
  },
  createTemplate: async (payload) => {
    const { data } = await api.post("/inventory/label-templates", payload);
    return data;
  },
  updateTemplate: async (id, payload) => {
    const { data } = await api.patch(`/inventory/label-templates/${id}`, payload);
    return data;
  },
  deleteTemplate: async (id) => {
    await api.delete(`/inventory/label-templates/${id}`);
  },
  createLocation: async (payload) => {
    const { data } = await api.post("/inventory/locations", payload);
    return data;
  },
  updateLocation: async (id, payload) => {
    const { data } = await api.patch(`/inventory/locations/${id}`, payload);
    return data;
  },
  deleteLocation: async (id) => {
    await api.delete(`/inventory/locations/${id}`);
  },
  createCategory: async (payload) => {
    const { data } = await api.post("/inventory/categories", payload);
    return data;
  },
  updateCategory: async (id, payload) => {
    const { data } = await api.patch(`/inventory/categories/${id}`, payload);
    return data;
  },
  deleteCategory: async (id) => {
    await api.delete(`/inventory/categories/${id}`);
  },
  createFlag: async (payload) => {
    const { data } = await api.post("/inventory/flags", payload);
    return data;
  },
  updateFlag: async (id, payload) => {
    const { data } = await api.patch(`/inventory/flags/${id}`, payload);
    return data;
  },
  deleteFlag: async (id) => {
    await api.delete(`/inventory/flags/${id}`);
  },
};
