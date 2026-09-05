import { useState } from "react";
import { api } from "../api.js";

function formatAge(ageMs) {
  if (ageMs == null) return "—";
  const s = Math.round(ageMs / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  return `${m}m ago`;
}

export default function WatchlistRow({ item, expanded, onToggle, onRemove, onAlertsSaved }) {
  const [alertHigh, setAlertHigh] = useState(item.alertHigh ?? "");
  const [alertLow, setAlertLow] = useState(item.alertLow ?? "");
  const [savingAlerts, setSavingAlerts] = useState(false);
  const [alertError, setAlertError] = useState("");

  const q = item.quote;
  const flagged = item.change?.isMeaningful;
  const topReason = flagged ? item.change.reasons[0] : null;
  const up = q && q.dayChangePct >= 0;

  async function saveAlerts(e) {
    e.stopPropagation();
    setSavingAlerts(true);
    setAlertError("");
    try {
      await api.setAlerts(
        item.symbol,
        alertHigh === "" ? null : Number(alertHigh),
        alertLow === "" ? null : Number(alertLow)
      );
      onAlertsSaved();
    } catch (err) {
      setAlertError(err.message);
    } finally {
      setSavingAlerts(false);
    }
  }

  return (
    <>
      <div
        className={`ledger-row${flagged ? " flagged" : ""}`}
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onToggle()}
        aria-expanded={expanded}
      >
        <div className="identity">
          <div className="sym-line">
            <span className="symbol">{item.symbol}</span>
            {topReason && (
              <span className={`flag-chip sev-${topReason.severity}`}>{topReason.label}</span>
            )}
          </div>
          <span className="name">{q?.name || (item.dataAvailable ? "" : "Data unavailable right now")}</span>
        </div>

        <div className="col-price">{q ? `$${q.price.toFixed(2)}` : "—"}</div>

        <div className={`col-change ${q ? (up ? "up" : "down") : ""}`}>
          {q ? `${up ? "+" : ""}${q.dayChangePct.toFixed(2)}%` : "—"}
        </div>

        <div className={`col-updated${q?.stale ? " stale" : ""}`}>
          {q ? (q.source === "simulated" ? formatAge(q.ageMs) : q.source === "stale-fallback" ? "delayed" : formatAge(q.ageMs)) : "—"}
        </div>

        <button
          className="row-remove"
          aria-label={`Remove ${item.symbol} from watchlist`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove(item.symbol);
          }}
        >
          ×
        </button>
      </div>

      {expanded && (
        <div className="ledger-row" style={{ paddingTop: 0, cursor: "default" }} onClick={(e) => e.stopPropagation()}>
          <div className="row-detail">
            <div className="detail-block">
              <div className="label">Prev. close</div>
              <div className="value">{q ? `$${q.prevClose.toFixed(2)}` : "—"}</div>
            </div>
            <div className="detail-block">
              <div className="label">52w range</div>
              <div className="value">
                {q?.weekLow && q?.weekHigh ? `$${q.weekLow.toFixed(2)} – $${q.weekHigh.toFixed(2)}` : "—"}
              </div>
            </div>
            <div className="detail-block">
              <div className="label">Volume</div>
              <div className="value">{q?.volume ? q.volume.toLocaleString() : "—"}</div>
            </div>
            <div className="detail-block">
              <div className="label">Avg. volume</div>
              <div className="value">{q?.avgVolume ? q.avgVolume.toLocaleString() : "—"}</div>
            </div>
            <div className="detail-block">
              <div className="label">Data source</div>
              <div className="value" style={{ textTransform: "capitalize" }}>
                {q?.source?.replace("-", " ") || "—"}
              </div>
            </div>
            <div className="detail-block">
              <div className="label">Last viewed</div>
              <div className="value">{item.lastViewedAt ? new Date(item.lastViewedAt).toLocaleString() : "First visit"}</div>
            </div>

            {flagged && (
              <div className="reason-list">
                <div className="label" style={{ fontFamily: "var(--font-mono)", color: "var(--paper-dim)" }}>
                  Why this is flagged
                </div>
                {item.change.reasons.map((r) => (
                  <div className="reason-item" key={r.code}>
                    {r.label}
                  </div>
                ))}
              </div>
            )}

            <div className="alerts-form" onClick={(e) => e.stopPropagation()}>
              <label htmlFor={`alert-high-${item.symbol}`}>Alert above</label>
              <input
                id={`alert-high-${item.symbol}`}
                type="number"
                step="0.01"
                placeholder="none"
                value={alertHigh}
                onChange={(e) => setAlertHigh(e.target.value)}
              />
              <label htmlFor={`alert-low-${item.symbol}`}>Alert below</label>
              <input
                id={`alert-low-${item.symbol}`}
                type="number"
                step="0.01"
                placeholder="none"
                value={alertLow}
                onChange={(e) => setAlertLow(e.target.value)}
              />
              <button onClick={saveAlerts} disabled={savingAlerts}>
                {savingAlerts ? "Saving…" : "Save alerts"}
              </button>
              {alertError && <span style={{ color: "var(--danger)", fontSize: 12 }}>{alertError}</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
