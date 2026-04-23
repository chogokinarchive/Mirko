import { useEffect, useRef, useCallback } from "react";
import L from "leaflet";
import { ParkingSpot } from "@/lib/overpass";

delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const CENTER_ICON = L.divIcon({
  className: "",
  html: `<div style="width:20px;height:20px;background:#3b82f6;border-radius:50%;border:3px solid white;box-shadow:0 2px 10px rgba(59,130,246,0.6)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function availBadge(available: "open" | "closed" | "unknown"): string {
  if (available === "open")
    return `<div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;background:#22c55e;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`;
  if (available === "closed")
    return `<div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;background:#ef4444;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div>`;
  return "";
}

function makeIcon(fee: "free" | "paid" | "unknown", available: "open" | "closed" | "unknown", disabled: boolean): L.DivIcon {
  const color = disabled ? "#2563eb" : fee === "free" ? "#16a34a" : fee === "paid" ? "#d97706" : "#64748b";
  const badge = availBadge(available);
  const disabledBadge = disabled
    ? `<div style="position:absolute;bottom:-4px;left:-4px;width:14px;height:14px;background:#2563eb;border-radius:50%;border:2px solid white;display:flex;align-items:center;justify-content:center;font-size:8px;line-height:1">♿</div>`
    : "";
  return L.divIcon({
    className: "",
    html: `<div style="position:relative;width:32px;height:32px;cursor:pointer">
      <div style="width:28px;height:28px;background:${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);position:absolute;top:2px;left:2px"></div>
      ${badge}${disabledBadge}
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -34],
  });
}

interface ParkingMapProps {
  center: { lat: number; lng: number } | null;
  spots: ParkingSpot[];
  filter: "all" | "free" | "paid";
  onMapClick: (lat: number, lng: number) => void;
  onSpotSelect: (spot: ParkingSpot) => void;
}

export function ParkingMap({ center, spots, filter, onMapClick, onSpotSelect }: ParkingMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const centerMarkerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);
  const initializedRef = useRef(false);
  const onSpotSelectRef = useRef(onSpotSelect);
  onSpotSelectRef.current = onSpotSelect;

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

    if (centerMarkerRef.current) centerMarkerRef.current.remove();
    if (circleRef.current) circleRef.current.remove();

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
      const icon = makeIcon(spot.fee, spot.available, spot.disabled);
      const marker = L.marker([spot.lat, spot.lng], { icon })
        .addTo(map)
        .bindTooltip(spot.name, { permanent: false, direction: "top", offset: [0, -30] });

      marker.on("click", (e) => {
        L.DomEvent.stopPropagation(e);
        onSpotSelectRef.current(spot);
      });

      markersRef.current.push(marker);
    }
  }, [spots, filter]);

  return <div ref={containerRef} style={{ height: "100%", width: "100%" }} />;
}
