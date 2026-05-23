export const ITEM_PRESENCE_OPTIONS = [
  { value: "", label: "Vše" },
  { value: "available", label: "Dostupné" },
  { value: "returned_elsewhere", label: "Navráceno jinam" },
  { value: "loaned", label: "Zapůjčeno" },
  { value: "on_event", label: "Na akci" },
];

export const THEME_COLOR_OPTIONS = [
  { value: "neutral", label: "Neutrální" },
  { value: "match", label: "Zelená" },
  { value: "mismatch", label: "Červená" },
  { value: "loan", label: "Oranžová" },
  { value: "event", label: "Modrá" },
];

const THEME_COLOR_STYLES = {
  neutral: { color: "#526174", background: "#f1f5f9", border: "#d8e0ea" },
  match: { color: "#1f7a45", background: "#e7f8ee", border: "#b5e2c4" },
  mismatch: { color: "#bb3b3b", background: "#fff1f1", border: "#f0c0c0" },
  loan: { color: "#b96a04", background: "#fff4e6", border: "#ffd7a6" },
  event: { color: "#1e63c5", background: "#edf5ff", border: "#b9d8ff" },
  primary: { color: "#1e63c5", background: "#edf5ff", border: "#b9d8ff" },
  secondary: { color: "#526174", background: "#f1f5f9", border: "#d8e0ea" },
  success: { color: "#1f7a45", background: "#e7f8ee", border: "#b5e2c4" },
  danger: { color: "#bb3b3b", background: "#fff1f1", border: "#f0c0c0" },
  warning: { color: "#b96a04", background: "#fff4e6", border: "#ffd7a6" },
  info: { color: "#1e63c5", background: "#edf5ff", border: "#b9d8ff" },
  dark: { color: "#24324d", background: "#e9ecef", border: "#ced4da" },
};

export const EVENT_STATUS_OPTIONS = [
  { value: "planned", label: "Plánovaná" },
  { value: "active", label: "Probíhá" },
  { value: "completed", label: "Ukončená" },
  { value: "archived", label: "Archiv" },
];

export const LABEL_FIELD_OPTIONS = [
  { value: "name", label: "Název" },
  { value: "category", label: "Kategorie" },
  { value: "current_location", label: "Aktuální lokace" },
  { value: "default_location", label: "Výchozí lokace" },
  { value: "status", label: "Stav" },
  { value: "qr_identifier", label: "QR identifikátor" },
];

export const INVENTORY_SCREENS = [
  { id: "items", label: "Věci", icon: "fas fa-box-open" },
  { id: "loans", label: "Vypůjčky", icon: "fas fa-handshake-angle" },
  { id: "events", label: "Akce", icon: "fas fa-campground" },
  { id: "scanner", label: "Skener", icon: "fas fa-qrcode" },
  { id: "labels", label: "Štítky", icon: "fas fa-tags" },
  { id: "locations", label: "Defaultní lokace", icon: "fas fa-sitemap" },
  { id: "categories", label: "Kategorie", icon: "fas fa-diagram-project" },
  { id: "flags", label: "Příznaky", icon: "fas fa-palette" },
];

export function getQrImageUrl(qrIdentifier) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(qrIdentifier)}`;
}

export function getItemPresence(item) {
  if ((item.active_event_quantity || 0) > 0 || item.current_event_name) return "on_event";
  if ((item.open_loan_quantity || 0) > 0) return "loaned";
  const current = item.current_location || item.default_location || "";
  if (current && item.default_location && current !== item.default_location) return "returned_elsewhere";
  return "available";
}

export function buildColorStyle(color, emphasis = 0.18) {
  if (!color) return {};
  if (!color.startsWith("#")) {
    const palette = THEME_COLOR_STYLES[color] || THEME_COLOR_STYLES.neutral;
    return {
      backgroundColor: palette.background,
      borderColor: palette.border,
      color: palette.color,
    };
  }
  return {
    backgroundColor: `${color}${Math.round(emphasis * 255).toString(16).padStart(2, "0")}`,
    borderColor: color,
    color,
  };
}

export function buildSolidColorStyle(color) {
  if (!color) return {};
  if (!color.startsWith("#")) {
    const palette = THEME_COLOR_STYLES[color] || THEME_COLOR_STYLES.neutral;
    const textColor = color === "loan" || color === "warning" || color === "neutral" || color === "secondary" ? "#1f2937" : "#ffffff";
    return {
      backgroundColor: palette.color,
      borderColor: palette.color,
      color: textColor,
    };
  }
  return {
    backgroundColor: color,
    borderColor: color,
    color: "#ffffff",
  };
}

export function getBootstrapTextClass(color) {
  if (!color || color === "neutral" || color === "secondary" || color === "warning" || color === "loan") return "text-dark";
  return "text-white";
}

export function getItemFlagId(item) {
  return item?.flag?.id ?? item?.flag_id ?? "";
}

export function getItemFlagBadge(item) {
  if (item?.flag) {
    return {
      label: item.flag.name,
      style: buildColorStyle(item.flag.color, 0.15),
    };
  }
  return {
    label: "Bez příznaku",
    style: buildColorStyle("neutral", 0.14),
  };
}

export function buildFlagFilterOptions(flags) {
  return [
    { value: "", label: "Vše", color: "neutral" },
    ...flags.map((flag) => ({ value: String(flag.id), label: flag.name, color: flag.color })),
  ];
}

export function getItemStatusBadge(item) {
  const presence = getItemPresence(item);
  if (presence === "on_event") return { label: "Na akci", className: "text-bg-info" };
  if (presence === "loaned") return { label: "Zapůjčeno", className: "text-bg-warning" };
  if (presence === "returned_elsewhere") return { label: "Navráceno jinam", className: "text-bg-danger" };
  return { label: "Dostupné", className: "text-bg-success" };
}

export function getPresenceTone(presence) {
  if (presence === "on_event") return "event";
  if (presence === "loaned") return "loan";
  if (presence === "returned_elsewhere") return "mismatch";
  return "match";
}

export function getItemCurrentLocation(item) {
  if ((item.active_event_quantity || 0) > 0 || item.current_event_name) {
    return {
      label: item.current_event_name ? `Akce: ${item.current_event_name}` : item.current_location || "Na akci",
      tone: "event",
    };
  }
  const openBorrowers = [...new Set((item.loans || []).filter((loan) => !loan.returned_at).map((loan) => loan.borrower_name).filter(Boolean))];
  if (openBorrowers.length > 0) {
    return {
      label: `Vypůjčeno: ${openBorrowers.join(", ")}`,
      tone: "loan",
    };
  }
  const current = item.current_location || item.default_location || "";
  if (!current) {
    return { label: "Bez lokace", tone: "neutral" };
  }
  return {
    label: current,
    tone: item.default_location && current === item.default_location ? "match" : "mismatch",
  };
}

export function flattenLocationTree(nodes, depth = 0) {
  return nodes.flatMap((node) => [
    { ...node, depth },
    ...flattenLocationTree(node.children || [], depth + 1),
  ]);
}

export function collectLocationPaths(nodes) {
  return flattenLocationTree(nodes).map((node) => node.path);
}

export function filterItems(items, { search, presence, flagId, locationPath, categoryPath }) {
  const normalizedSearch = search.trim().toLowerCase();
  return items.filter((item) => {
    if (presence && getItemPresence(item) !== presence) return false;
    if (flagId && String(getItemFlagId(item)) !== String(flagId)) return false;
    if (locationPath) {
      const fallback = item.default_location || "";
      if (!(fallback === locationPath || fallback.startsWith(`${locationPath} /`))) {
        return false;
      }
    }
    if (categoryPath) {
      const value = item.category || "";
      if (!(value === categoryPath || value.startsWith(`${categoryPath} /`))) {
        return false;
      }
    }
    if (!normalizedSearch) return true;
    const haystack = [
      item.name,
      item.description,
      item.category,
      item.default_location,
      item.current_location,
      item.qr_identifier,
      item.current_event_name,
      getItemStatusBadge(item).label,
      getItemFlagBadge(item).label,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const currentLocation = getItemCurrentLocation(item).label.toLowerCase();
    const flagLabel = getItemFlagBadge(item).label.toLowerCase();
    return haystack.includes(normalizedSearch) || currentLocation.includes(normalizedSearch) || flagLabel.includes(normalizedSearch);
  });
}

export function sortItems(items, sortBy, sortDir) {
  const direction = sortDir === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const leftValue =
      sortBy === "presence"
        ? getItemPresence(a)
        : sortBy === "flag"
          ? getItemFlagBadge(a).label
          : sortBy === "current_location_display"
            ? getItemCurrentLocation(a).label
          : a?.[sortBy] ?? "";
    const rightValue =
      sortBy === "presence"
        ? getItemPresence(b)
        : sortBy === "flag"
          ? getItemFlagBadge(b).label
          : sortBy === "current_location_display"
            ? getItemCurrentLocation(b).label
          : b?.[sortBy] ?? "";
    if (typeof leftValue === "number" && typeof rightValue === "number") {
      return (leftValue - rightValue) * direction;
    }
    return String(leftValue).localeCompare(String(rightValue), "cs", { sensitivity: "base" }) * direction;
  });
}

export function buildLocationOptions(locations) {
  return flattenLocationTree(locations).map((location) => ({
    value: location.path,
    label: `${"· ".repeat(location.depth)}${location.name}`,
  }));
}

export function buildCategoryOptions(categories) {
  return flattenLocationTree(categories).map((category) => ({
    value: category.path,
    label: `${"· ".repeat(category.depth)}${category.name}`,
  }));
}

export function buildPathMetaMap(nodes) {
  return flattenLocationTree(nodes).reduce((accumulator, node) => {
    accumulator[node.path] = node;
    return accumulator;
  }, {});
}

export function getLocationSelectValue(item) {
  return item?.current_location || item?.default_location || "";
}

export function getEventSummaryCards(detail) {
  if (!detail) return [];
  return [
    { id: "returned", label: "Vráceno", value: detail.summary.returned.length, icon: "fas fa-check-circle", accent: "success" },
    { id: "missing", label: "Chybí", value: detail.summary.missing.length, icon: "fas fa-person-circle-question", accent: "warning" },
    { id: "extra", label: "Navíc", value: detail.summary.extra.length, icon: "fas fa-plus-circle", accent: "info" },
    { id: "damaged", label: "Poškozené", value: detail.summary.damaged.length, icon: "fas fa-screwdriver-wrench", accent: "danger" },
  ];
}

export function buildLoanGroups(items) {
  const groups = new Map();
  items.forEach((item) => {
    (item.loans || []).filter((loan) => !loan.returned_at).forEach((loan) => {
      const key = loan.borrower_name.trim();
      if (!groups.has(key)) {
        groups.set(key, {
          borrowerName: key,
          openLoanCount: 0,
          openQuantity: 0,
          overdueCount: 0,
          loans: [],
        });
      }
      const group = groups.get(key);
      group.openLoanCount += 1;
      group.openQuantity += loan.quantity;
      if (loan.due_at && new Date(loan.due_at).getTime() < Date.now()) {
        group.overdueCount += 1;
      }
      group.loans.push({
        ...loan,
        itemId: item.id,
        itemName: item.name,
        quantityUnit: item.quantity_unit,
      });
    });
  });
  return [...groups.values()].sort((left, right) => left.borrowerName.localeCompare(right.borrowerName, "cs", { sensitivity: "base" }));
}
