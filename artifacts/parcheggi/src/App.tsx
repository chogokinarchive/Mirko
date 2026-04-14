import { useState, useCallback } from "react";
import { ParkingMap } from "@/components/ParkingMap";
import { searchParkings, geocodeAddress, ParkingSpot } from "@/lib/overpass";
import { useGeolocation } from "@/hooks/useGeolocation";

type Filter = "all" | "free" | "paid";

function LoadingSpinner() {
  return (
    <svg
      className="spinner"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

export default function App() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const { getPosition, loading: geoLoading } = useGeolocation();

  const doSearch = useCallback(async (lat: number, lng: number, label?: string) => {
    setLoading(true);
    setError(null);
    setSpots([]);
    setCenter({ lat, lng });
    setStatusMsg(label ? `Ricerca in: ${label}` : `Ricerca in: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
    try {
      const results = await searchParkings(lat, lng, 1000);
      setSpots(results);
      if (results.length === 0) {
        setStatusMsg("Nessun parcheggio trovato nel raggio di 1 km.");
      } else {
        setStatusMsg(`${results.length} parcheggi trovati nel raggio di 1 km.`);
      }
    } catch (e) {
      setError("Errore nel recupero dei dati. Riprova.");
      setStatusMsg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddressSearch = useCallback(async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError(null);
    setStatusMsg("Geocodifica indirizzo...");
    try {
      const geo = await geocodeAddress(q);
      if (!geo) {
        setError("Indirizzo non trovato. Prova con un indirizzo più preciso.");
        setStatusMsg(null);
        setLoading(false);
        return;
      }
      await doSearch(geo.lat, geo.lng, geo.display);
    } catch {
      setError("Errore nella ricerca dell'indirizzo.");
      setStatusMsg(null);
      setLoading(false);
    }
  }, [query, doSearch]);

  const handleGPS = useCallback(async () => {
    try {
      const pos = await getPosition();
      await doSearch(pos.lat, pos.lng, "La mia posizione");
    } catch (e: unknown) {
      setError((e as Error).message || "Impossibile ottenere la posizione GPS");
    }
  }, [getPosition, doSearch]);

  const handleMapClick = useCallback(
    async (lat: number, lng: number) => {
      await doSearch(lat, lng);
    },
    [doSearch]
  );

  const filteredCount = spots.filter((s) => {
    if (filter === "all") return true;
    if (filter === "free") return s.fee === "free";
    if (filter === "paid") return s.fee === "paid";
    return true;
  }).length;

  const isLoading = loading || geoLoading;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", position: "relative" }}>
      <div className="search-panel">
        <div
          style={{
            background: "white",
            borderRadius: "16px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}
        >
          <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f1f5f9" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
              <span style={{ fontSize: "20px" }}>🅿️</span>
              <span style={{ fontWeight: "700", fontSize: "16px", color: "#1e293b" }}>Trova Parcheggi</span>
            </div>
            <div style={{ display: "flex", gap: "6px" }}>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddressSearch()}
                placeholder="Inserisci un indirizzo o città..."
                style={{
                  flex: 1,
                  padding: "9px 12px",
                  borderRadius: "10px",
                  border: "1.5px solid #e2e8f0",
                  fontSize: "14px",
                  outline: "none",
                  color: "#1e293b",
                  transition: "border-color 0.15s",
                }}
                onFocus={(e) => (e.target.style.borderColor = "#3b82f6")}
                onBlur={(e) => (e.target.style.borderColor = "#e2e8f0")}
              />
              <button
                onClick={handleAddressSearch}
                disabled={isLoading || !query.trim()}
                style={{
                  padding: "9px 16px",
                  borderRadius: "10px",
                  background: "#2563eb",
                  color: "white",
                  border: "none",
                  fontWeight: "600",
                  fontSize: "14px",
                  cursor: isLoading || !query.trim() ? "not-allowed" : "pointer",
                  opacity: isLoading || !query.trim() ? 0.6 : 1,
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  whiteSpace: "nowrap",
                }}
              >
                {isLoading ? <LoadingSpinner /> : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                  </svg>
                )}
                Cerca
              </button>
              <button
                onClick={handleGPS}
                disabled={isLoading}
                title="Usa la mia posizione GPS"
                style={{
                  padding: "9px 12px",
                  borderRadius: "10px",
                  background: isLoading ? "#f1f5f9" : "#eff6ff",
                  color: "#2563eb",
                  border: "1.5px solid #bfdbfe",
                  cursor: isLoading ? "not-allowed" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  opacity: isLoading ? 0.6 : 1,
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <circle cx="12" cy="12" r="3"/>
                  <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                  <path d="M12 2a10 10 0 0 1 10 10"/>
                </svg>
              </button>
            </div>
          </div>

          <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
            <span style={{ fontSize: "12px", fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px" }}>Filtro:</span>
            {(["all", "free", "paid"] as Filter[]).map((f) => {
              const labels = { all: "Tutti", free: "Gratuiti", paid: "A pagamento" };
              const colors = {
                all: { active: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
                free: { active: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
                paid: { active: "#d97706", bg: "#fffbeb", border: "#fde68a" },
              };
              const c = colors[f];
              const isActive = filter === f;
              return (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: "999px",
                    border: `1.5px solid ${isActive ? c.active : c.border}`,
                    background: isActive ? c.active : c.bg,
                    color: isActive ? "white" : c.active,
                    fontWeight: "600",
                    fontSize: "12px",
                    cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                >
                  {labels[f]}
                  {spots.length > 0 && (
                    <span style={{
                      marginLeft: "5px",
                      background: isActive ? "rgba(255,255,255,0.25)" : c.active + "20",
                      color: isActive ? "white" : c.active,
                      borderRadius: "999px",
                      padding: "0 6px",
                      fontSize: "11px",
                    }}>
                      {f === "all" ? spots.length : spots.filter((s) => s.fee === f).length}
                    </span>
                  )}
                </button>
              );
            })}

            {spots.length > 0 && (
              <span style={{ marginLeft: "auto", fontSize: "12px", color: "#64748b" }}>
                {filteredCount} mostrati
              </span>
            )}
          </div>

          {(error || statusMsg) && (
            <div style={{
              padding: "8px 16px 10px",
              borderTop: "1px solid #f1f5f9",
              fontSize: "12px",
              color: error ? "#dc2626" : "#64748b",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}>
              {error ? "⚠️ " : "ℹ️ "}{error || statusMsg}
            </div>
          )}
        </div>

        <div style={{ marginTop: "8px", textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.7)", textShadow: "0 1px 3px rgba(0,0,0,0.3)" }}>
          Clicca sulla mappa per cercare parcheggi in qualsiasi punto
        </div>
      </div>

      <div style={{ flex: 1 }}>
        <ParkingMap
          center={center}
          spots={spots}
          filter={filter}
          onMapClick={handleMapClick}
        />
      </div>

      <div style={{
        position: "absolute",
        bottom: "24px",
        right: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        zIndex: 1000,
      }}>
        {[
          { color: "#16a34a", label: "Gratuito" },
          { color: "#d97706", label: "A pagamento" },
          { color: "#64748b", label: "Non specificato" },
        ].map(({ color, label }) => (
          <div key={label} style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            background: "rgba(255,255,255,0.95)",
            borderRadius: "8px",
            padding: "4px 10px 4px 8px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.12)",
          }}>
            <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: color }} />
            <span style={{ fontSize: "11px", fontWeight: "500", color: "#374151" }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
