import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inventoryApi } from "./api";
import {
  buildOpenLoanEntries,
  buildCategoryOptions,
  buildLocationOptions,
  buildPathMetaMap,
  collectLocationPaths,
  filterItems,
  flattenLocationTree,
  INVENTORY_SCREENS,
  sortItems,
} from "./helpers";
import InventoryBulkDialog from "./components/InventoryBulkDialog";
import InventoryCategoryDialog from "./components/InventoryCategoryDialog";
import InventoryEventDialog from "./components/InventoryEventDialog";
import InventoryEventReturnDialog from "./components/InventoryEventReturnDialog";
import InventoryFlagDialog from "./components/InventoryFlagDialog";
import InventoryItemDialog from "./components/InventoryItemDialog";
import InventoryLabelGenerateDialog from "./components/InventoryLabelGenerateDialog";
import InventoryLoanReturnDialog from "./components/InventoryLoanReturnDialog";
import InventoryLocationDialog from "./components/InventoryLocationDialog";
import InventorySidebar from "./components/InventorySidebar";
import InventoryTemplateDialog from "./components/InventoryTemplateDialog";
import InventoryCategoriesScreen from "./screens/InventoryCategoriesScreen";
import InventoryEventsScreen from "./screens/InventoryEventsScreen";
import InventoryFlagsScreen from "./screens/InventoryFlagsScreen";
import InventoryItemsScreen from "./screens/InventoryItemsScreen";
import InventoryLabelsScreen from "./screens/InventoryLabelsScreen";
import InventoryLocationsScreen from "./screens/InventoryLocationsScreen";
import InventoryLoansScreen from "./screens/InventoryLoansScreen";
import InventoryScannerScreen from "./screens/InventoryScannerScreen";

const emptyItemForm = {
  name: "",
  description: "",
  category: "",
  flag_id: null,
  quantity: 1,
  quantity_unit: "ks",
  default_location: "",
  current_location: "",
  current_location_mode: "location",
  current_event_id: null,
  current_event_quantity: 1,
  status: "available",
  notes: "",
  team_id: "",
};

const emptyEventForm = { name: "", team_id: "", start_date: "", end_date: "", note: "", status: "active" };
const emptyPhotoForm = { image_url: "", caption: "" };
const emptyLoanForm = { borrower_name: "", quantity: 1, due_at: "", note: "" };
const emptyTemplateForm = {
  name: "",
  team_id: "",
  width_mm: 62,
  height_mm: 29,
  qr_x_mm: 3,
  qr_y_mm: 3,
  qr_size_mm: 18,
  title_font_size: 14,
  meta_font_size: 9,
  fields: ["name", "category", "current_location", "qr_identifier"],
};
const emptyLocationForm = { name: "", description: "", parent_id: null, sort_order: 0, team_id: "" };
const emptyCategoryForm = { name: "", description: "", parent_id: null, color: "#5b8def", sort_order: 0, team_id: "" };
const emptyFlagForm = { name: "", description: "", color: "neutral", sort_order: 0, team_id: "" };
const emptyBulkForm = {
  set_default_location: "",
  set_current_location: "",
  set_category: "",
  set_flag_id: null,
  assign_event_id: null,
  assign_event_quantity: 1,
};
const emptyEventReturnForm = {
  quantity: 1,
  condition: "ok",
  current_location: "",
  note: "",
};
const emptyLoanReturnForm = {
  note: "",
};

function toIsoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const [activeScreen, setActiveScreen] = useState("items");
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState(null);
  const [search, setSearch] = useState("");
  const [presenceFilter, setPresenceFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [scanValue, setScanValue] = useState("");
  const [eventScanValue, setEventScanValue] = useState("");
  const [scanFeedback, setScanFeedback] = useState("");
  const [labelPreview, setLabelPreview] = useState(null);
  const [selectedLabelTemplateId, setSelectedLabelTemplateId] = useState(null);

  const [itemDialogVisible, setItemDialogVisible] = useState(false);
  const [itemDialogMode, setItemDialogMode] = useState("create");
  const [eventDialogVisible, setEventDialogVisible] = useState(false);
  const [eventDialogMode, setEventDialogMode] = useState("create");
  const [templateDialogVisible, setTemplateDialogVisible] = useState(false);
  const [labelDialogVisible, setLabelDialogVisible] = useState(false);
  const [locationDialogVisible, setLocationDialogVisible] = useState(false);
  const [categoryDialogVisible, setCategoryDialogVisible] = useState(false);
  const [flagDialogVisible, setFlagDialogVisible] = useState(false);
  const [bulkDialogVisible, setBulkDialogVisible] = useState(false);
  const [eventReturnDialogVisible, setEventReturnDialogVisible] = useState(false);
  const [loanReturnDialogVisible, setLoanReturnDialogVisible] = useState(false);
  const [sidebarDrawerVisible, setSidebarDrawerVisible] = useState(false);
  const [bulkMode, setBulkMode] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingFlag, setEditingFlag] = useState(null);

  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [eventForm, setEventForm] = useState(emptyEventForm);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [flagForm, setFlagForm] = useState(emptyFlagForm);
  const [bulkForm, setBulkForm] = useState(emptyBulkForm);
  const [eventReturnForm, setEventReturnForm] = useState(emptyEventReturnForm);
  const [photoForm, setPhotoForm] = useState(emptyPhotoForm);
  const [loanForm, setLoanForm] = useState(emptyLoanForm);
  const [loanReturnForm, setLoanReturnForm] = useState(emptyLoanReturnForm);
  const [returningEventEntry, setReturningEventEntry] = useState(null);
  const [returningEventItem, setReturningEventItem] = useState(null);
  const [returningLoan, setReturningLoan] = useState(null);
  const [returningLoanItem, setReturningLoanItem] = useState(null);

  const { data: teams = [] } = useQuery({
    queryKey: ["inventory", "teams"],
    queryFn: inventoryApi.getTeams,
    staleTime: 60_000,
  });

  const { data: overview, isLoading, error } = useQuery({
    queryKey: ["inventory", "overview"],
    queryFn: () => inventoryApi.getOverview(),
  });

  const { data: eventDetail } = useQuery({
    queryKey: ["inventory", "event", selectedEventId],
    queryFn: () => inventoryApi.getEventDetail(selectedEventId),
    enabled: Boolean(selectedEventId),
  });

  const items = overview?.items ?? [];
  const events = overview?.events ?? [];
  const templates = overview?.label_templates ?? [];
  const locations = overview?.locations ?? [];
  const categoriesTree = overview?.categories ?? [];
  const flags = overview?.flags ?? [];
  const editableFlags = useMemo(() => flags.filter((flag) => !flag.is_system), [flags]);
  const flatLocations = useMemo(() => flattenLocationTree(locations), [locations]);
  const flatCategories = useMemo(() => flattenLocationTree(categoriesTree), [categoriesTree]);
  const categoryMetaByPath = useMemo(() => buildPathMetaMap(categoriesTree), [categoriesTree]);
  const locationTreeOptions = useMemo(() => buildLocationOptions(locations), [locations]);
  const locationOptions = useMemo(() => {
    const options = buildLocationOptions(locations);
    const extra = items
      .flatMap((item) => [item.default_location, item.current_location])
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, label: `${value} (mimo strom)` }));
    return [...options, ...extra];
  }, [locations, items]);
  const categoryOptions = useMemo(() => {
    const options = buildCategoryOptions(categoriesTree);
    const extra = items
      .map((item) => item.category)
      .filter(Boolean)
      .filter((value, index, array) => array.indexOf(value) === index)
      .filter((value) => !options.some((option) => option.value === value))
      .map((value) => ({ value, label: `${value} (mimo strom)` }));
    return [...options, ...extra];
  }, [categoriesTree, items]);
  const locationPaths = useMemo(() => collectLocationPaths(locations), [locations]);
  const openLoanEntries = useMemo(() => buildOpenLoanEntries(items), [items]);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;
  const selectedEvent = events.find((event) => event.id === selectedEventId) ?? null;

  useEffect(() => {
    const fallbackTeamId = teams[0]?.id ?? "";
    setItemForm((current) => ({ ...current, team_id: current.team_id || fallbackTeamId }));
    setEventForm((current) => ({ ...current, team_id: current.team_id || fallbackTeamId }));
    setTemplateForm((current) => ({ ...current, team_id: current.team_id || fallbackTeamId }));
    setLocationForm((current) => ({ ...current, team_id: current.team_id || fallbackTeamId }));
    setCategoryForm((current) => ({ ...current, team_id: current.team_id || fallbackTeamId }));
    setFlagForm((current) => ({ ...current, team_id: current.team_id || fallbackTeamId }));
  }, [teams]);

  useEffect(() => {
    if (!selectedEventId) {
      const candidate = events.find((event) => event.status === "active") || events.find((event) => event.status === "planned");
      if (candidate) {
        setSelectedEventId(candidate.id);
      }
    }
  }, [events, selectedEventId]);

  const filteredItems = useMemo(
    () => sortItems(filterItems(items, { search, presence: presenceFilter, flagId: flagFilter, locationPath: locationFilter, categoryPath: categoryFilter }), sortBy, sortDir),
    [items, search, presenceFilter, flagFilter, locationFilter, categoryFilter, sortBy, sortDir]
  );

  const invalidateInventory = () => {
    queryClient.invalidateQueries({ queryKey: ["inventory"] });
    if (selectedEventId) {
      queryClient.invalidateQueries({ queryKey: ["inventory", "event", selectedEventId] });
    }
  };

  const createItemMutation = useMutation({
    mutationFn: inventoryApi.createItem,
    onSuccess: (item) => {
      invalidateInventory();
      setSelectedItemId(item.id);
      setSelectedItemIds((current) => Array.from(new Set([...current, item.id])));
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateItem(id, payload),
    onSuccess: () => invalidateInventory(),
  });

  const saveEventMutation = useMutation({
    mutationFn: ({ id, payload }) => (id ? inventoryApi.updateEvent(id, payload) : inventoryApi.createEvent(payload)),
    onSuccess: (event) => {
      invalidateInventory();
      setSelectedEventId(event.id);
      setEventDialogVisible(false);
    },
  });

  const addPhotoMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.addPhoto(id, payload),
    onSuccess: () => {
      invalidateInventory();
      setPhotoForm(emptyPhotoForm);
    },
  });

  const createLoanMutation = useMutation({
    mutationFn: ({ itemId, payload }) => inventoryApi.createLoan(itemId, payload),
    onSuccess: () => {
      invalidateInventory();
      setLoanForm(emptyLoanForm);
    },
  });

  const returnLoanMutation = useMutation({
    mutationFn: ({ loanId, payload = {} }) => inventoryApi.returnLoan(loanId, payload),
    onSuccess: () => invalidateInventory(),
  });

  const templateMutation = useMutation({
    mutationFn: (data) => data.id ? inventoryApi.updateTemplate(data.id, data) : inventoryApi.createTemplate(data),
    onSuccess: () => {
      invalidateInventory();
      setTemplateDialogVisible(false);
      setTemplateForm(emptyTemplateForm);
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: inventoryApi.deleteTemplate,
    onSuccess: () => invalidateInventory(),
  });

  const generateLabelsMutation = useMutation({
    mutationFn: inventoryApi.generateLabels,
    onSuccess: (pdfBlob) => {
      // Create download link for PDF
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'labels.pdf';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
  });

  const createLocationMutation = useMutation({
    mutationFn: inventoryApi.createLocation,
    onSuccess: () => {
      invalidateInventory();
      setLocationDialogVisible(false);
      setEditingLocation(null);
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateLocation(id, payload),
    onSuccess: () => {
      invalidateInventory();
      setLocationDialogVisible(false);
      setEditingLocation(null);
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: inventoryApi.deleteLocation,
    onSuccess: () => invalidateInventory(),
  });

  const createCategoryMutation = useMutation({
    mutationFn: inventoryApi.createCategory,
    onSuccess: () => {
      invalidateInventory();
      setCategoryDialogVisible(false);
      setEditingCategory(null);
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateCategory(id, payload),
    onSuccess: () => {
      invalidateInventory();
      setCategoryDialogVisible(false);
      setEditingCategory(null);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: inventoryApi.deleteCategory,
    onSuccess: () => invalidateInventory(),
  });

  const createFlagMutation = useMutation({
    mutationFn: inventoryApi.createFlag,
    onSuccess: () => {
      invalidateInventory();
      setFlagDialogVisible(false);
      setEditingFlag(null);
    },
  });

  const updateFlagMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateFlag(id, payload),
    onSuccess: () => {
      invalidateInventory();
      setFlagDialogVisible(false);
      setEditingFlag(null);
    },
  });

  const deleteFlagMutation = useMutation({
    mutationFn: inventoryApi.deleteFlag,
    onSuccess: () => invalidateInventory(),
  });

  const assignEventItemMutation = useMutation({
    mutationFn: ({ eventId, payload }) => inventoryApi.assignItemToEvent(eventId, payload),
    onSuccess: () => invalidateInventory(),
  });

  const deleteEventMutation = useMutation({
    mutationFn: inventoryApi.deleteEvent,
    onSuccess: () => {
      const fallback = events.find((entry) => entry.id !== selectedEventId) || null;
      setSelectedEventId(fallback?.id ?? null);
      invalidateInventory();
    },
  });

  const returnEventItemMutation = useMutation({
    mutationFn: ({ eventId, eventItemId, payload }) => inventoryApi.returnEventItem(eventId, eventItemId, payload),
    onSuccess: (detail) => {
      queryClient.setQueryData(["inventory", "event", selectedEventId], detail);
      invalidateInventory();
      setEventReturnDialogVisible(false);
      setReturningEventEntry(null);
      setReturningEventItem(null);
      setEventReturnForm(emptyEventReturnForm);
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: inventoryApi.bulkUpdateItems,
    onSuccess: () => {
      invalidateInventory();
      setBulkDialogVisible(false);
      setBulkMode(null);
    },
  });

  const scanReturnMutation = useMutation({
    mutationFn: ({ eventId, payload }) => inventoryApi.scanEventReturn(eventId, payload),
    onSuccess: (detail) => {
      queryClient.setQueryData(["inventory", "event", selectedEventId], detail);
      invalidateInventory();
      setScanFeedback(`Sken zpracován. Vráceno: ${detail.summary.returned.length}, chybí: ${detail.summary.missing.length}, navíc: ${detail.summary.extra.length}.`);
      setEventScanValue("");
    },
  });

  const previewLabelsMutation = useMutation({
    mutationFn: inventoryApi.previewLabels,
    onSuccess: (data) => setLabelPreview(data),
  });

  const hydrateItemEditor = (item) => {
    setSelectedItemId(item.id);
    setItemDialogMode("edit");
    setItemForm({
      name: item.name || "",
      description: item.description || "",
      category: item.category || "",
      flag_id: item.flag_id ?? null,
      quantity: item.quantity || 0,
      quantity_unit: item.quantity_unit || "ks",
      default_location: item.default_location || "",
      current_location: item.current_location || "",
      current_location_mode: item.current_event_name ? "event" : item.open_loan_quantity > 0 ? "loan" : "location",
      current_event_id: item.current_event_name ? (events.find((event) => event.name === item.current_event_name)?.id ?? null) : null,
      current_event_quantity: item.active_event_quantity || 1,
      status: item.status || "available",
      notes: item.notes || "",
      team_id: item.team_id || teams[0]?.id || "",
    });
    setPhotoForm(emptyPhotoForm);
    const openLoan = (item.loans || []).find((loan) => !loan.returned_at);
    setLoanForm(openLoan ? {
      borrower_name: openLoan.borrower_name || "",
      quantity: openLoan.quantity || 1,
      due_at: openLoan.due_at ? openLoan.due_at.slice(0, 16) : "",
      note: openLoan.note || "",
    } : emptyLoanForm);
  };

  const openCreateItem = () => {
    setItemDialogMode("create");
    setItemForm({
      ...emptyItemForm,
      team_id: teams[0]?.id || "",
      category: categoryFilter || "",
      flag_id: null,
      default_location: locationFilter || "",
      current_location: locationFilter || "",
      current_location_mode: "location",
      current_event_id: null,
      current_event_quantity: 1,
    });
    setLoanForm(emptyLoanForm);
    setItemDialogVisible(true);
  };

  const openEditItem = (item) => {
    hydrateItemEditor(item);
    setItemDialogVisible(true);
  };

  const openLabelDialog = () => {
    if (selectedItem && templates.length > 0) {
      // Open dialog to select template
      setSelectedLabelTemplateId(templates[0]?.id ?? null);
      setLabelPreview(null);
      setLabelDialogVisible(true);
    } else {
      // No templates available
      alert("Nejsou k dispozici žádné šablony štítků.");
    }
  };

  const openCreateEvent = () => {
    setEventDialogMode("create");
    setEventForm({ ...emptyEventForm, team_id: teams[0]?.id || "" });
    setEventDialogVisible(true);
  };

  const openEditEvent = () => {
    if (!selectedEvent) return;
    setEventDialogMode("edit");
    setEventForm({
      name: selectedEvent.name || "",
      team_id: selectedEvent.team_id || teams[0]?.id || "",
      start_date: selectedEvent.start_date ? selectedEvent.start_date.slice(0, 16) : "",
      end_date: selectedEvent.end_date ? selectedEvent.end_date.slice(0, 16) : "",
      note: selectedEvent.note || "",
      status: selectedEvent.status || "active",
    });
    setEventDialogVisible(true);
  };

  const openCreateRootLocation = () => {
    setEditingLocation(null);
    setLocationForm({ ...emptyLocationForm, team_id: teams[0]?.id || "", parent_id: null });
    setLocationDialogVisible(true);
  };

  const openCreateRootCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ ...emptyCategoryForm, team_id: teams[0]?.id || "", parent_id: null });
    setCategoryDialogVisible(true);
  };

  const openCreateFlag = () => {
    setEditingFlag(null);
    setFlagForm({ ...emptyFlagForm, team_id: teams[0]?.id || "" });
    setFlagDialogVisible(true);
  };

  const openCreateChildLocation = (parent) => {
    setEditingLocation(null);
    setLocationForm({
      ...emptyLocationForm,
      team_id: parent.team_id,
      parent_id: parent.id,
      sort_order: parent.children?.length || 0,
    });
    setLocationDialogVisible(true);
  };

  const openEditLocation = (location) => {
    setEditingLocation(location);
    setLocationForm({
      name: location.name,
      description: location.description || "",
      parent_id: location.parent_id,
      sort_order: location.sort_order,
      team_id: location.team_id,
    });
    setLocationDialogVisible(true);
  };

  const openCreateChildCategory = (category) => {
    setEditingCategory(null);
    setCategoryForm({
      ...emptyCategoryForm,
      team_id: category.team_id,
      parent_id: category.id,
      sort_order: category.children?.length || 0,
    });
    setCategoryDialogVisible(true);
  };

  const openEditCategory = (category) => {
    setEditingCategory(category);
    setCategoryForm({
      name: category.name,
      description: category.description || "",
      parent_id: category.parent_id,
      color: category.color,
      sort_order: category.sort_order,
      team_id: category.team_id,
    });
    setCategoryDialogVisible(true);
  };

  const openEditFlag = (flag) => {
    setEditingFlag(flag);
    setFlagForm({
      name: flag.name,
      description: flag.description || "",
      color: flag.color,
      sort_order: flag.sort_order,
      team_id: flag.team_id,
    });
    setFlagDialogVisible(true);
  };

  const handleDeleteLocation = (location) => {
    if (!window.confirm(`Smazat lokaci "${location.name}"?`)) return;
    deleteLocationMutation.mutate(location.id);
    if (locationFilter === location.path) setLocationFilter("");
  };

  const handleDeleteCategory = (category) => {
    if (!window.confirm(`Smazat kategorii "${category.name}"?`)) return;
    deleteCategoryMutation.mutate(category.id);
    if (categoryFilter === category.path) setCategoryFilter("");
  };

  const handleDeleteFlag = (flag) => {
    if (!window.confirm(`Smazat příznak "${flag.name}"?`)) return;
    deleteFlagMutation.mutate(flag.id);
    if (flagFilter === String(flag.id)) setFlagFilter("");
  };

  const handleSaveItem = async ({ closeAfterSave = true, section = "all" } = {}) => {
    const shouldProcessLocationFlows = section === "all" || section === "location";
    const payload = {
      ...itemForm,
      team_id: Number(itemForm.team_id),
      flag_id: itemForm.flag_id || null,
      current_location: itemForm.current_location_mode === "location" ? itemForm.current_location : itemForm.default_location,
      photos: !selectedItem && photoForm.image_url ? [{ image_url: photoForm.image_url }] : [],
    };
    try {
      const savedItem = itemDialogMode === "create"
        ? await createItemMutation.mutateAsync(payload)
        : await updateItemMutation.mutateAsync({ id: selectedItemId, payload });

      if (shouldProcessLocationFlows && itemForm.current_location_mode === "event" && itemForm.current_event_id) {
        await assignEventItemMutation.mutateAsync({
          eventId: itemForm.current_event_id,
          payload: {
            item_id: savedItem.id,
            planned_quantity: Number(itemForm.current_event_quantity || 1),
          },
        });

        // Refresh the item data to show the new assignment
        if (!closeAfterSave) {
          const freshItem = await inventoryApi.getItem(savedItem.id);
          openEditItem(freshItem);
        }
      }

      if (
        shouldProcessLocationFlows
        && itemForm.current_location_mode === "loan"
        && loanForm.borrower_name.trim()
      ) {
        await createLoanMutation.mutateAsync({
          itemId: savedItem.id,
          payload: {
            ...loanForm,
            due_at: toIsoOrNull(loanForm.due_at),
          },
        });
      }

      invalidateInventory();
      const freshItem = await inventoryApi.getItem(savedItem.id);
      hydrateItemEditor(freshItem);
      if (!closeAfterSave && section === "location" && itemForm.current_location_mode === "event") {
        setItemForm((current) => ({
          ...current,
          current_event_id: null,
          current_event_quantity: Math.max(1, freshItem.available_quantity || 1),
        }));
      }
      if (!closeAfterSave && section === "location" && itemForm.current_location_mode === "loan") {
        setLoanForm(emptyLoanForm);
      }
      if (closeAfterSave) {
        setItemDialogVisible(false);
      } else {
        setItemDialogVisible(true);
      }
    } catch {
      return;
    }
  };

  const handleSaveEvent = () => {
    saveEventMutation.mutate({
      id: eventDialogMode === "edit" ? selectedEventId : null,
      payload: {
        ...eventForm,
        team_id: Number(eventForm.team_id),
        start_date: toIsoOrNull(eventForm.start_date),
        end_date: toIsoOrNull(eventForm.end_date),
      },
    });
  };

  const handleSaveTemplate = () => {
    createTemplateMutation.mutate({ ...templateForm, team_id: Number(templateForm.team_id) });
  };

  const handleSaveLocation = () => {
    const payload = {
      name: locationForm.name,
      description: locationForm.description,
      parent_id: locationForm.parent_id,
      sort_order: Number(locationForm.sort_order || 0),
      team_id: Number(locationForm.team_id),
    };
    if (editingLocation) {
      updateLocationMutation.mutate({ id: editingLocation.id, payload });
      return;
    }
    createLocationMutation.mutate(payload);
  };

  const handleSaveCategory = () => {
    const payload = {
      name: categoryForm.name,
      description: categoryForm.description,
      parent_id: categoryForm.parent_id,
      color: categoryForm.color,
      sort_order: Number(categoryForm.sort_order || 0),
      team_id: Number(categoryForm.team_id),
    };
    if (editingCategory) {
      updateCategoryMutation.mutate({ id: editingCategory.id, payload });
      return;
    }
    createCategoryMutation.mutate(payload);
  };

  const handleSaveFlag = () => {
    const payload = {
      name: flagForm.name,
      description: flagForm.description,
      color: flagForm.color,
      sort_order: Number(flagForm.sort_order || 0),
      team_id: Number(flagForm.team_id),
    };
    if (editingFlag) {
      updateFlagMutation.mutate({ id: editingFlag.id, payload });
      return;
    }
    createFlagMutation.mutate(payload);
  };

  const openBulkAction = (mode) => {
    setBulkMode(mode);
    setBulkForm({
      ...emptyBulkForm,
      set_default_location: locationFilter || "",
      set_category: categoryFilter || "",
      set_flag_id: null,
    });
    setBulkDialogVisible(true);
  };

  const handleBulkSubmit = () => {
    const payload = { item_ids: selectedItemIds };
    if (bulkMode === "flag") payload.set_flag_id = bulkForm.set_flag_id;
    if (bulkMode === "location") payload.set_default_location = bulkForm.set_default_location;
    if (bulkMode === "category") payload.set_category = bulkForm.set_category;
    if (bulkMode === "event") {
      payload.assign_event_id = bulkForm.assign_event_id;
      payload.assign_event_quantity = bulkForm.assign_event_quantity;
    }
    bulkUpdateMutation.mutate(payload);
  };

  const handleFindItem = async () => {
    if (!scanValue.trim()) return;
    try {
      const item = await inventoryApi.findByQr(scanValue.trim());
      openEditItem(item);
      setScanFeedback(`Načtena věc: ${item.name}`);
      setScanValue("");
    } catch {
      setScanFeedback("QR identifikátor se nepodařilo najít.");
    }
  };

  const handleScanReturn = () => {
    if (!selectedEventId || !eventScanValue.trim()) return;
    scanReturnMutation.mutate({ eventId: selectedEventId, payload: { qr_identifier: eventScanValue.trim() } });
  };

  const openEventReturnDialog = (entry, item) => {
    const remainingQuantity = Math.max((entry?.planned_quantity || 0) - (entry?.returned_quantity || 0), 0);
    setReturningEventEntry(entry);
    setReturningEventItem(item);
    setEventReturnForm({
      quantity: Math.max(remainingQuantity, 1),
      condition: "ok",
      current_location: item?.default_location || "",
      note: "",
    });
    setEventReturnDialogVisible(true);
  };

  const openLoanReturnDialog = (loan, item) => {
    setReturningLoan(loan);
    setReturningLoanItem(item);
    setLoanReturnForm(emptyLoanReturnForm);
    setLoanReturnDialogVisible(true);
  };

  const handleDeleteEvent = () => {
    if (!selectedEvent) return;

    // Check if there are any items that haven't been fully returned
    const unreturned = (eventDetail?.items || []).filter((entry) => {
      const plannedQuantity = entry.planned_quantity || 0;
      const returnedQuantity = entry.returned_quantity || 0;
      return plannedQuantity > returnedQuantity;
    });

    if (unreturned.length > 0) {
      window.alert("Tuto akci teď nelze smazat. Nejdřív vrať nebo odeber všechny věci z akce.");
      return;
    }

    if (!window.confirm(`Smazat akci "${selectedEvent.name}"?`)) return;
    deleteEventMutation.mutate(selectedEvent.id);
  };

  const handleSubmitEventReturn = async (editAfterSave = false) => {
    if (!selectedEventId || !returningEventEntry) return;
    try {
      await returnEventItemMutation.mutateAsync({
        eventId: selectedEventId,
        eventItemId: returningEventEntry.id,
        payload: {
          quantity: Number(eventReturnForm.quantity || 1),
          condition: eventReturnForm.condition,
          current_location: eventReturnForm.current_location || null,
          note: eventReturnForm.note || null,
        },
      });
      if (editAfterSave && returningEventItem) {
        const freshItem = await inventoryApi.getItem(returningEventItem.id);
        openEditItem(freshItem);
      }
    } catch {
      return;
    }
  };

  const handleSubmitLoanReturn = async (editAfterSave = false) => {
    if (!returningLoan) return;
    try {
      // If this is a combined loan entry, return all individual loans
      const loansToReturn = returningLoan.loans || [returningLoan];

      for (const loan of loansToReturn) {
        await returnLoanMutation.mutateAsync({
          loanId: loan.id,
          payload: {
            note: loanReturnForm.note || null,
          },
        });
      }

      setLoanReturnDialogVisible(false);
      setReturningLoan(null);
      setReturningLoanItem(null);
      setLoanReturnForm(emptyLoanReturnForm);
      if (editAfterSave && returningLoanItem) {
        const freshItem = await inventoryApi.getItem(returningLoanItem.id);
        openEditItem(freshItem);
      }
    } catch {
      return;
    }
  };

  if (isLoading) return <div className="loader">Načítám sklad…</div>;
  if (error) return <div className="alert alert-danger">Nepodařilo se načíst skladový modul.</div>;

  const locationParentOptions = flatLocations
    .filter((location) => !editingLocation || location.id !== editingLocation.id)
    .map((location) => ({ value: location.id, label: `${"· ".repeat(location.depth)}${location.name}` }));
  const categoryParentOptions = flatCategories
    .filter((category) => !editingCategory || category.id !== editingCategory.id)
    .map((category) => ({ value: category.id, label: `${"· ".repeat(category.depth)}${category.name}` }));

  return (
    <>
      <div className="inventory-shell">
        <div className="inventory-mobile-topbar inventory-mobile-only">
          <button type="button" className="btn btn-outline-primary" onClick={() => setSidebarDrawerVisible(true)}>
            <i className="fas fa-bars me-2"></i>Menu
          </button>
          <div className="inventory-mobile-topbar-title">Oddílový inventář</div>
          <button type="button" className="btn btn-primary" onClick={openCreateItem}>
            <i className="fas fa-plus"></i>
          </button>
        </div>

        <InventorySidebar
          screens={INVENTORY_SCREENS}
          activeScreen={activeScreen}
          onSelectScreen={setActiveScreen}
          onCreateItem={openCreateItem}
          stats={{ items: items.length, locations: locationPaths.length, events: events.length, categories: flatCategories.length }}
        />

        <div className="inventory-content">
          {activeScreen === "items" && (
            <InventoryItemsScreen
              items={filteredItems}
              search={search}
              onSearchChange={setSearch}
              presenceFilter={presenceFilter}
              onPresenceFilterChange={setPresenceFilter}
              flagFilter={flagFilter}
              onFlagFilterChange={setFlagFilter}
              locationFilter={locationFilter}
              onLocationFilterChange={setLocationFilter}
              categoryFilter={categoryFilter}
              onCategoryFilterChange={setCategoryFilter}
              locations={locations}
              categories={categoriesTree}
              flags={flags}
              categoryMetaByPath={categoryMetaByPath}
              sortBy={sortBy}
              sortDir={sortDir}
              onSortChange={(column) => {
                if (sortBy === column) {
                  setSortDir((current) => (current === "asc" ? "desc" : "asc"));
                  return;
                }
                setSortBy(column);
                setSortDir("asc");
              }}
              onOpenItem={openEditItem}
              selectedItemIds={selectedItemIds}
              onToggleSelected={(itemId) => setSelectedItemIds((current) => (
                current.includes(itemId) ? current.filter((value) => value !== itemId) : [...current, itemId]
              ))}
              onOpenBulkAction={openBulkAction}
            />
          )}
          {activeScreen === "loans" && (
            <InventoryLoansScreen
              loanEntries={openLoanEntries}
              onOpenItem={(itemId) => {
                const item = items.find((entry) => entry.id === itemId);
                if (item) openEditItem(item);
              }}
              onOpenReturnLoan={openLoanReturnDialog}
            />
          )}
          {activeScreen === "events" && (
            <InventoryEventsScreen
              events={events}
              selectedEvent={selectedEvent}
              eventDetail={eventDetail}
              items={items}
              categoryMetaByPath={categoryMetaByPath}
              onSelectEvent={setSelectedEventId}
              onOpenCreate={openCreateEvent}
              onOpenEdit={openEditEvent}
              onDeleteEvent={handleDeleteEvent}
              onOpenReturnItem={openEventReturnDialog}
              onOpenItem={openEditItem}
            />
          )}
          {activeScreen === "scanner" && (
            <InventoryScannerScreen
              scanValue={scanValue}
              onScanValueChange={setScanValue}
              onFindItem={handleFindItem}
              eventScanValue={eventScanValue}
              onEventScanValueChange={setEventScanValue}
              onScanReturn={handleScanReturn}
              activeEvent={eventDetail}
              scanFeedback={scanFeedback}
            />
          )}
          {activeScreen === "labels" && (
            <InventoryLabelsScreen
              templates={templates}
              selectedItemIds={selectedItemIds}
              items={items}
              teams={teams}
              onCreateTemplate={(templateData) => templateMutation.mutate(templateData)}
              onUpdateTemplate={(id, templateData) => templateMutation.mutate({ ...templateData, id })}
              onDeleteTemplate={(id) => deleteTemplateMutation.mutate(id)}
              onGenerateLabels={(templateId, itemIds) => generateLabelsMutation.mutate({ template_id: templateId, item_ids: itemIds })}
            />
          )}
          {activeScreen === "locations" && (
            <InventoryLocationsScreen
              locations={locations}
              selectedPath={locationFilter}
              onSelect={setLocationFilter}
              onCreateRoot={openCreateRootLocation}
              onCreateChild={openCreateChildLocation}
              onEdit={openEditLocation}
              onDelete={handleDeleteLocation}
            />
          )}
          {activeScreen === "categories" && (
            <InventoryCategoriesScreen
              categories={categoriesTree}
              selectedPath={categoryFilter}
              onSelect={setCategoryFilter}
              onCreateRoot={openCreateRootCategory}
              onCreateChild={openCreateChildCategory}
              onEdit={openEditCategory}
              onDelete={handleDeleteCategory}
            />
          )}
          {activeScreen === "flags" && (
            <InventoryFlagsScreen
              flags={flags}
              onCreate={openCreateFlag}
              onEdit={openEditFlag}
              onDelete={handleDeleteFlag}
            />
          )}
        </div>
      </div>

      {sidebarDrawerVisible ? (
        <>
          <button type="button" className="inventory-drawer-backdrop inventory-mobile-only" onClick={() => setSidebarDrawerVisible(false)} aria-label="Zavřít menu" />
          <InventorySidebar
            screens={INVENTORY_SCREENS}
            activeScreen={activeScreen}
            onSelectScreen={setActiveScreen}
            onCreateItem={openCreateItem}
            stats={{ items: items.length, locations: locationPaths.length, events: events.length, categories: flatCategories.length }}
            isDrawer
            onClose={() => setSidebarDrawerVisible(false)}
          />
        </>
      ) : null}

      <InventoryItemDialog
        isVisible={itemDialogVisible}
        mode={itemDialogMode}
        item={selectedItem}
        form={itemForm}
        categories={categoryOptions.map((option) => option.value)}
        flags={flags}
        locationTreeOptions={locationTreeOptions}
        eventOptions={events}
        photoForm={photoForm}
        loanForm={loanForm}
        onChange={(field, value) => setItemForm((current) => ({ ...current, [field]: value }))}
        onPhotoChange={(field, value) => setPhotoForm((current) => ({ ...current, [field]: value }))}
        onLoanChange={(field, value) => setLoanForm((current) => ({ ...current, [field]: value }))}
        onUploadPhoto={(imageUrl) => {
          if (selectedItem) {
            addPhotoMutation.mutate({ id: selectedItem.id, payload: { image_url: imageUrl, caption: null } });
          }
        }}
        onReturnLoan={(loanId) => returnLoanMutation.mutate({ loanId })}
        onClose={() => setItemDialogVisible(false)}
        onSubmit={() => handleSaveItem({ closeAfterSave: true })}
        onSaveSection={(section) => handleSaveItem({ closeAfterSave: false, section })}
        onOpenReturnEvent={(assignment) => {
          if (!selectedItem) return;
          openEventReturnDialog(assignment, selectedItem);
        }}
        onOpenLabelDialog={openLabelDialog}
      />

      <InventoryLabelGenerateDialog
        isVisible={labelDialogVisible}
        item={selectedItem}
        templates={templates}
        selectedTemplateId={selectedLabelTemplateId}
        labelPreview={labelPreview}
        onChangeTemplate={setSelectedLabelTemplateId}
        onClose={() => {
          setLabelDialogVisible(false);
          setLabelPreview(null);
        }}
        onPreview={() => {
          if (selectedItem && selectedLabelTemplateId) {
            previewLabelsMutation.mutate({ item_ids: [selectedItem.id], template_id: selectedLabelTemplateId });
          }
        }}
      />

      <InventoryEventDialog
        isVisible={eventDialogVisible}
        form={eventForm}
        onChange={(field, value) => setEventForm((current) => ({ ...current, [field]: value }))}
        onClose={() => setEventDialogVisible(false)}
        onSubmit={handleSaveEvent}
      />

      <InventoryEventReturnDialog
        isVisible={eventReturnDialogVisible}
        entry={returningEventEntry}
        item={returningEventItem}
        form={eventReturnForm}
        locationOptions={locationTreeOptions}
        onChange={(field, value) => setEventReturnForm((current) => ({ ...current, [field]: value }))}
        onClose={() => {
          setEventReturnDialogVisible(false);
          setReturningEventEntry(null);
          setReturningEventItem(null);
          setEventReturnForm(emptyEventReturnForm);
        }}
        onSubmit={() => handleSubmitEventReturn(false)}
        onSubmitAndEdit={() => handleSubmitEventReturn(true)}
      />


      <InventoryTemplateDialog
        isVisible={templateDialogVisible}
        form={templateForm}
        onChange={(field, value) => setTemplateForm((current) => ({ ...current, [field]: value }))}
        onToggleField={(field) => setTemplateForm((current) => ({
          ...current,
          fields: current.fields.includes(field) ? current.fields.filter((value) => value !== field) : [...current.fields, field],
        }))}
        onClose={() => setTemplateDialogVisible(false)}
        onSubmit={handleSaveTemplate}
      />

      <InventoryLocationDialog
        isVisible={locationDialogVisible}
        form={locationForm}
        parentOptions={locationParentOptions}
        onChange={(field, value) => setLocationForm((current) => ({ ...current, [field]: value }))}
        onClose={() => { setLocationDialogVisible(false); setEditingLocation(null); }}
        onSubmit={handleSaveLocation}
        editing={Boolean(editingLocation)}
      />

      <InventoryCategoryDialog
        isVisible={categoryDialogVisible}
        form={categoryForm}
        parentOptions={categoryParentOptions}
        onChange={(field, value) => setCategoryForm((current) => ({ ...current, [field]: value }))}
        onClose={() => { setCategoryDialogVisible(false); setEditingCategory(null); }}
        onSubmit={handleSaveCategory}
        editing={Boolean(editingCategory)}
      />

      <InventoryFlagDialog
        isVisible={flagDialogVisible}
        form={flagForm}
        onChange={(field, value) => setFlagForm((current) => ({ ...current, [field]: value }))}
        onClose={() => { setFlagDialogVisible(false); setEditingFlag(null); }}
        onSubmit={handleSaveFlag}
        editing={Boolean(editingFlag)}
      />

      <InventoryBulkDialog
        isVisible={bulkDialogVisible}
        mode={bulkMode}
        form={bulkForm}
        eventOptions={events}
        locationOptions={locationOptions}
        categoryOptions={categoryOptions}
        flags={editableFlags}
        selectedCount={selectedItemIds.length}
        onChange={(field, value) => setBulkForm((current) => ({ ...current, [field]: value }))}
        onClose={() => { setBulkDialogVisible(false); setBulkMode(null); }}
        onSubmit={handleBulkSubmit}
      />
    </>
  );
}
