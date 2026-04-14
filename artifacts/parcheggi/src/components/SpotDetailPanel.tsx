import { useState, useEffect, useRef } from "react";
import L from "leaflet";
import { ParkingSpot } from "@/lib/overpass";
import { estimateOccupancy } from "@/lib/occupancy";

interface Props {
  spot: ParkingSpot | null;
  onClose: () => void;
}

function Tag({ label, cls }: { label: string; cls: string }) {
  const styles: Record<string, { bg: string; color: string }> = {
    "tag-free": { bg: "#dcfce7", color: "#15803d" },
    "tag-paid": { bg: "#fef3c7", color: "#b45309" },
    "tag-unknown": { bg: "#f1f5f9", color: "#475569" },
    "tag-open": { bg: "#dcfce7", color: "#15803d" },
    "tag-closed": { bg: "#fee2e2", color: "#b91c1c" },
  };
  const s = styles[cls] || styles["tag-unknown"];
  return (
    <span style={{
      display: "inline-block",
      padding: "3px 10px",
      borderRadius: "999px",
      fontSize: "11px",
      fontWeight: "700",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      background: s.bg,
      color: s.color,
    }}>
      {label}
    </span>
  );
}

function OccupancyMeter({ spot }: { spot: ParkingSpot }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const occ = estimateOccupancy(spot);

  return (
    <div style={{ marginTop: "4px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "6px" }}>
        <span style={{ fontSize: "12px", fontWeight: "700", color: "#374151", textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Stima occupazione
        </span>
        <span style={{ fontSize: "11px", color: "#94a3b8", fontStyle: "italic" }}>
          {occ.confidence === "medium" ? "stima media" : "stima approssimativa"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
        <div style={{ flex: 1, height: "10px", background: "#f1f5f9", borderRadius: "999px", overflow: "hidden" }}>
          <div style={{
            height: "100%",
            width: `${occ.percent}%`,
            background: `linear-gradient(90deg, ${occ.color}99, ${occ.color})`,
            borderRadius: "999px",
            transition: "width 0.6s ease",
          }} />
        </div>
        <span style={{ fontSize: "18px", fontWeight: "800", color: occ.color, minWidth: "44px", textAlign: "right" }}>
          {occ.percent}%
        </span>
      </div>

      <div style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "4px 10px",
        borderRadius: "8px",
        background: occ.color + "18",
        marginBottom: "8px",
      }}>
        <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: occ.color }} />
        <span style={{ fontSize: "12px", fontWeight: "700", color: occ.color }}>{occ.label}</span>
      </div>

      <button
        onClick={() => setShowBreakdown(!showBreakdown)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 10px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: "8px",
          cursor: "pointer",
          fontSize: "11px",
          color: "#64748b",
          fontWeight: "500",
        }}
      >
        <span>Dettagli calcolo statistico</span>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
          style={{ transform: showBreakdown ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {showBreakdown && (
        <div style={{ marginTop: "6px", borderRadius: "8px", border: "1px solid #e2e8f0", overflow: "hidden" }}>
          {occ.breakdown.map((item, i) => (
            <div key={i} style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "6px 10px",
              background: i % 2 === 0 ? "#f8fafc" : "white",
              borderBottom: i < occ.breakdown.length - 1 ? "1px solid #f1f5f9" : "none",
            }}>
              <div>
                <div style={{ fontSize: "10px", fontWeight: "600", color: "#94a3b8", textTransform: "uppercase" }}>{item.label}</div>
                <div style={{ fontSize: "11px", color: "#475569" }}>{item.value}</div>
              </div>
              <span style={{
                fontSize: "11px",
                fontWeight: "700",
                color: item.delta > 0 ? "#dc2626" : item.delta < 0 ? "#16a34a" : "#64748b",
                padding: "2px 6px",
                borderRadius: "6px",
                background: item.delta > 0 ? "#fee2e2" : item.delta < 0 ? "#dcfce7" : "#f1f5f9",
              }}>
                {item.delta > 0 ? `+${item.delta}%` : item.delta < 0 ? `${item.delta}%` : "="}
              </span>
            </div>
          ))}
          <div style={{ padding: "6px 10px", background: "#eff6ff", display: "flex", justifyContent: "space-between" }}>
            <span style={{ fontSize: "11px", fontWeight: "700", color: "#1e40af" }}>Stima finale</span>
            <span style={{ fontSize: "12px", fontWeight: "800", color: occ.color }}>{occ.percent}%</span>
          </div>
        </div>
      )}

      <p style={{ fontSize: "10px", color: "#94a3b8", marginTop: "6px", lineHeight: "1.4" }}>
        ⚠️ Stima statistica basata su orario, giorno e tipologia. Non riflette l'occupazione in tempo reale.
      </p>
    </div>
  );
}

function MiniMap({ spot }: { spot: ParkingSpot }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    if (mapRef.current) {
      mapRef.current.remove();
      mapRef.current = null;
    }

    const map = L.map(containerRef.current, {
      center: [spot.lat, spot.lng],
      zoom: 17,
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const color = spot.fee === "free" ? "#16a34a" : spot.fee === "paid" ? "#d97706" : "#64748b";
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:28px;height:28px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 28],
    });

    L.marker([spot.lat, spot.lng], { icon }).addTo(map);

    L.circle([spot.lat, spot.lng], {
      radius: 30,
      color,
      fillColor: color,
      fillOpacity: 0.12,
      weight: 1.5,
    }).addTo(map);

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [spot.lat, spot.lng, spot.fee]);

  return (
    <div style={{ borderRadius: "10px", overflow: "hidden", border: "1px solid #e2e8f0" }}>
      <div style={{
        padding: "5px 10px",
        background: "#f8fafc",
        fontSize: "10px",
        color: "#64748b",
        fontWeight: "600",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "1px solid #e2e8f0",
      }}>
        <span>📍 Posizione sulla mappa</span>
        <span style={{ fontFamily: "monospace", color: "#94a3b8" }}>{spot.lat.toFixed(4)}, {spot.lng.toFixed(4)}</span>
      </div>
      <div ref={containerRef} style={{ height: "200px", width: "100%" }} />
    </div>
  );
}

function StreetViewSection({ spot }: { spot: ParkingSpot }) {
  const [showMini, setShowMini] = useState(false);

  const googleSVUrl = `https://maps.google.com/maps?layer=c&cbll=${spot.lat},${spot.lng}&cbp=12,0,0,0,0&z=17`;
  const mapillaryExtUrl = `https://www.mapillary.com/app/?lat=${spot.lat}&lng=${spot.lng}&z=18`;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", marginBottom: "8px" }}>
        <button
          onClick={() => setShowMini(!showMini)}
          style={{
            padding: "9px 10px",
            borderRadius: "10px",
            background: showMini ? "#1e40af" : "#2563eb",
            color: "white",
            border: "none",
            fontWeight: "600",
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M9 21V9"/>
          </svg>
          {showMini ? "Nascondi mappa" : "Vedi mappa"}
        </button>

        <a
          href={googleSVUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            padding: "9px 10px",
            borderRadius: "10px",
            background: "#f0fdf4",
            color: "#15803d",
            border: "1.5px solid #bbf7d0",
            fontWeight: "600",
            fontSize: "12px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "5px",
            textDecoration: "none",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          Google Street View
        </a>
      </div>

      <a
        href={mapillaryExtUrl}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "6px",
          padding: "8px",
          borderRadius: "10px",
          background: "#fefce8",
          color: "#854d0e",
          border: "1.5px solid #fde68a",
          fontWeight: "600",
          fontSize: "12px",
          textDecoration: "none",
          marginBottom: "10px",
          boxSizing: "border-box",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
          <path d="M2 12h20"/>
        </svg>
        Apri foto di strada su Mapillary ↗
      </a>

      {showMini && <MiniMap spot={spot} />}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: "1px solid #f1f5f9" }}>
      <span style={{ fontSize: "12px", color: "#64748b" }}>{label}</span>
      <span style={{ fontSize: "12px", fontWeight: "600", color: "#1e293b", textAlign: "right", maxWidth: "60%", wordBreak: "break-word" }}>{value}</span>
    </div>
  );
}

export function SpotDetailPanel({ spot, onClose }: Props) {
  if (!spot) return null;

  const feeInfo = spot.fee === "free" ? ["Gratuito", "tag-free"] : spot.fee === "paid" ? ["A pagamento", "tag-paid"] : ["Non specificato", "tag-unknown"];
  const availInfo = spot.available === "open" ? ["Aperto ora", "tag-open"] : spot.available === "closed" ? ["Chiuso", "tag-closed"] : null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1500,
          background: "rgba(0,0,0,0.15)",
          backdropFilter: "blur(1px)",
        }}
      />
      <div style={{
        position: "fixed",
        top: 0,
        right: 0,
        bottom: 0,
        width: "min(380px, 100vw)",
        background: "white",
        zIndex: 1600,
        overflowY: "auto",
        boxShadow: "-4px 0 24px rgba(0,0,0,0.15)",
        display: "flex",
        flexDirection: "column",
      }}>
        <div style={{ padding: "16px 16px 12px", borderBottom: "1px solid #f1f5f9", position: "sticky", top: 0, background: "white", zIndex: 10 }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "6px" }}>
                <Tag label={feeInfo[0]} cls={feeInfo[1]} />
                {availInfo && <Tag label={availInfo[0]} cls={availInfo[1]} />}
              </div>
              <h2 style={{ fontSize: "16px", fontWeight: "800", color: "#0f172a", lineHeight: "1.3", wordBreak: "break-word" }}>{spot.name}</h2>
              <p style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px" }}>
                {spot.lat.toFixed(5)}, {spot.lng.toFixed(5)}
              </p>
            </div>
            <button
              onClick={onClose}
              style={{
                padding: "6px",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                background: "#f8fafc",
                cursor: "pointer",
                color: "#64748b",
                display: "flex",
                flexShrink: 0,
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          </div>
        </div>

        <div style={{ padding: "14px 16px", flex: 1 }}>
          <section style={{ marginBottom: "18px" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>
              Informazioni
            </div>
            {spot.capacity && <DetailRow label="Capacità" value={`${spot.capacity} posti`} />}
            {spot.opening_hours && <DetailRow label="Orari" value={spot.opening_hours} />}
            {spot.operator && <DetailRow label="Gestore" value={spot.operator} />}
            {spot.surface && <DetailRow label="Superficie" value={spot.surface} />}
            {spot.maxstay && <DetailRow label="Sosta max" value={spot.maxstay} />}
            {spot.access && spot.access !== "yes" && spot.access !== "" && (
              <DetailRow label="Accesso" value={spot.access} />
            )}
            {!spot.capacity && !spot.operator && !spot.opening_hours && (
              <p style={{ fontSize: "12px", color: "#94a3b8", fontStyle: "italic" }}>
                Nessun dato aggiuntivo disponibile in OpenStreetMap.
              </p>
            )}
          </section>

          <div style={{ height: "1px", background: "#f1f5f9", marginBottom: "18px" }} />

          <section style={{ marginBottom: "18px" }}>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
              Occupazione stimata
            </div>
            <OccupancyMeter spot={spot} />
          </section>

          <div style={{ height: "1px", background: "#f1f5f9", marginBottom: "18px" }} />

          <section>
            <div style={{ fontSize: "11px", fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
              Visualizza il luogo
            </div>
            <StreetViewSection spot={spot} />
          </section>
        </div>
      </div>
    </>
  );
}
