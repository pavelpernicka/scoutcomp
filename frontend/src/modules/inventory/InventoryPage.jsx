import React from "react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { inventoryApi } from "./api";
import { formatServerDateToInputValue } from "../../utils/dateUtils";
import {
  buildOpenLoanEntries,
  buildCategoryOptions,
  buildLocationOptions,
  buildPathMetaMap,
  filterItems,
  flattenLocationTree,
  INVENTORY_SCREENS,
  sortItems,
} from "./helpers";
import InventoryBulkDialog from "./components/InventoryBulkDialog";
import InventoryCategoryDialog from "./components/InventoryCategoryDialog";
import InventoryFlagDialog from "./components/InventoryFlagDialog";
import InventoryItemDialog from "./components/InventoryItemDialog";
import InventorySetDialog from "./components/InventorySetDialog";
import InventoryLabelGenerateDialog from "./components/InventoryLabelGenerateDialog";
import InventoryLocationDialog from "./components/InventoryLocationDialog";
import InventoryCategoriesScreen from "./screens/InventoryCategoriesScreen";
import InventoryFlagsScreen from "./screens/InventoryFlagsScreen";
import InventoryItemsScreen from "./screens/InventoryItemsScreen";
import InventoryLabelsScreen from "./screens/InventoryLabelsScreen";
import InventoryLocationsScreen from "./screens/InventoryLocationsScreen";
import InventoryLoansScreen from "./screens/InventoryLoansScreen";
import InventoryScannerScreen from "./screens/InventoryScannerScreen";
import InventorySettingsScreen from "./screens/InventorySettingsScreen";
import InventorySetsScreen from "./screens/InventorySetsScreen";

const emptyItemForm = {
  name: "",
  description: "",
  category: "",
  flag_id: null,
  quantity: 1,
  quantity_unit: "ks",
  default_location: "",
  current_location: "",
  locations: [],
  status: "available",
  notes: "",
};

const emptyPhotoForm = { image_url: "", caption: "" };
const emptyLoanForm = { borrower_name: "", quantity: 1, due_at: "", note: "", location: "" };
const emptyLocationForm = { name: "", description: "", parent_id: null, sort_order: 0 };
const emptyCategoryForm = { name: "", description: "", parent_id: null, color: "#5b8def", sort_order: 0 };
const emptyFlagForm = { name: "", description: "", color: "#526174", sort_order: 0 };
const emptyBulkForm = {
  set_default_location: "",
  set_current_location: "",
  set_category: "",
  set_flag_id: null,
  set_id: null,
  borrower_name: "",
  due_at: "",
  note: "",
};
const EMPTY_LIST = [];

function toIsoOrNull(value) {
  return value ? new Date(value).toISOString() : null;
}

function inventoryErrorMessage(error, fallback) {
  const detail = error?.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((entry) => entry?.msg || entry?.message || "Neplatná hodnota").join(" ");
  }
  if (detail && typeof detail === "object") return detail.msg || detail.message || fallback;
  return fallback;
}

export default function InventoryPage() {
  const queryClient = useQueryClient();
  const { screen } = useParams();
  const navigate = useNavigate();
  const activeScreen = INVENTORY_SCREENS.some((entry) => entry.id === screen) ? screen : "items";
  const [selectedItemId, setSelectedItemId] = useState(null);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [search, setSearch] = useState("");
  const [presenceFilter, setPresenceFilter] = useState("");
  const [flagFilter, setFlagFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [scanValue, setScanValue] = useState("");
  const [scanFeedback, setScanFeedback] = useState("");
  const [settingsSection, setSettingsSection] = useState("categories");
  const [selectedLabelTemplateId, setSelectedLabelTemplateId] = useState(null);
  const [labelItemIds, setLabelItemIds] = useState([]);

  const [itemDialogVisible, setItemDialogVisible] = useState(false);
  const [itemDialogMode, setItemDialogMode] = useState("create");
  const [labelDialogVisible, setLabelDialogVisible] = useState(false);
  const [locationDialogVisible, setLocationDialogVisible] = useState(false);
  const [categoryDialogVisible, setCategoryDialogVisible] = useState(false);
  const [flagDialogVisible, setFlagDialogVisible] = useState(false);
  const [bulkDialogVisible, setBulkDialogVisible] = useState(false);
  const [bulkMode, setBulkMode] = useState(null);
  const [editingLocation, setEditingLocation] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editingFlag, setEditingFlag] = useState(null);
  const [setDialogVisible, setSetDialogVisible] = useState(false);
  const [editingSet, setEditingSet] = useState(null);

  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [locationForm, setLocationForm] = useState(emptyLocationForm);
  const [categoryForm, setCategoryForm] = useState(emptyCategoryForm);
  const [flagForm, setFlagForm] = useState(emptyFlagForm);
  const [bulkForm, setBulkForm] = useState(emptyBulkForm);
  const [photoForm, setPhotoForm] = useState(emptyPhotoForm);
  const [loanForm, setLoanForm] = useState(emptyLoanForm);
  const [itemSaveError, setItemSaveError] = useState("");

  useEffect(() => {
    if (screen === "locations") {
      setSettingsSection("locations");
      navigate("/inventory/settings", { replace: true });
    }
  }, [navigate, screen]);

  const { data: overview, isLoading, error } = useQuery({
    queryKey: ["inventory", "overview"],
    queryFn: () => inventoryApi.getOverview(),
  });

  const items = overview?.items ?? EMPTY_LIST;
  const templates = overview?.label_templates ?? EMPTY_LIST;
  const locations = overview?.locations ?? EMPTY_LIST;
  const categoriesTree = overview?.categories ?? EMPTY_LIST;
  const flags = overview?.flags ?? EMPTY_LIST;
  const sets = overview?.sets ?? EMPTY_LIST;
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
  const openLoanEntries = useMemo(() => buildOpenLoanEntries(items), [items]);
  const selectedItem = items.find((item) => item.id === selectedItemId) ?? null;

  const filteredItems = useMemo(
    () => sortItems(filterItems(items, { search, presence: presenceFilter, flagId: flagFilter, locationPath: locationFilter, categoryPath: categoryFilter }, sets), sortBy, sortDir),
    [items, sets, search, presenceFilter, flagFilter, locationFilter, categoryFilter, sortBy, sortDir]
  );

  const replaceItemInOverview = (item) => {
    queryClient.setQueryData(["inventory", "overview"], (current) => {
      if (!current) return current;
      const exists = current.items.some((currentItem) => currentItem.id === item.id);
      return {
        ...current,
        items: exists
          ? current.items.map((currentItem) => (currentItem.id === item.id ? item : currentItem))
          : [...current.items, item],
      };
    });
  };

  const replaceItemsInOverview = (updatedItems) => {
    const itemsById = new Map(updatedItems.map((item) => [item.id, item]));
    queryClient.setQueryData(["inventory", "overview"], (current) => (
      current
        ? { ...current, items: current.items.map((item) => itemsById.get(item.id) ?? item) }
        : current
    ));
  };

  const refreshOverviewPart = async (key, fetcher) => {
    const value = await fetcher();
    queryClient.setQueryData(["inventory", "overview"], (current) => (
      current ? { ...current, [key]: value } : current
    ));
  };

  const refreshOverviewFlags = async () => {
    const updatedFlags = await inventoryApi.getFlags();
    const flagsById = new Map(updatedFlags.map((flag) => [flag.id, flag]));
    queryClient.setQueryData(["inventory", "overview"], (current) => (
      current
        ? {
          ...current,
          flags: updatedFlags,
          items: current.items.map((item) => ({
            ...item,
            flag: item.flag_id ? flagsById.get(item.flag_id) ?? null : null,
            flag_id: item.flag_id && !flagsById.has(item.flag_id) ? null : item.flag_id,
          })),
        }
        : current
    ));
  };

  const refreshOverviewSets = async () => refreshOverviewPart("sets", inventoryApi.getSets);

  const createItemMutation = useMutation({
    mutationFn: inventoryApi.createItem,
    onSuccess: (item) => {
      replaceItemInOverview(item);
      setSelectedItemId(item.id);
      setSelectedItemIds((current) => Array.from(new Set([...current, item.id])));
    },
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateItem(id, payload),
    onSuccess: replaceItemInOverview,
  });

  const addPhotoMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.addPhoto(id, payload),
    onSuccess: (item) => {
      replaceItemInOverview(item);
      setPhotoForm(emptyPhotoForm);
    },
  });

  const createLoanMutation = useMutation({
    mutationFn: ({ itemId, payload }) => inventoryApi.createLoan(itemId, payload),
    onSuccess: (item) => {
      replaceItemInOverview(item);
      setLoanForm(emptyLoanForm);
    },
  });

  const returnLoanMutation = useMutation({
    mutationFn: ({ loanId, payload = {} }) => inventoryApi.returnLoan(loanId, payload),
    onSuccess: replaceItemInOverview,
  });

  const templateMutation = useMutation({
    mutationFn: (data) => data.id ? inventoryApi.updateTemplate(data.id, data) : inventoryApi.createTemplate(data),
    onSuccess: () => refreshOverviewPart("label_templates", inventoryApi.getLabelTemplates),
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: inventoryApi.deleteTemplate,
    onSuccess: () => refreshOverviewPart("label_templates", inventoryApi.getLabelTemplates),
  });

  const createLocationMutation = useMutation({
    mutationFn: inventoryApi.createLocation,
    onSuccess: async () => {
      await refreshOverviewPart("locations", inventoryApi.getLocations);
      setLocationDialogVisible(false);
      setEditingLocation(null);
    },
  });

  const updateLocationMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateLocation(id, payload),
    onSuccess: async () => {
      await refreshOverviewPart("locations", inventoryApi.getLocations);
      setLocationDialogVisible(false);
      setEditingLocation(null);
    },
  });

  const deleteLocationMutation = useMutation({
    mutationFn: inventoryApi.deleteLocation,
    onSuccess: () => refreshOverviewPart("locations", inventoryApi.getLocations),
  });

  const createCategoryMutation = useMutation({
    mutationFn: inventoryApi.createCategory,
    onSuccess: async () => {
      await refreshOverviewPart("categories", inventoryApi.getCategories);
      setCategoryDialogVisible(false);
      setEditingCategory(null);
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateCategory(id, payload),
    onSuccess: async () => {
      await refreshOverviewPart("categories", inventoryApi.getCategories);
      setCategoryDialogVisible(false);
      setEditingCategory(null);
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: inventoryApi.deleteCategory,
    onSuccess: () => refreshOverviewPart("categories", inventoryApi.getCategories),
  });

  const createFlagMutation = useMutation({
    mutationFn: inventoryApi.createFlag,
    onSuccess: async () => {
      await refreshOverviewFlags();
      setFlagDialogVisible(false);
      setEditingFlag(null);
    },
  });

  const updateFlagMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateFlag(id, payload),
    onSuccess: async () => {
      await refreshOverviewFlags();
      setFlagDialogVisible(false);
      setEditingFlag(null);
    },
  });

  const deleteFlagMutation = useMutation({
    mutationFn: inventoryApi.deleteFlag,
    onSuccess: refreshOverviewFlags,
  });

  const createSetMutation = useMutation({
    mutationFn: inventoryApi.createSet,
    onSuccess: refreshOverviewSets,
  });

  const updateSetMutation = useMutation({
    mutationFn: ({ id, payload }) => inventoryApi.updateSet(id, payload),
    onSuccess: refreshOverviewSets,
  });

  const deleteSetMutation = useMutation({
    mutationFn: inventoryApi.deleteSet,
    onSuccess: async (_data, setId) => {
      await refreshOverviewSets();
      queryClient.setQueryData(["inventory", "overview"], (current) => (
        current ? { ...current, items: current.items.map((item) => item.set_id === setId ? { ...item, set_id: null } : item) } : current
      ));
    },
  });

  const addItemsToSetMutation = useMutation({
    mutationFn: ({ id, item_ids }) => inventoryApi.addItemsToSet(id, { item_ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["inventory", "overview"] }),
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: inventoryApi.bulkUpdateItems,
    onSuccess: (items) => {
      replaceItemsInOverview(items);
      setBulkDialogVisible(false);
      setBulkMode(null);
    },
  });
  const bulkLoanMutation = useMutation({
    mutationFn: inventoryApi.bulkCreateLoans,
    onSuccess: (updatedItems) => {
      replaceItemsInOverview(updatedItems);
      setBulkDialogVisible(false);
      setBulkMode(null);
    },
  });

  const hydrateItemEditor = (item) => {
    setSelectedItemId(item.id);
    setItemDialogMode("edit");
    setItemForm({
      name: item.name || "",
      description: item.description || "",
      category: item.category || "",
      flag_id: item.flag_id ?? null,
      set_id: item.set_id ?? null,
      quantity: item.quantity || 0,
      quantity_unit: item.quantity_unit || "ks",
      default_location: item.default_location || "",
      current_location: item.current_location || "",
      locations: (item.locations || []).map((location) => ({ location: location.location, quantity: location.quantity })),
      status: item.status || "available",
      notes: item.notes || "",
    });
    setPhotoForm(emptyPhotoForm);
    const openLoan = (item.loans || []).find((loan) => !loan.returned_at);
    setLoanForm(openLoan ? {
      borrower_name: openLoan.borrower_name || "",
      quantity: openLoan.quantity || 1,
      due_at: formatServerDateToInputValue(openLoan.due_at),
      note: openLoan.note || "",
      location: openLoan.source_location || "",
    } : emptyLoanForm);
  };

  const openCreateItem = () => {
    setItemSaveError("");
    setItemDialogMode("create");
    setItemForm({
      ...emptyItemForm,
      category: categoryFilter || "",
      flag_id: null,
      set_id: null,
      default_location: locationFilter || "",
      current_location: locationFilter || "",
      locations: [{ location: locationFilter || "", quantity: 1 }],
    });
    setLoanForm(emptyLoanForm);
    setItemDialogVisible(true);
  };

  const openSetDialog = (inventorySet) => {
    setEditingSet(inventorySet);
    setSetDialogVisible(true);
  };

  const openEditItem = (item) => {
    setItemSaveError("");
    hydrateItemEditor(item);
    setItemDialogVisible(true);
  };

  const openLabelDialog = () => {
    if (selectedItem && templates.length > 0) {
      setLabelItemIds([selectedItem.id]);
      setSelectedLabelTemplateId(templates[0]?.id ?? null);
      setLabelDialogVisible(true);
    } else {
      // No templates available
      alert("Nejsou k dispozici žádné šablony štítků.");
    }
  };

  const openBulkLabelDialog = () => {
    if (!selectedItemIds.length) return;
    if (!templates.length) {
      alert("Nejsou k dispozici žádné šablony štítků.");
      return;
    }
    setLabelItemIds(selectedItemIds);
    setSelectedLabelTemplateId(templates[0]?.id ?? null);
    setLabelDialogVisible(true);
  };

  const openCreateRootLocation = () => {
    setEditingLocation(null);
    setLocationForm({ ...emptyLocationForm, parent_id: null });
    setLocationDialogVisible(true);
  };

  const openCreateRootCategory = () => {
    setEditingCategory(null);
    setCategoryForm({ ...emptyCategoryForm, parent_id: null });
    setCategoryDialogVisible(true);
  };

  const openCreateFlag = () => {
    setEditingFlag(null);
    setFlagForm(emptyFlagForm);
    setFlagDialogVisible(true);
  };

  const openCreateChildLocation = (parent) => {
    setEditingLocation(null);
    setLocationForm({
      ...emptyLocationForm,
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
    });
    setLocationDialogVisible(true);
  };

  const openCreateChildCategory = (category) => {
    setEditingCategory(null);
    setCategoryForm({
      ...emptyCategoryForm,
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
    });
    setCategoryDialogVisible(true);
  };

  const openEditFlag = (flag) => {
    setEditingFlag(flag);
    setFlagForm({
      name: flag.name,
      description: flag.description || "",
      color: /^#[0-9a-f]{6}$/i.test(flag.color || "") ? flag.color : "#526174",
      sort_order: flag.sort_order,
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
    if (!itemForm.name.trim()) {
      setItemSaveError("Vyplň název věci.");
      return;
    }
    if (!Number.isInteger(Number(itemForm.quantity)) || Number(itemForm.quantity) < 1) {
      setItemSaveError("Množství musí být celé číslo alespoň 1.");
      return;
    }
    const locations = (itemForm.locations || []).map((location) => ({
      location: location.location.trim(),
      quantity: Number(location.quantity) || 0,
    }));
    const availableQuantity = Number(itemForm.quantity) - Number(selectedItem?.open_loan_quantity || 0);
    const hasLegacyAllocation = itemDialogMode === "edit" && locations.length === 0 && availableQuantity > 0;
    const hasInvalidAllocation = !hasLegacyAllocation && (
      locations.some((location) => !location.location)
      || new Set(locations.map((location) => location.location)).size !== locations.length
      || locations.reduce((total, location) => total + location.quantity, 0) !== availableQuantity
    );
    if (hasInvalidAllocation) {
      setItemSaveError(`Rozděl množství do lokací přesně na ${availableQuantity} ${itemForm.quantity_unit}. Každá lokace může být uvedena jen jednou.`);
      return;
    }
    setItemSaveError("");
    const payload = {
      ...itemForm,
      flag_id: itemForm.flag_id || null,
      current_location: itemForm.current_location || itemForm.default_location,
      locations,
      photos: !selectedItem && photoForm.image_url ? [{ image_url: photoForm.image_url }] : [],
    };
    try {
      let savedItem = itemDialogMode === "create"
        ? await createItemMutation.mutateAsync(payload)
        : await updateItemMutation.mutateAsync({ id: selectedItemId, payload });

      if (section === "loan" && loanForm.borrower_name.trim()) {
        savedItem = await createLoanMutation.mutateAsync({
          itemId: savedItem.id,
          payload: {
            ...loanForm,
            due_at: toIsoOrNull(loanForm.due_at),
          },
        });
      }

      hydrateItemEditor(savedItem);
      if (!closeAfterSave && section === "loan") {
        setLoanForm(emptyLoanForm);
      }
      if (closeAfterSave) {
        setItemDialogVisible(false);
      } else {
        setItemDialogVisible(true);
      }
    } catch (error) {
      setItemSaveError(inventoryErrorMessage(error, "Věc se nepodařilo uložit. Zkontroluj vyplněné údaje."));
      return;
    }
  };

  const handleSaveLocation = () => {
    const payload = {
      name: locationForm.name,
      description: locationForm.description,
      parent_id: locationForm.parent_id,
      sort_order: Number(locationForm.sort_order || 0),
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
    if (bulkMode === "set") {
      if (!bulkForm.set_id) return;
      addItemsToSetMutation.mutate({ id: bulkForm.set_id, item_ids: selectedItemIds });
      setBulkDialogVisible(false);
      setBulkMode(null);
      return;
    }
    if (bulkMode === "loan") {
      if (!bulkForm.borrower_name?.trim()) return;
      bulkLoanMutation.mutate({ item_ids: selectedItemIds, borrower_name: bulkForm.borrower_name.trim(), due_at: toIsoOrNull(bulkForm.due_at), note: bulkForm.note || null });
      return;
    }
    const payload = { item_ids: selectedItemIds };
    if (bulkMode === "flag") payload.set_flag_id = bulkForm.set_flag_id;
    if (bulkMode === "location") payload.set_default_location = bulkForm.set_default_location;
    if (bulkMode === "category") payload.set_category = bulkForm.set_category;
    bulkUpdateMutation.mutate(payload);
  };

  const handleFindItem = async (value = scanValue) => {
    const qrIdentifier = String(value || "").trim();
    if (!qrIdentifier) return { found: false, message: "Zadej QR identifikátor." };
    try {
      const item = await inventoryApi.findByQr(qrIdentifier);
      openEditItem(item);
      setScanFeedback(`Načtena věc: ${item.name}`);
      setScanValue("");
      return { found: true, item };
    } catch (error) {
      const missing = error?.response?.status === 404;
      const message = missing ? `Věc s QR kódem ${qrIdentifier} neexistuje.` : "QR kód se nepodařilo ověřit. Zkus to znovu.";
      setScanFeedback(message);
      return { found: false, message };
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
      <div className="inventory-content">
          {activeScreen === "items" && (
            <InventoryItemsScreen
              items={filteredItems}
              onCreateItem={openCreateItem}
              onOpenSet={openSetDialog}
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
              sets={sets}
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
              onToggleAll={(visibleIds) => setSelectedItemIds((current) => {
                const visibleSet = new Set(visibleIds);
                const allSelected = visibleIds.every((id) => current.includes(id));
                return allSelected ? current.filter((id) => !visibleSet.has(id)) : [...new Set([...current, ...visibleIds])];
              })}
              onOpenBulkAction={openBulkAction}
              onGenerateLabels={openBulkLabelDialog}
            />
          )}
          {activeScreen === "loans" && (
            <InventoryLoansScreen
              loanEntries={openLoanEntries}
              onOpenItem={(itemId) => {
                const item = items.find((entry) => entry.id === itemId);
                if (item) openEditItem(item);
              }}
              onOpenReturnLoan={(_, item) => { if (item) openEditItem(item); }}
            />
          )}
          {activeScreen === "scanner" && (
            <InventoryScannerScreen
              scanValue={scanValue}
              onScanValueChange={setScanValue}
              onFindItem={handleFindItem}
              scanFeedback={scanFeedback}
            />
          )}
          {activeScreen === "settings" && (
            <InventorySettingsScreen activeSection={settingsSection} onSectionChange={setSettingsSection}>
              {settingsSection === "labels" && (
                <InventoryLabelsScreen
                  templates={templates}
                  items={items}
                  selectedItemIds={selectedItemIds}
                  onCreateTemplate={(templateData) => templateMutation.mutateAsync(templateData)}
                  onUpdateTemplate={(id, templateData) => templateMutation.mutateAsync({ ...templateData, id })}
                  onDeleteTemplate={(id) => deleteTemplateMutation.mutate(id)}
                />
              )}
              {settingsSection === "locations" && (
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
              {settingsSection === "categories" && (
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
              {settingsSection === "flags" && (
                <InventoryFlagsScreen flags={flags} onCreate={openCreateFlag} onEdit={openEditFlag} onDelete={handleDeleteFlag} />
              )}
              {settingsSection === "sets" && (
                <InventorySetsScreen sets={sets} onCreate={(payload) => createSetMutation.mutateAsync(payload)} onUpdate={(id, payload) => updateSetMutation.mutateAsync({ id, payload })} onDelete={(id) => deleteSetMutation.mutate(id)} />
              )}
            </InventorySettingsScreen>
          )}
      </div>

      <InventoryItemDialog
        isVisible={itemDialogVisible}
        mode={itemDialogMode}
        item={selectedItem}
        form={itemForm}
        categories={categoryOptions.map((option) => option.value)}
        flags={flags}
        sets={sets}
        locationTreeOptions={locationTreeOptions}
        saveError={itemSaveError}
        photoForm={photoForm}
        loanForm={loanForm}
        onChange={(field, value) => {
          setItemSaveError("");
          setItemForm((current) => ({ ...current, [field]: value }));
        }}
        onPhotoChange={(field, value) => setPhotoForm((current) => ({ ...current, [field]: value }))}
        onLoanChange={(field, value) => setLoanForm((current) => ({ ...current, [field]: value }))}
        onUploadPhoto={(imageUrl) => {
          if (selectedItem) {
            addPhotoMutation.mutate({ id: selectedItem.id, payload: { image_url: imageUrl, caption: null } });
          }
        }}
        onReturnLoan={async (loanId) => {
          const updatedItem = await returnLoanMutation.mutateAsync({ loanId });
          hydrateItemEditor(updatedItem);
        }}
        onClose={() => { setItemSaveError(""); setItemDialogVisible(false); }}
        onSubmit={() => handleSaveItem({ closeAfterSave: true })}
        onSaveSection={(section) => handleSaveItem({ closeAfterSave: false, section })}
        onOpenLabelDialog={openLabelDialog}
      />

      <InventoryLabelGenerateDialog
        isVisible={labelDialogVisible}
        items={items.filter((item) => labelItemIds.includes(item.id))}
        templates={templates}
        selectedTemplateId={selectedLabelTemplateId}
        onChangeTemplate={setSelectedLabelTemplateId}
        onClose={() => { setLabelDialogVisible(false); setLabelItemIds([]); }}
      />

      <InventorySetDialog
        isVisible={setDialogVisible}
        inventorySet={editingSet}
        items={items}
        flags={editableFlags}
        locationOptions={locationOptions}
        onClose={() => { setSetDialogVisible(false); setEditingSet(null); }}
        onSubmit={async (payload) => { if (editingSet) { await updateSetMutation.mutateAsync({ id: editingSet.id, payload }); } setSetDialogVisible(false); setEditingSet(null); }}
        onRemoveItem={(item) => updateItemMutation.mutateAsync({ id: item.id, payload: { set_id: null } })}
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
        locationOptions={locationOptions}
        categoryOptions={categoryOptions}
        flags={editableFlags}
        sets={sets}
        selectedCount={selectedItemIds.length}
        onChange={(field, value) => setBulkForm((current) => ({ ...current, [field]: value }))}
        onClose={() => { setBulkDialogVisible(false); setBulkMode(null); }}
        onSubmit={handleBulkSubmit}
      />
    </>
  );
}
