import React from "react";
import PropTypes from "prop-types";

import Card from "../../../components/Card";
import { getEventSummaryCards } from "../helpers";

export default function InventoryEventsScreen({
  events,
  selectedEvent,
  eventDetail,
  onSelectEvent,
  onOpenCreate,
  onOpenEdit,
  selectedItem,
  assignQuantity,
  onAssignQuantityChange,
  onAssignSelectedItem,
  onRemoveEventItem,
}) {
  const summaryCards = getEventSummaryCards(eventDetail);

  return (
    <div className="row g-4">
      <div className="col-12 col-xl-4">
        <Card className="border-0 shadow-lg h-100" title="Akce a tábory" icon={<i className="fas fa-campground"></i>}>
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
                <div>
                  <strong>{event.name}</strong>
                  <div className="small text-muted">{event.note || "Bez poznámky"}</div>
                </div>
                <span className={`badge ${event.status === "active" ? "text-bg-success" : event.status === "planned" ? "text-bg-info" : "text-bg-secondary"}`}>
                  {event.status}
                </span>
              </button>
            ))}
          </div>
        </Card>
      </div>

      <div className="col-12 col-xl-8">
        <Card className="border-0 shadow-lg h-100" title={selectedEvent?.name || "Detail akce"} icon={<i className="fas fa-map-location-dot"></i>}>
          {!selectedEvent ? (
            <div className="text-muted">Vyber akci vlevo.</div>
          ) : (
            <>
              <div className="d-flex flex-wrap gap-2 mb-3">
                <button type="button" className="btn btn-outline-primary" onClick={onOpenEdit}>
                  <i className="fas fa-pen me-2"></i>Upravit akci
                </button>
                {selectedItem ? (
                  <>
                    <input
                      className="form-control"
                      style={{ maxWidth: 110 }}
                      type="number"
                      min="1"
                      value={assignQuantity}
                      onChange={(event) => onAssignQuantityChange(Number(event.target.value))}
                    />
                    <button type="button" className="btn btn-primary" onClick={onAssignSelectedItem}>
                      <i className="fas fa-arrow-right me-2"></i>Přidat vybranou věc
                    </button>
                  </>
                ) : (
                  <span className="text-muted small align-self-center">Vyber věc na obrazovce Věci a pak ji přidej na akci.</span>
                )}
              </div>
              <div className="inventory-kpi-grid mb-4">
                {summaryCards.map((card) => (
                  <div key={card.id} className={`inventory-kpi-card ${card.accent}`}>
                    <span><i className={`${card.icon} me-2`}></i>{card.label}</span>
                    <strong>{card.value}</strong>
                  </div>
                ))}
              </div>
              <div className="table-responsive">
                <table className="table inventory-modern-table align-middle">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Plán</th>
                      <th>Vráceno</th>
                      <th>Poškozené</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(eventDetail?.items || []).map((entry) => (
                      <tr key={entry.id}>
                        <td>#{entry.item_id}</td>
                        <td>{entry.planned_quantity}</td>
                        <td>{entry.returned_quantity}</td>
                        <td>{entry.damaged_quantity}</td>
                        <td>
                          <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => onRemoveEventItem(entry.id)}>
                            Odebrat
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

InventoryEventsScreen.propTypes = {
  events: PropTypes.array.isRequired,
  selectedEvent: PropTypes.object,
  eventDetail: PropTypes.object,
  onSelectEvent: PropTypes.func.isRequired,
  onOpenCreate: PropTypes.func.isRequired,
  onOpenEdit: PropTypes.func.isRequired,
  selectedItem: PropTypes.object,
  assignQuantity: PropTypes.number.isRequired,
  onAssignQuantityChange: PropTypes.func.isRequired,
  onAssignSelectedItem: PropTypes.func.isRequired,
  onRemoveEventItem: PropTypes.func.isRequired,
};
