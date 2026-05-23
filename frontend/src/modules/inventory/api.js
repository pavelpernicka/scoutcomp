import api from "../../services/api";

export const inventoryApi = {
  getOverview: async (teamId) => {
    const { data } = await api.get("/inventory/overview", { params: teamId ? { team_id: teamId } : {} });
    return data;
  },
  getTeams: async () => {
    const { data } = await api.get("/teams");
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
  bulkUpdateItems: async (payload) => {
    const { data } = await api.post("/inventory/items/bulk", payload);
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
  createEvent: async (payload) => {
    const { data } = await api.post("/inventory/events", payload);
    return data;
  },
  updateEvent: async (id, payload) => {
    const { data } = await api.patch(`/inventory/events/${id}`, payload);
    return data;
  },
  getEventDetail: async (id) => {
    const { data } = await api.get(`/inventory/events/${id}`);
    return data;
  },
  assignItemToEvent: async (eventId, payload) => {
    const { data } = await api.post(`/inventory/events/${eventId}/items`, payload);
    return data;
  },
  removeItemFromEvent: async (eventId, eventItemId) => {
    const { data } = await api.delete(`/inventory/events/${eventId}/items/${eventItemId}`);
    return data;
  },
  scanEventReturn: async (eventId, payload) => {
    const { data } = await api.post(`/inventory/events/${eventId}/scan-return`, payload);
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
  previewLabels: async (payload) => {
    const { data } = await api.post("/inventory/labels/preview", payload);
    return data;
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
