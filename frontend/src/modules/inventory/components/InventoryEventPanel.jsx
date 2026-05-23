import React from "react";
import PropTypes from "prop-types";

import { EVENT_STATUS_OPTIONS } from "../helpers";

export default function InventoryEventPanel({
  events,
  eventForm,
  onEventFormChange,
  onSaveEvent,
  eventDetail,
  activeEventId,
  onSelectEvent,
  teams,
  selectedItem,
  assignQuantity,
  onAssignQuantityChange,
  onAssignSelectedItem,
  onRemoveEventItem,
}) {
  return (
    <section className="inventory-panel">
      <div className="row g-4">
        <div className="col-12 col-xl-4">
          <h2 className="h4 mb-3">Akce a tábory</h2>
          <div className="list-group inventory-event-list mb-3">
            {events.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`list-group-item list-group-item-action ${activeEventId === event.id ? "active" : ""}`}
                onClick={() => onSelectEvent(event.id)}
              >
                <div className="fw-semibold">{event.name}</div>
                <div className="small">{event.status}</div>
              </button>
            ))}
          </div>
          <div className="row g-2">
            <div className="col-12">
              <input className="form-control" placeholder="Název akce" value={eventForm.name} onChange={(event) => onEventFormChange("name", event.target.value)} />
            </div>
            <div className="col-md-6">
              <select className="form-select" value={eventForm.team_id} onChange={(event) => onEventFormChange("team_id", Number(event.target.value))}>
                {teams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <select className="form-select" value={eventForm.status} onChange={(event) => onEventFormChange("status", event.target.value)}>
                {EVENT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>
            <div className="col-md-6">
              <input className="form-control" type="datetime-local" value={eventForm.start_date} onChange={(event) => onEventFormChange("start_date", event.target.value)} />
            </div>
            <div className="col-md-6">
              <input className="form-control" type="datetime-local" value={eventForm.end_date} onChange={(event) => onEventFormChange("end_date", event.target.value)} />
            </div>
            <div className="col-12">
              <textarea className="form-control" rows={2} placeholder="Poznámka" value={eventForm.note} onChange={(event) => onEventFormChange("note", event.target.value)} />
            </div>
            <div className="col-12">
              <button className="btn btn-primary" type="button" onClick={onSaveEvent}>{activeEventId ? "Uložit akci" : "Vytvořit akci"}</button>
            </div>
          </div>
        </div>

        <div className="col-12 col-xl-8">
          <h3 className="h5 mb-3">Obsah akce</h3>
          {selectedItem && activeEventId ? (
            <div className="inventory-inline-form mb-3">
              <span>Přidat vybranou věc: <strong>{selectedItem.name}</strong></span>
              <input className="form-control" type="number" min="1" value={assignQuantity} onChange={(event) => onAssignQuantityChange(Number(event.target.value))} />
              <button className="btn btn-outline-primary" type="button" onClick={onAssignSelectedItem}>Přidat na akci</button>
            </div>
          ) : null}

          {eventDetail ? (
            <>
              <div className="inventory-summary-grid mb-3">
                <div className="inventory-summary-card"><strong>Vráceno</strong><span>{eventDetail.summary.returned.length}</span></div>
                <div className="inventory-summary-card"><strong>Chybí</strong><span>{eventDetail.summary.missing.length}</span></div>
                <div className="inventory-summary-card"><strong>Navíc</strong><span>{eventDetail.summary.extra.length}</span></div>
                <div className="inventory-summary-card"><strong>Poškozené</strong><span>{eventDetail.summary.damaged.length}</span></div>
              </div>
              <div className="table-responsive mb-3">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Item ID</th>
                      <th>Plán</th>
                      <th>Vráceno</th>
                      <th>Poškozené</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {eventDetail.items.map((item) => (
                      <tr key={item.id}>
                        <td>{item.item_id}</td>
                        <td>{item.planned_quantity}</td>
                        <td>{item.returned_quantity}</td>
                        <td>{item.damaged_quantity}</td>
                        <td><button className="btn btn-sm btn-outline-danger" type="button" onClick={() => onRemoveEventItem(item.id)}>Odebrat</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="row g-3">
                <div className="col-md-6">
                  <h4 className="h6">Chybí</h4>
                  <ul className="list-group">
                    {eventDetail.summary.missing.map((entry) => (
                      <li key={entry.item_id} className="list-group-item d-flex justify-content-between">
                        <span>{entry.name || `#${entry.item_id}`}</span>
                        <strong>{entry.missing_quantity}</strong>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="col-md-6">
                  <h4 className="h6">Navíc / mimo plán</h4>
                  <ul className="list-group">
                    {eventDetail.summary.extra.map((entry) => (
                      <li key={entry.scan_id} className="list-group-item">{entry.name || entry.qr_identifier}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </>
          ) : (
            <p className="text-muted mb-0">Vyber akci pro detail a rychlou inventuru.</p>
          )}
        </div>
      </div>
    </section>
  );
}

InventoryEventPanel.propTypes = {
  events: PropTypes.array.isRequired,
  eventForm: PropTypes.object.isRequired,
  onEventFormChange: PropTypes.func.isRequired,
  onSaveEvent: PropTypes.func.isRequired,
  eventDetail: PropTypes.object,
  activeEventId: PropTypes.number,
  onSelectEvent: PropTypes.func.isRequired,
  teams: PropTypes.array.isRequired,
  selectedItem: PropTypes.object,
  assignQuantity: PropTypes.number.isRequired,
  onAssignQuantityChange: PropTypes.func.isRequired,
  onAssignSelectedItem: PropTypes.func.isRequired,
  onRemoveEventItem: PropTypes.func.isRequired,
};
