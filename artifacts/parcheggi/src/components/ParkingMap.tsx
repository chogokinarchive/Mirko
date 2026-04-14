import { useEffect, useRef, useState, useCallback } from "react";
import L from "leaflet";
import { ParkingSpot } from "@/lib/overpass";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const FREE_ICON = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;background:#16a34a;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -30],
});

const PAID_ICON = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;background:#d97706;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -30],
});

const UNKNOWN_ICON = L.divIcon({
  className: "",
  html: `<div style="width:28px;height:28px;background:#64748b;border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"></div>`,
  iconSize: [28, 28],
  iconAnchor: [14, 28],
  popupAnchor: [0, -30],
});

const CENTER_ICON = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(59,130,246,0.6)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function feeLabel(fee: "free" | "paid" | "unknown") {
  if (fee === "free") return ["Gratuito", "tag-free"];
  if (fee === "paid") return ["A pagamento", "tag-paid"];
  return ["Info non disponibile", "tag-unknown"];
}

function buildPopup(spot: ParkingSpot) {
  const [label, cls] = feeLabel(spot.fee);
  const details = [
    spot.capacity ? `<div class="detail">Capacità: <span>${spot.capacity} posti</span></div>` : "",
    spot.access && spot.access !== "yes" ? `<div class="detail">Accesso: <span>${spot.access}</span></div>` : "",
    spot.surface ? `<div class="detail">Superficie: <span>${spot.surface}</span></div>` : "",
    spot.maxstay ? `<div class="detail">Tempo max: <span>${spot.maxstay}</span></div>` : "",
    spot.operator ? `<div class="detail">Gestore: <span>${spot.operator}</span></div>` : "",
  ].join("");

  return `
    <div class="parking-popup">
      <h3>${spot.name}</h3>
      <span class="tag ${cls}">${label}</span>
      ${details || '<div class="detail">Nessuna informazione aggiuntiva</div>'}
    </div>
  `;
}

interface ParkingMapProps {
  center: { lat: number; lng: number } | null;
  spots: ParkingSpot[];
  filter: "all" | "free" | "paid";
  onMapClick: (lat: number, lng: number) => void;
}

export function ParkingMap({ center, spots, filter, onMapClick }: ParkingMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const initializedRef = useRef(false);

  const handleMapClick = useCallback(
    (e: L.LeafletMouseEvent) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
    [onMapClick]
  );

  useEffect(() => {
    if (initializedRef.current || !containerRef.current) return;
    initializedRef.current = true;

    const map = L.map(containerRef.current, {
      center: [41.9028, 12.4964],
      zoom: 13,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    map.on("click", handleMapClick);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      initializedRef.current = false;
    };
  }, [handleMapClick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !center) return;

    map.setView([center.lat, center.lng], 15, { animate: true });

    if (centerMarkerRef.current) {
      centerMarkerRef.current.remove();
    }
    if (circleRef.current) {
      circleRef.current.remove();
    }

    centerMarkerRef.current = L.marker([center.lat, center.lng], { icon: CENTER_ICON })
      .addTo(map)
      .bindTooltip("Posizione cercata", { permanent: false });

    circleRef.current = L.circle([center.lat, center.lng], {
      radius: 1000,
      color: "#3b82f6",
      fillColor: "#3b82f6",
      fillOpacity: 0.05,
      weight: 1.5,
      dashArray: "6 4",
    }).addTo(map);
  }, [center]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    const filtered = spots.filter((s) => {
      if (filter === "all") return true;
      if (filter === "free") return s.fee === "free";
      if (filter === "paid") return s.fee === "paid";
      return true;
    });

    for (const spot of filtered) {
      const icon =
        spot.fee === "free" ? FREE_ICON : spot.fee === "paid" ? PAID_ICON : UNKNOWN_ICON;
      const marker = L.marker([spot.lat, spot.lng], { icon })
        .addTo(map)
        .bindPopup(buildPopup(spot), { maxWidth: 280 });
      markersRef.current.push(marker);
    }
  }, [spots, filter]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
