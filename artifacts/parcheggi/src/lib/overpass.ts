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

// ─── Helpers interni ─────────────────────────────────────────────────────────

function parseFee(tags: Record<string, string>): "free" | "paid" | "unknown" {
  const fee = tags["fee"] || tags["parking:fee"];
  if (!fee) return "unknown";
  if (fee === "no" || fee === "free" || fee === "0") return "free";
  if (fee === "yes" || fee === "interval" || fee === "daily") return "paid";
  return "unknown";
}

function parseName(tags: Record<string, string>, id: string): string {
  return tags["name"] || tags["operator"] || tags["brand"] || `Parcheggio #${id.slice(-4)}`;
}

function parseDisabled(tags: Record<string, string>): boolean {
  if (tags["access"] === "disabled") return true;
  if (tags["parking"] === "disabled") return true;
  const cap = tags["capacity:disabled"] || tags["disabled:capacity"] || tags["capacity:handicapped"];
  if (cap && cap !== "0") return true;
  if (tags["wheelchair"] === "yes" || tags["wheelchair"] === "designated") return true;
  return false;
}

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

// ─── Overpass (tramite proxy Vercel /api/overpass) ───────────────────────────

export async function searchParkings(
  lat: number,
  lng: number,
  radiusMeters: number = 1000
): Promise<ParkingSpot[]> {
  const query = `
[out:json][timeout:7];
(
  node["amenity"="parking"](around:${radiusMeters},${lat},${lng});
  way["amenity"="parking"](around:${radiusMeters},${lat},${lng});
);
out center tags;
`;

  const response = await fetch("/api/overpass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: query }),
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || "Errore nel recupero dei dati. Riprova.");
  }

  const data = await response.json();
  const spots: ParkingSpot[] = [];

  for (const element of data.elements) {
    let elLat: number | undefined;
    let elLng: number | undefined;

    if (element.type === "node") {
      elLat = element.lat; elLng = element.lon;
    } else if (element.center) {
      elLat = element.center.lat; elLng = element.center.lon;
    }
    if (elLat === undefined || elLng === undefined) continue;

    const tags: Record<string, string> = element.tags || {};
    const oh = tags["opening_hours"] || tags["parking:opening_hours"] || "";
    const access = tags["access"] || "";
    let available: "open" | "closed" | "unknown" = parseOpeningHours(oh);
    if (access === "private" || access === "no") available = "closed";

    spots.push({
      id: `${element.type}_${element.id}`,
      lat: elLat, lng: elLng,
      name: parseName(tags, String(element.id)),
      fee: parseFee(tags),
      available,
      disabled: parseDisabled(tags),
      capacity: tags["capacity"],
      capacity_disabled: tags["capacity:disabled"] || tags["capacity:handicapped"] || undefined,
      access,
      surface: tags["surface"],
      maxstay: tags["maxstay"],
      operator: tags["operator"],
      opening_hours: oh || undefined,
      type: element.type,
    });
  }

  return spots;
}

// ─── Geocodifica (tramite proxy Vercel /api/geocode) ─────────────────────────

export async function fetchSuggestions(query: string): Promise<GeoSuggestion[]> {
  if (query.trim().length < 3) return [];
  try {
    const r = await fetch(`/api/geocode?q=${encodeURIComponent(query)}&limit=5`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return [];
    const data = await r.json();
    if (!data?.features?.length) return [];
    return data.features.map((f: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }) => {
      const [lng, lat] = f.geometry.coordinates;
      const p = f.properties;
      return { display: [p.name, p.street, p.city, p.country].filter(Boolean).join(", "), lat, lng };
    });
  } catch { return []; }
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  const r = await fetch(`/api/geocode?q=${encodeURIComponent(address)}&limit=1`, {
    signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("Servizio di ricerca non disponibile. Riprova.");
  const data = await r.json();
  if (!data?.features?.length) return null;
  const [lng, lat] = data.features[0].geometry.coordinates;
  const p = data.features[0].properties;
  return { lat, lng, display: [p.name, p.street, p.city, p.country].filter(Boolean).join(", ") };
}
