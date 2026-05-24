import React from "react";
import PropTypes from "prop-types";
import { useMemo, useState } from "react";

import Card from "../../../components/Card";
import { buildColorStyle, getEventSummaryCards, getItemCurrentLocation, getItemFlagBadge } from "../helpers";

export default function InventoryEventsScreen({
  events,
  selectedEvent,
  eventDetail,
  items,
  categoryMetaByPath,
  onSelectEvent,
  onOpenCreate,
  onOpenEdit,
  onDeleteEvent,
  onOpenReturnItem,
  onOpenItem,
}) {
  const [search, setSearch] = useState("");
  const [scanValue, setScanValue] = useState("");
  const summaryCards = getEventSummaryCards(eventDetail);
  const eventItems = (eventDetail?.items || [])
    .filter((entry) => {
      // Show only items that haven't been fully returned
      const plannedQuantity = entry.planned_quantity || 0;
      const returnedQuantity = entry.returned_quantity || 0;
      return plannedQuantity > returnedQuantity;
    })
    .map((entry) => ({
      entry,
      item: items.find((item) => item.id === entry.item_id) || null,
    }));
  const filteredEventItems = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return eventItems;
    return eventItems.filter(({ entry, item }) => (
      [
        item?.name,
        item?.qr_identifier,
        String(entry?.item_id || ""),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized)
    ));
  }, [eventItems, search]);

  const handleScan = () => {
    const normalized = scanValue.trim().toLowerCase();
    if (!normalized) return;
    const match = eventItems.find(({ item, entry }) => (
      String(item?.qr_identifier || "").trim().toLowerCase() === normalized
      && Math.max((entry?.planned_quantity || 0) - (entry?.returned_quantity || 0), 0) > 0
    ));
    if (match) {
      onOpenReturnItem(match.entry, match.item);
      setScanValue("");
    }
  };

  return (
    <div className="inventory-events-screen">
      <section className="inventory-events-sidebar-col">
        <Card className="border-0 shadow-lg h-100 inventory-events-sidebar-card" title="Akce a tábory" icon={<i className="fas fa-campground"></i>}>
          <button type="button" className="btn btn-primary w-100 mb-3" onClick={onOpenCreate}>
            <i className="fas fa-plus me-2"></i>Nová akce
          </button>
          <div className="inventory-event-stack">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`inventory-event-card ${selectedEvent?.id === event.id ? "active" : ""}`}
                onClick={() => onSelectEvent(event.id)}
              >
                <div className="inventory-event-card-main">
                  <strong>{event.name}</strong>
                  {event.note ? <div className="small text-muted">{event.note}</div> : null}
                </div>
                <span className={`badge inventory-event-status ${event.status === "active" ? "text-bg-success" : event.status === "planned" ? "text-bg-info" : "text-bg-secondary"}`}>
                  {event.status}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </section>

      <section className="inventory-events-detail-col">
        <Card className="border-0 shadow-lg h-100 inventory-events-detail-card" title={selectedEvent?.name || "Detail akce"} icon={<i className="fas fa-map-location-dot"></i>}>
          {!selectedEvent ? (
            <div className="text-muted">Vyber akci vlevo.</div>
          ) : (
            <>
              <div className="inventory-events-actions mb-3">
                <button type="button" className="btn btn-outline-primary" onClick={onOpenEdit}>
                  <i className="fas fa-pen me-2"></i>Upravit akci
                </button>
                <button type="button" className="btn btn-outline-danger" onClick={onDeleteEvent}>
                  <i className="fas fa-trash me-2"></i>Smazat akci
                </button>
              </div>
              <div className="inventory-kpi-grid mb-4">
                {summaryCards.map((card) => (
                  <div key={card.id} className={`inventory-kpi-card ${card.accent}`}>
                    <span><i className={`${card.icon} me-2`}></i>{card.label}</span>
                    <strong>{card.value}</strong>
                  </div>
                ))}
              </div>
              <div className="inventory-searchbar-wrap mb-3">
                <i className="fas fa-magnifying-glass"></i>
                <input
                  className="inventory-searchbar"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Hledej podle názvu věci nebo QR kódu"
                />
              </div>
              <div className="d-flex gap-2 mb-4">
                <input
                  className="form-control"
                  value={scanValue}
                  onChange={(event) => setScanValue(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") handleScan();
                  }}
                  placeholder="Naskenuj QR kód věci z akce"
                />
                <button type="button" className="btn btn-outline-primary" onClick={handleScan}>
                  <i className="fas fa-qrcode me-2"></i>Skenovat
                </button>
              </div>
              <div className="table-responsive inventory-events-table-wrap">
                <table className="table inventory-modern-table inventory-events-table align-middle">
                  <thead>
                    <tr>
                      <th>Věc</th>
                      <th>Kat.</th>
                      <th>QR</th>
                      <th>Množství</th>
                      <th>Umístění</th>
                      <th>Příznak</th>
                      <th className="text-center">Na akci</th>
                      <th className="text-end">Akce</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEventItems.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-5 text-muted">Na akci teď není žádná dohledatelná položka.</td>
                      </tr>
                    ) : (
                      filteredEventItems.map(({ entry, item }) => {
                        const currentLocation = item ? getItemCurrentLocation(item) : { label: "—", tone: "neutral" };
                        const flagBadge = item ? getItemFlagBadge(item) : null;
                        const categoryMeta = item?.category ? categoryMetaByPath[item.category] : null;
                        const remaining = Math.max(entry.planned_quantity - entry.returned_quantity, 0);
                        return (
                          <tr key={entry.id}>
                            <td>
                              <button type="button" className="btn btn-link p-0 text-decoration-none fw-semibold" onClick={() => item && onOpenItem(item)}>
                                {item?.name || `#${entry.item_id}`}
                              </button>
                            </td>
                            <td>
                              {item?.category ? (
                                <span className="inventory-inline-badge" style={buildColorStyle(categoryMeta?.color || "#5b8def", 0.16)}>
                                  {item.category}
                                </span>
                              ) : "—"}
                            </td>
                            <td className="text-muted">{item?.qr_identifier || "—"}</td>
                            <td>{item ? `${item.quantity} ${item.quantity_unit}` : "—"}</td>
                            <td><span className={`inventory-location-pill is-${currentLocation.tone}`}>{currentLocation.label}</span></td>
                            <td>{flagBadge ? <span className="inventory-inline-badge" style={flagBadge.style}>{flagBadge.label}</span> : "—"}</td>
                            <td className="text-center">{remaining}</td>
                            <td className="text-end">
                              {remaining > 0 ? (
                                <button type="button" className="btn btn-sm btn-outline-success" onClick={() => onOpenReturnItem(entry, item)}>
                                  Vrátit
                                </button>
                              ) : null}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}

InventoryEventsScreen.propTypes = {
  events: PropTypes.array.isRequired,
  selectedEvent: PropTypes.object,
  eventDetail: PropTypes.object,
  items: PropTypes.array.isRequired,
  categoryMetaByPath: PropTypes.object.isRequired,
  onSelectEvent: PropTypes.func.isRequired,
  onOpenCreate: PropTypes.func.isRequired,
  onOpenEdit: PropTypes.func.isRequired,
  onDeleteEvent: PropTypes.func.isRequired,
  onOpenReturnItem: PropTypes.func.isRequired,
  onOpenItem: PropTypes.func.isRequired,
};
