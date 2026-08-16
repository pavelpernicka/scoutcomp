import React from "react";
import PropTypes from "prop-types";
import { useState } from "react";

import {
  buildFlagFilterOptions,
  buildColorStyle,
  buildSolidColorStyle,
  getPresenceTone,
  getItemCurrentLocation,
  getItemFlagBadge,
  ITEM_PRESENCE_OPTIONS,
} from "../helpers";
import InventoryFilterTree from "../components/InventoryFilterTree";

export default function InventoryItemsScreen({
  items,
  onCreateItem,
  onOpenSet,
  search,
  onSearchChange,
  presenceFilter,
  onPresenceFilterChange,
  flagFilter,
  onFlagFilterChange,
  locationFilter,
  onLocationFilterChange,
  categoryFilter,
  onCategoryFilterChange,
  locations,
  categories,
  flags,
  sets,
  categoryMetaByPath,
  sortBy,
  sortDir,
  onSortChange,
  onOpenItem,
  selectedItemIds,
  onToggleSelected,
  onToggleAll,
  onOpenBulkAction,
  onGenerateLabels,
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expandedSetIds, setExpandedSetIds] = useState(() => new Set());
  const columns = [
    ["name", "Název"],
    ["category", "Kategorie"],
    ["quantity", "Množství"],
    ["current_location_display", "Aktuální lokace"],
    ["flag", "Příznak"],
  ];
  const flagOptions = buildFlagFilterOptions(flags);
  const activeFilterCount = [
    Boolean(categoryFilter),
    Boolean(locationFilter),
    Boolean(presenceFilter),
    Boolean(flagFilter),
  ].filter(Boolean).length;
  const allVisibleSelected = items.length > 0 && items.every((item) => selectedItemIds.includes(item.id));
  const hasActiveFilter = Boolean(search || presenceFilter || flagFilter || locationFilter || categoryFilter);
  const setById = new Map(sets.map((inventorySet) => [inventorySet.id, inventorySet]));
  const groupedItems = items.reduce((groups, item) => {
    const key = item.set_id && setById.has(item.set_id) ? `set-${item.set_id}` : `item-${item.id}`;
    const current = groups.get(key) || { set: item.set_id ? setById.get(item.set_id) : null, items: [] };
    current.items.push(item);
    groups.set(key, current);
    return groups;
  }, new Map());
  sets.filter((inventorySet) => !groupedItems.has(`set-${inventorySet.id}`) && !hasActiveFilter).forEach((inventorySet) => {
    groupedItems.set(`set-${inventorySet.id}`, { set: inventorySet, items: [] });
  });
  const rows = [...groupedItems.values()].sort((left, right) => (left.set?.name || left.items[0]?.name || "").localeCompare(right.set?.name || right.items[0]?.name || "", "cs"));
  const toggleSetSelection = (setItems) => {
    const ids = setItems.map((item) => item.id);
    const selected = ids.every((id) => selectedItemIds.includes(id));
    ids.forEach((id) => { if (selected !== selectedItemIds.includes(id)) onToggleSelected(id); });
  };
  const renderItemRow = (item, isSetMember = false) => {
    const flagBadge = getItemFlagBadge(item);
    const currentLocation = getItemCurrentLocation(item);
    const categoryMeta = item.category ? categoryMetaByPath[item.category] : null;
    return <tr key={item.id} className={isSetMember ? "inventory-set-member-row" : ""} onClick={() => onOpenItem(item)} style={{ cursor: "pointer" }}><td onClick={(event) => event.stopPropagation()}><input type="checkbox" checked={selectedItemIds.includes(item.id)} onChange={() => onToggleSelected(item.id)} /></td><td><div className="fw-semibold">{item.name}</div></td><td>{item.category ? <span className="inventory-inline-badge" style={buildColorStyle(categoryMeta?.color || "#5b8def", 0.16)}>{item.category}</span> : "—"}</td><td>{item.available_quantity < item.quantity ? <span className="inventory-quantity-split"><strong className="is-available">{item.available_quantity}</strong><span>/</span><strong className="is-unavailable">{item.quantity}</strong><small>{item.quantity_unit}</small></span> : <>{item.quantity} {item.quantity_unit}</>}</td><td><span className={`inventory-location-pill is-${currentLocation.tone}`}>{currentLocation.label}</span></td><td><span className="inventory-inline-badge" style={flagBadge.style}>{flagBadge.label}</span></td></tr>;
  };
  const clearFilters = () => {
    onPresenceFilterChange("");
    onFlagFilterChange("");
    onLocationFilterChange("");
    onCategoryFilterChange("");
  };
  const closeFilters = () => setFiltersOpen(false);
  const handlePresenceSelect = (value) => {
    onPresenceFilterChange(value);
    closeFilters();
  };
  const handleFlagSelect = (value) => {
    onFlagFilterChange(value);
    closeFilters();
  };
  const handleLocationSelect = (value) => {
    onLocationFilterChange(value);
    closeFilters();
  };
  const handleCategorySelect = (value) => {
    onCategoryFilterChange(value);
    closeFilters();
  };

  const filtersPanel = (
    <>
      <div className="inventory-filters-header">
        <h2>Filtry</h2>
        <button type="button" className="btn btn-sm btn-outline-primary" onClick={clearFilters}>
          Reset
        </button>
      </div>
      <label className="form-label mb-2 mt-4">Kategorie</label>
      <InventoryFilterTree
        nodes={categories}
        selectedPath={categoryFilter}
        onSelect={handleCategorySelect}
        allLabel="Vše"
      />
      <label className="form-label mb-2 mt-4">Defaultní lokace</label>
      <InventoryFilterTree
        nodes={locations}
        selectedPath={locationFilter}
        onSelect={handleLocationSelect}
        allLabel="Vše"
      />
      <label className="form-label mt-4">Dostupnost</label>
      <div className="inventory-chip-group mb-3">
        {ITEM_PRESENCE_OPTIONS.map((option) => (
          <button
            key={option.value || "all"}
            type="button"
            className={`inventory-chip ${presenceFilter === option.value ? "active" : ""} ${option.value ? `inventory-chip-presence is-${getPresenceTone(option.value)}` : ""}`}
            onClick={() => handlePresenceSelect(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      <label className="form-label">Příznak</label>
      <div className="inventory-chip-group mb-4">
        {flagOptions.map((option) => (
          <button
            key={option.value || "all"}
            type="button"
            className={`inventory-chip ${flagFilter === option.value ? "active" : ""}`}
            onClick={() => handleFlagSelect(option.value)}
            style={option.value ? (flagFilter === option.value ? buildSolidColorStyle(option.color) : buildColorStyle(option.color, 0.18)) : undefined}
          >
            {option.label}
          </button>
        ))}
      </div>
    </>
  );

  return (
    <div className="inventory-workspace">
      <aside className="inventory-filters-panel">
        {filtersPanel}
      </aside>

      <section className="inventory-main-panel">
        <div className="inventory-table-hero">
          <div className="inventory-table-eyebrow">Všechny skladové zásoby</div>
          <button type="button" className="btn btn-primary" onClick={onCreateItem}>
            <i className="fas fa-plus me-2"></i>Nová věc
          </button>
        </div>

        <div className="inventory-mobile-filterbar">
          <button type="button" className="btn btn-outline-primary" onClick={() => setFiltersOpen(true)}>
            <i className="fas fa-sliders me-2"></i>Filtry
          </button>
          <div className="small text-muted">
            {activeFilterCount > 0 ? `Aktivní filtry: ${activeFilterCount}` : "Bez aktivních filtrů"}
          </div>
        </div>

        <div className="inventory-searchbar-wrap">
          <i className="fas fa-magnifying-glass"></i>
          <input
            className="inventory-searchbar"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Hledej podle názvu, popisu, kategorie nebo lokace"
          />
        </div>

        {selectedItemIds.length > 0 && (
          <div className="inventory-toolbar">
            <span className="inventory-toolbar-count">Vybráno: {selectedItemIds.length}</span>
            <button type="button" className="btn btn-outline-danger" onClick={() => onOpenBulkAction("flag")}>
              <i className="fas fa-palette me-2"></i>Příznak
            </button>
            <button type="button" className="btn btn-outline-secondary" onClick={() => onOpenBulkAction("location")}>
              <i className="fas fa-location-dot me-2"></i>Defaultní lokace
            </button>
            <button type="button" className="btn btn-outline-dark" onClick={() => onOpenBulkAction("category")}>
              <i className="fas fa-tags me-2"></i>Kategorie
            </button>
            <button type="button" className="btn btn-primary" onClick={onGenerateLabels}>
              <i className="fas fa-print me-2"></i>Generovat štítky
            </button>
            <button type="button" className="btn btn-outline-primary" onClick={() => onOpenBulkAction("set")}>
              <i className="fas fa-layer-group me-2"></i>Přidat do setu
            </button>
            <button type="button" className="btn btn-outline-primary" onClick={() => onOpenBulkAction("loan")}>
              <i className="fas fa-handshake-angle me-2"></i>Vypůjčit
            </button>
          </div>
        )}

        <div className="table-responsive">
          <table className="table inventory-modern-table inventory-items-table align-middle">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="Vybrat všechny zobrazené věci" checked={allVisibleSelected} disabled={!items.length} onChange={() => onToggleAll(items.map((item) => item.id))} /></th>
                {columns.map(([key, label]) => (
                  <th key={key}>
                    <button type="button" className="btn btn-link p-0 text-decoration-none" onClick={() => onSortChange(key)}>
                      {label}
                      {sortBy === key ? <span className="ms-1">{sortDir === "asc" ? "↑" : "↓"}</span> : null}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-5 text-muted">Žádná položka neodpovídá filtru.</td>
                </tr>
              ) : (
                rows.flatMap(({ set, items: groupItems }) => {
                  if (set) {
                    const expanded = Boolean(search) || expandedSetIds.has(set.id);
                    const selected = groupItems.length > 0 && groupItems.every((item) => selectedItemIds.includes(item.id));
                    const loaned = groupItems.filter((item) => item.open_loan_quantity > 0).length;
                    const soldOut = groupItems.filter((item) => item.available_quantity <= 0 && item.open_loan_quantity === 0).length;
                    const setRow = <tr key={`set-${set.id}`} className="inventory-set-row"><td onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={`Vybrat věci v setu ${set.name}`} disabled={!groupItems.length} checked={selected} onChange={() => toggleSetSelection(groupItems)} /></td><td colSpan={2}><div className="d-flex align-items-center gap-2"><button type="button" className="btn btn-link p-0 text-decoration-none fw-semibold" aria-expanded={expanded} onClick={() => setExpandedSetIds((current) => { const next = new Set(current); if (next.has(set.id)) next.delete(set.id); else next.add(set.id); return next; })}><i className={`fas fa-chevron-${expanded ? "down" : "right"} me-2`} /><i className="fas fa-layer-group me-2" />{set.name}</button><button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => onOpenSet(set)}><i className="fas fa-sliders me-1" />Nastavit</button></div><div className="small text-muted ms-4">{groupItems.length ? `1 set · ${groupItems.length} ${groupItems.length === 1 ? "věc" : "věcí"}${search ? " · set → nalezené věci" : ""}` : "Set je prázdný"}</div></td><td>1 set</td><td>{loaned ? `${loaned} vypůjčeno` : "Dostupné"}</td><td>{soldOut ? `${soldOut} došlo` : "—"}</td></tr>;
                    return [setRow, ...(expanded ? groupItems.map((item) => renderItemRow(item, true)) : [])];
                  }
                  return groupItems.map((item) => renderItemRow(item, false));
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {filtersOpen ? (
        <>
          <button type="button" className="inventory-drawer-backdrop inventory-mobile-only" onClick={() => setFiltersOpen(false)} aria-label="Zavřít filtry" />
          <aside className="inventory-mobile-drawer inventory-mobile-only inventory-filters-drawer">
            <div className="inventory-drawer-head">
              <strong>Filtry skladu</strong>
              <button type="button" className="btn btn-sm btn-outline-secondary inventory-drawer-close" onClick={() => setFiltersOpen(false)} aria-label="Zavřít filtry">
                <i className="fas fa-xmark"></i>
              </button>
            </div>
            {filtersPanel}
          </aside>
        </>
      ) : null}
    </div>
  );
}

InventoryItemsScreen.propTypes = {
  items: PropTypes.array.isRequired,
  onCreateItem: PropTypes.func.isRequired,
  onOpenSet: PropTypes.func.isRequired,
  search: PropTypes.string.isRequired,
  onSearchChange: PropTypes.func.isRequired,
  presenceFilter: PropTypes.string.isRequired,
  onPresenceFilterChange: PropTypes.func.isRequired,
  flagFilter: PropTypes.string.isRequired,
  onFlagFilterChange: PropTypes.func.isRequired,
  locationFilter: PropTypes.string.isRequired,
  onLocationFilterChange: PropTypes.func.isRequired,
  categoryFilter: PropTypes.string.isRequired,
  onCategoryFilterChange: PropTypes.func.isRequired,
  locations: PropTypes.array.isRequired,
  categories: PropTypes.array.isRequired,
  flags: PropTypes.array.isRequired,
  sets: PropTypes.array.isRequired,
  categoryMetaByPath: PropTypes.object.isRequired,
  sortBy: PropTypes.string.isRequired,
  sortDir: PropTypes.string.isRequired,
  onSortChange: PropTypes.func.isRequired,
  onOpenItem: PropTypes.func.isRequired,
  selectedItemIds: PropTypes.array.isRequired,
  onToggleSelected: PropTypes.func.isRequired,
  onToggleAll: PropTypes.func.isRequired,
  onOpenBulkAction: PropTypes.func.isRequired,
  onGenerateLabels: PropTypes.func.isRequired,
};
