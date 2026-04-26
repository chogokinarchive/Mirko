// ─── Tipi ────────────────────────────────────────────────────────────────────

export interface ParkingSpot {
  id: string;
  lat: number;
  lng: number;
  name: string;
  fee: "free" | "paid" | "unknown";
  available: "open" | "closed" | "unknown";
  disabled: boolean;
  capacity?: string;
  capacity_disabled?: string;
  access?: string;
  surface?: string;
  maxstay?: string;
  operator?: string;
  opening_hours?: string;
  type: "node" | "way" | "relation";
}

export interface GeoSuggestion {
  display: string;
  lat: number;
  lng: number;
}

const GEOAPIFY_KEY = "543797f65b60459b8ad368a0e4753783";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DAYS: Record<string, number> = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0 };

function parseTime(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

function dayRange(from: string, to: string): number[] {
  const start = DAYS[from], end = DAYS[to];
  if (start === undefined || end === undefined) return [];
  const days: number[] = [];
  let cur = start;
  while (cur !== end) { days.push(cur); cur = (cur + 1) % 7; }
  days.push(end);
  return days;
}

export function parseOpeningHours(oh: string): "open" | "closed" | "unknown" {
  if (!oh) return "unknown";
  const raw = oh.trim().toLowerCase();
  if (raw === "24/7" || raw === "00:00-24:00" || raw === "always") return "open";
  if (raw === "closed" || raw === "off") return "closed";

  const now = new Date();
  const nowDay = now.getDay();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  for (const rule of oh.split(";").map(r => r.trim())) {
    const m = rule.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})(?:\s+off)?/);
    if (m) {
      const days = m[2] ? dayRange(m[1], m[2]) : [DAYS[m[1]]];
      if (!days.includes(nowDay)) continue;
      const start = parseTime(m[3]), end = parseTime(m[4]);
      if (nowMin >= start && nowMin < end) return m[0].includes(" off") ? "closed" : "open";
      continue;
    }
    const t = rule.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (t && nowMin >= parseTime(t[1]) && nowMin < parseTime(t[2])) return "open";
  }
  return "unknown";
}

// ─── Ricerca Parcheggi (Geoapify Places API) ─────────────────────────────────

export async function searchParkings(
  lat: number,
  lng: number,
  radiusMeters: number = 1000
): Promise<ParkingSpot[]> {
  const url = `https://api.geoapify.com/v2/places?categories=parking&filter=circle:${lng},${lat},${radiusMeters}&limit=100&apiKey=${GEOAPIFY_KEY}`;

  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("Errore nel recupero dei dati. Riprova.");

  const data = await response.json();
  const spots: ParkingSpot[] = [];

  for (const feature of data.features || []) {
    const p = feature.properties || {};
    const coords = feature.geometry?.coordinates;
    if (!coords) continue;

    const elLng = coords[0];
    const elLat = coords[1];

    const oh = p.opening_hours || p["opening_hours"] || "";
    const access = p.access || "";
    let available: "open" | "closed" | "unknown" = parseOpeningHours(oh);
    if (access === "private" || access === "no") available = "closed";

    const feeRaw = p.fee || p["fee"] || "";
    let fee: "free" | "paid" | "unknown" = "unknown";
    if (feeRaw === "no" || feeRaw === "free" || feeRaw === "0") fee = "free";
    else if (feeRaw === "yes" || feeRaw === "paid") fee = "paid";

    const capDisabled = p["capacity:disabled"] || p["capacity:handicapped"] || "";
    const disabled =
      access === "disabled" ||
      p.wheelchair === "yes" || p.wheelchair === "designated" ||
      (capDisabled !== "" && capDisabled !== "0");

    const name = p.name || p.operator || p.brand ||
      `Parcheggio #${String(p.place_id || Math.random()).slice(-4)}`;

    spots.push({
      id: p.place_id || `geo_${elLat}_${elLng}`,
      lat: elLat,
      lng: elLng,
      name,
      fee,
      available,
      disabled,
      capacity: p.capacity ? String(p.capacity) : undefined,
      capacity_disabled: capDisabled || undefined,
      access,
      surface: p.surface,
      maxstay: p.maxstay,
      operator: p.operator,
      opening_hours: oh || undefined,
      type: "node",
    });
  }

  return spots;
}

// ─── Geocodifica (Geoapify Geocoding API) ────────────────────────────────────

export async function fetchSuggestions(query: string): Promise<GeoSuggestion[]> {
  if (query.trim().length < 3) return [];
  try {
    const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(query)}&lang=it&limit=5&apiKey=${GEOAPIFY_KEY}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return [];
    const data = await r.json();
    return (data.features || []).map((f: { geometry: { coordinates: [number, number] }; properties: { formatted: string } }) => ({
      display: f.properties.formatted,
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    }));
  } catch { return []; }
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(address)}&lang=it&limit=1&apiKey=${GEOAPIFY_KEY}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("Servizio di ricerca non disponibile. Riprova.");
  const data = await r.json();
  if (!data.features?.length) return null;
  const f = data.features[0];
  return {
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    display: f.properties.formatted,
  };
}
