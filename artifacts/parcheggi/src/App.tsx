import { useState, useCallback, useEffect, useRef } from "react";
import { ParkingMap } from "@/components/ParkingMap";
import { SpotDetailPanel } from "@/components/SpotDetailPanel";
import { searchParkings, geocodeAddress, fetchSuggestions, GeoSuggestion, ParkingSpot } from "@/lib/overpass";
import { useGeolocation } from "@/hooks/useGeolocation";

type Filter = "all" | "free" | "paid";

const SESSION_KEY = "parcheggi_state";

function loadSession() {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSession(data: object) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function LoadingSpinner() {
  return (
    <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

export default function App() {
  const saved = loadSession();

  const [query, setQuery] = useState<string>(saved?.query ?? "");
  const [filter, setFilter] = useState<Filter>(saved?.filter ?? "all");
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(saved?.center ?? null);
  const [spots, setSpots] = useState<ParkingSpot[]>(saved?.spots ?? []);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(saved?.statusMsg ?? null);
  const [collapsed, setCollapsed] = useState<boolean>(saved?.collapsed ?? false);
  const [searchLabel, setSearchLabel] = useState<string>(saved?.searchLabel ?? "");
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [recentAddresses, setRecentAddresses] = useState<string[]>(() => {
    try { return JSON.parse(sessionStorage.getItem("recent_addresses") || "[]"); } catch { return []; }
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    saveSession({ query, filter, center, spots, statusMsg, collapsed, searchLabel });
  }, [query, filter, center, spots, statusMsg, collapsed, searchLabel]);

  const { getPosition, loading: geoLoading } = useGeolocation();

  // Debounced autocomplete
  useEffect(() => {
    if (query.trim().length < 3) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      const results = await fetchSuggestions(query);
      setSuggestions(results);
      if (results.length > 0) setShowSuggestions(true);
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
          inputRef.current && !inputRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function addToHistory(address: string) {
    const updated = [address, ...recentAddresses.filter(a => a !== address)].slice(0, 5);
    setRecentAddresses(updated);
    try { sessionStorage.setItem("recent_addresses", JSON.stringify(updated)); } catch { /* ignore */ }
  }

  const doSearch = useCallback(async (lat: number, lng: number, label?: string) => {
    setLoading(true);
    setError(null);
    setSpots([]);
    setCenter({ lat, lng });
    const loc = label
      ? label.split(",")[0].trim()
      : `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    setSearchLabel(loc);
    setStatusMsg("Ricerca parcheggi...");
    try {
      const results = await searchParkings(lat, lng, 1000);
      setSpots(results);
      setStatusMsg(
        results.length === 0
          ? "Nessun parcheggio trovato nel raggio di 1 km."
          : `${results.length} parcheggi trovati nel raggio di 1 km.`
      );
      if (results.length >= 0) setCollapsed(true);
    } catch {
      setError("Errore nel recupero dei dati. Riprova.");
      setStatusMsg(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleAddressSearch = useCallback(async (overrideGeo?: GeoSuggestion) => {
    setShowSuggestions(false);
    if (overrideGeo) {
      addToHistory(overrideGeo.display);
      setQuery(overrideGeo.display);
      await doSearch(overrideGeo.lat, overrideGeo.lng, overrideGeo.display);
      return;
    }
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
      addToHistory(q);
      await doSearch(geo.lat, geo.lng, geo.display);
    } catch {
      setError("Errore nella ricerca dell'indirizzo.");
      setStatusMsg(null);
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, doSearch, recentAddresses]);

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

  const handleSpotSelect = useCallback((spot: ParkingSpot) => {
    setSelectedSpot(spot);
  }, []);

  const filteredSpots = spots.filter((s) => {
    if (filter === "all") return true;
    if (filter === "free") return s.fee === "free";
    if (filter === "paid") return s.fee === "paid";
    return true;
  });

  const isLoading = loading || geoLoading;

  const freeCount = spots.filter((s) => s.fee === "free").length;
  const paidCount = spots.filter((s) => s.fee === "paid").length;
  const openCount = spots.filter((s) => s.available === "open").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", position: "relative" }}>

      {collapsed ? (
        <div
          className="search-panel"
          style={{ width: "auto", left: "16px", right: "16px", transform: "none" }}
        >
          <div style={{
            background: "white",
            borderRadius: "14px",
            boxShadow: "0 4px 20px rgba(0,0,0,0.13), 0 1px 4px rgba(0,0,0,0.07)",
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: "10px",
          }}>
            <span style={{ fontSize: "18px" }}>🅿️</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: "700", fontSize: "13px", color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {searchLabel || "Posizione"}
              </div>
              <div style={{ fontSize: "11px", color: "#64748b", marginTop: "1px" }}>
                {filteredSpots.length} parcheggi
                {openCount > 0 && <span style={{ color: "#16a34a", marginLeft: "6px" }}>● {openCount} aperti</span>}
              </div>
            </div>

            <div style={{ display: "flex", gap: "4px" }}>
              {(["all", "free", "paid"] as Filter[]).map((f) => {
                const labels = { all: "Tutti", free: "Gratis", paid: "Pagamento" };
                const colors = {
                  all: { active: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
                  free: { active: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
                  paid: { active: "#d97706", bg: "#fffbeb", border: "#fde68a" },
                };
                const c = colors[f];
                const isActive = filter === f;
                const count = f === "all" ? spots.length : f === "free" ? freeCount : paidCount;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "4px 8px",
                      borderRadius: "999px",
                      border: `1.5px solid ${isActive ? c.active : c.border}`,
                      background: isActive ? c.active : c.bg,
                      color: isActive ? "white" : c.active,
                      fontWeight: "600",
                      fontSize: "11px",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {labels[f]} {count}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => setCollapsed(false)}
              title="Apri pannello di ricerca"
              style={{
                padding: "6px 8px",
                borderRadius: "10px",
                background: "#f1f5f9",
                border: "1.5px solid #e2e8f0",
                color: "#475569",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
              </svg>
            </button>
          </div>
        </div>
      ) : (
        <div className="search-panel">
          <div style={{
            background: "white",
            borderRadius: "16px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.12), 0 1px 4px rgba(0,0,0,0.08)",
            overflow: "hidden",
          }}>
            <div style={{ padding: "14px 16px 12px", borderBottom: "1px solid #f1f5f9" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                <span style={{ fontSize: "20px" }}>🅿️</span>
                <span style={{ fontWeight: "700", fontSize: "15px", color: "#1e293b" }}>Trova Parcheggi</span>
                {spots.length > 0 && (
                  <button
                    onClick={() => setCollapsed(true)}
                    style={{
                      marginLeft: "auto",
                      padding: "3px 8px",
                      borderRadius: "8px",
                      background: "#f1f5f9",
                      border: "1px solid #e2e8f0",
                      color: "#64748b",
                      fontSize: "11px",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="m18 15-6-6-6 6"/>
                    </svg>
                    Comprimi
                  </button>
                )}
              </div>
              <div style={{ display: "flex", gap: "6px", alignItems: "flex-start" }}>
                <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setShowSuggestions(true); }}
                    onFocus={() => { if (query.trim().length < 3 && recentAddresses.length > 0) setShowSuggestions(true); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddressSearch();
                      if (e.key === "Escape") setShowSuggestions(false);
                    }}
                    placeholder="Indirizzo o città..."
                    style={{
                      width: "100%",
                      padding: "9px 10px",
                      borderRadius: "10px",
                      border: "1.5px solid #e2e8f0",
                      fontSize: "14px",
                      outline: "none",
                      color: "#1e293b",
                      transition: "border-color 0.15s",
                      boxSizing: "border-box",
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = "#3b82f6";
                      if (query.trim().length < 3 && recentAddresses.length > 0) setShowSuggestions(true);
                    }}
                    onBlur={(e) => e.target.style.borderColor = "#e2e8f0"}
                  />
                  {/* Dropdown autocomplete / storico */}
                  {showSuggestions && (() => {
                    const isHistoryMode = query.trim().length < 3;
                    const items = isHistoryMode
                      ? recentAddresses.map(addr => ({ label: addr, isHistory: true as const }))
                      : suggestions.map(s => {
                          const parts = s.display.split(", ");
                          return { label: parts[0], sublabel: parts.slice(1).join(", "), geo: s, isHistory: false as const };
                        });
                    if (items.length === 0) return null;
                    return (
                      <div ref={dropdownRef} style={{
                        position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0,
                        background: "white", border: "1.5px solid #3b82f6",
                        borderRadius: "10px", zIndex: 9999,
                        boxShadow: "0 8px 20px rgba(0,0,0,0.13)", overflow: "hidden",
                      }}>
                        {isHistoryMode && (
                          <div style={{ padding: "6px 12px 4px", fontSize: "10px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                            Ricerche recenti
                          </div>
                        )}
                        {items.map((item, i) => (
                          <div key={i}
                            onMouseDown={(e) => {
                              e.preventDefault();
                              if (!item.isHistory && item.geo) {
                                handleAddressSearch(item.geo);
                              } else {
                                setQuery(item.label);
                                setShowSuggestions(false);
                                setTimeout(() => handleAddressSearch(), 0);
                              }
                            }}
                            style={{
                              padding: "9px 12px", cursor: "pointer",
                              borderTop: i > 0 || isHistoryMode ? "1px solid #f1f5f9" : "none",
                              display: "flex", alignItems: "center", gap: "8px",
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f0f7ff")}
                            onMouseLeave={e => (e.currentTarget.style.background = "white")}
                          >
                            <span style={{ fontSize: "13px", flexShrink: 0 }}>
                              {item.isHistory ? "🕐" : "📍"}
                            </span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: "13px", fontWeight: "600", color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {item.label}
                              </div>
                              {!item.isHistory && "sublabel" in item && item.sublabel && (
                                <div style={{ fontSize: "11px", color: "#94a3b8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {item.sublabel}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <button
                  onClick={handleAddressSearch}
                  disabled={isLoading || !query.trim()}
                  title="Cerca"
                  style={{
                    padding: "9px 12px",
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
                    flexShrink: 0,
                  }}
                >
                  {isLoading ? <LoadingSpinner /> : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>
                    </svg>
                  )}
                </button>
                <button
                  onClick={handleGPS}
                  disabled={isLoading}
                  title="Usa la mia posizione GPS"
                  style={{
                    padding: "9px 11px",
                    borderRadius: "10px",
                    background: isLoading ? "#f1f5f9" : "#eff6ff",
                    color: "#2563eb",
                    border: "1.5px solid #bfdbfe",
                    cursor: isLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    flexShrink: 0,
                    opacity: isLoading ? 0.6 : 1,
                  }}
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="12" cy="12" r="3"/>
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>
                  </svg>
                </button>
              </div>
            </div>

            <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
              <span style={{ fontSize: "11px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Filtro:</span>
              {(["all", "free", "paid"] as Filter[]).map((f) => {
                const labels = { all: "Tutti", free: "Gratuiti", paid: "A pagamento" };
                const colors = {
                  all: { active: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
                  free: { active: "#16a34a", bg: "#f0fdf4", border: "#bbf7d0" },
                  paid: { active: "#d97706", bg: "#fffbeb", border: "#fde68a" },
                };
                const c = colors[f];
                const isActive = filter === f;
                const count = f === "all" ? spots.length : f === "free" ? freeCount : paidCount;
                return (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    style={{
                      padding: "5px 10px",
                      borderRadius: "999px",
                      border: `1.5px solid ${isActive ? c.active : c.border}`,
                      background: isActive ? c.active : c.bg,
                      color: isActive ? "white" : c.active,
                      fontWeight: "600",
                      fontSize: "12px",
                      cursor: "pointer",
                      transition: "all 0.15s",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {labels[f]}
                    {spots.length > 0 && (
                      <span style={{
                        background: isActive ? "rgba(255,255,255,0.25)" : c.active + "20",
                        color: isActive ? "white" : c.active,
                        borderRadius: "999px",
                        padding: "0 5px",
                        fontSize: "11px",
                      }}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
              {filteredSpots.length > 0 && (
                <span style={{ marginLeft: "auto", fontSize: "11px", color: "#64748b" }}>
                  {filteredSpots.length} mostrati
                </span>
              )}
            </div>

            {(error || statusMsg) && (
              <div style={{
                padding: "7px 16px 9px",
                borderTop: "1px solid #f1f5f9",
                fontSize: "12px",
                color: error ? "#dc2626" : "#64748b",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}>
                {error ? "⚠️" : "ℹ️"} {error || statusMsg}
              </div>
            )}
          </div>

          {!spots.length && (
            <div style={{ marginTop: "8px", textAlign: "center", fontSize: "11px", color: "rgba(255,255,255,0.75)", textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>
              Clicca sulla mappa per cercare parcheggi in qualsiasi punto
            </div>
          )}
        </div>
      )}

      <div style={{ flex: 1 }}>
        <ParkingMap
          center={center}
          spots={spots}
          filter={filter}
          onMapClick={handleMapClick}
          onSpotSelect={handleSpotSelect}
        />
      </div>

      <SpotDetailPanel
        spot={selectedSpot}
        onClose={() => setSelectedSpot(null)}
      />

      <div style={{
        position: "absolute",
        bottom: "24px",
        right: "16px",
        display: "flex",
        flexDirection: "column",
        gap: "4px",
        zIndex: 1000,
      }}>
        <div style={{
          background: "rgba(255,255,255,0.97)",
          borderRadius: "10px",
          padding: "8px 12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        }}>
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>Legenda</div>
          {[
            { color: "#16a34a", label: "Gratuito" },
            { color: "#d97706", label: "A pagamento" },
            { color: "#64748b", label: "Non specificato" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
              <div style={{ width: "10px", height: "10px", borderRadius: "50%", background: color, flexShrink: 0 }} />
              <span style={{ fontSize: "11px", color: "#374151" }}>{label}</span>
            </div>
          ))}
          <div style={{ height: "1px", background: "#f1f5f9", margin: "6px 0" }} />
          <div style={{ fontSize: "10px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "5px" }}>Disponibilità</div>
          {[
            { color: "#22c55e", label: "Aperto ora" },
            { color: "#ef4444", label: "Chiuso" },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "4px" }}>
              <div style={{
                position: "relative", width: "14px", height: "14px", flexShrink: 0,
              }}>
                <div style={{ width: "10px", height: "10px", background: "#64748b", borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", position: "absolute", top: 2, left: 2 }} />
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: color, border: "1.5px solid white", position: "absolute", top: -1, right: -1 }} />
              </div>
              <span style={{ fontSize: "11px", color: "#374151" }}>{label}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: "7px", marginBottom: "0px" }}>
            <div style={{ width: "10px", height: "10px", background: "#64748b", borderRadius: "50% 50% 50% 0", transform: "rotate(-45deg)", flexShrink: 0 }} />
            <span style={{ fontSize: "11px", color: "#374151" }}>Orari sconosciuti</span>
          </div>
        </div>
      </div>
    </div>
  );
}
