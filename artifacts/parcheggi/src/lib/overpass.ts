export interface ParkingSpot {
  id: string;
  lat: number;
  lng: number;
  name: string;
  fee: "free" | "paid" | "unknown";
  available: "open" | "closed" | "unknown";
  capacity?: string;
  access?: string;
  surface?: string;
  maxstay?: string;
  operator?: string;
  opening_hours?: string;
  type: "node" | "way" | "relation";
  disabled: boolean;
  capacity_disabled?: string;
}

function parseFee(tags: Record<string, string>): "free" | "paid" | "unknown" {
  const fee = tags["fee"] || tags["parking:fee"];
  if (!fee) return "unknown";
  if (fee === "no" || fee === "free" || fee === "0") return "free";
  if (fee === "yes" || fee === "interval" || fee === "daily") return "paid";
  return "unknown";
}

function parseName(tags: Record<string, string>, id: string): string {
  return (
    tags["name"] ||
    tags["operator"] ||
    tags["brand"] ||
    `Parcheggio #${id.slice(-4)}`
  );
}


function parseDisabled(tags: Record<string, string>): boolean {
  // Dedicated disabled parking spot
  if (tags["amenity"] === "parking" && tags["access"] === "disabled") return true;
  if (tags["parking"] === "disabled") return true;
  // Has disabled capacity
  const cap = tags["capacity:disabled"] || tags["disabled:capacity"] || tags["capacity:handicapped"];
  if (cap && cap !== "0") return true;
  // Wheelchair accessible tag
  if (tags["wheelchair"] === "yes" || tags["wheelchair"] === "designated") return true;
  return false;
}

const DAYS: Record<string, number> = {
  Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0,
};

function parseTime(s: string): number {
  const [h, m] = s.split(":").map(Number);
  return h * 60 + (m || 0);
}

function dayRange(from: string, to: string): number[] {
  const start = DAYS[from];
  const end = DAYS[to];
  if (start === undefined || end === undefined) return [];
  const days: number[] = [];
  let cur = start;
  while (cur !== end) {
    days.push(cur);
    cur = (cur + 1) % 7;
  }
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

  const rules = oh.split(";").map((r) => r.trim());

  for (const rule of rules) {
    const allDayMatch = rule.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+(\d{2}:\d{2})-(\d{2}:\d{2})(?:\s+off)?/);
    if (allDayMatch) {
      const [, fromDay, toDay, fromTime, toTime] = allDayMatch;
      const isOff = rule.includes(" off");
      const days = toDay ? dayRange(fromDay, toDay) : [DAYS[fromDay]];
      if (!days.includes(nowDay)) continue;
      const start = parseTime(fromTime);
      const end = parseTime(toTime);
      if (nowMin >= start && nowMin < end) {
        return isOff ? "closed" : "open";
      }
      continue;
    }

    const timeOnly = rule.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (timeOnly) {
      const start = parseTime(timeOnly[1]);
      const end = parseTime(timeOnly[2]);
      if (nowMin >= start && nowMin < end) return "open";
    }
  }

  return "unknown";
}

async function fetchOverpass(overpassQuery: string): Promise<Response> {
  // Usa il proxy Vercel per evitare problemi CORS
  const response = await fetch("/api/overpass", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data: overpassQuery }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: `Errore server: ${response.status}` }));
    throw new Error(err.error || "Errore nel recupero dei dati.");
  }
  return response;
}

export async function searchParkings(
  lat: number,
  lng: number,
  radiusMeters: number = 1000
): Promise<ParkingSpot[]> {
  const query = `
[out:json][timeout:25];
(
  node["amenity"="parking"](around:${radiusMeters},${lat},${lng});
  way["amenity"="parking"](around:${radiusMeters},${lat},${lng});
  relation["amenity"="parking"](around:${radiusMeters},${lat},${lng});
);
out center tags;
`;

  const response = await fetchOverpass(query);
  const data = await response.json();
  const spots: ParkingSpot[] = [];

  for (const element of data.elements) {
    let elLat: number | undefined;
    let elLng: number | undefined;

    if (element.type === "node") {
      elLat = element.lat;
      elLng = element.lon;
    } else if (element.center) {
      elLat = element.center.lat;
      elLng = element.center.lon;
    }

    if (elLat === undefined || elLng === undefined) continue;

    const tags: Record<string, string> = element.tags || {};
    const oh = tags["opening_hours"] || tags["parking:opening_hours"] || "";
    const access = tags["access"] || "";

    let available: "open" | "closed" | "unknown" = parseOpeningHours(oh);
    if (access === "private" || access === "no") available = "closed";

    spots.push({
      id: `${element.type}_${element.id}`,
      lat: elLat,
      lng: elLng,
      name: parseName(tags, String(element.id)),
      fee: parseFee(tags),
      available,
      capacity: tags["capacity"],
      access,
      surface: tags["surface"],
      maxstay: tags["maxstay"],
      operator: tags["operator"],
      opening_hours: oh || undefined,
      type: element.type,
      disabled: parseDisabled(tags),
      capacity_disabled: tags["capacity:disabled"] || tags["disabled:capacity"] || tags["capacity:handicapped"] || undefined,
    });
  }

  return spots;
}

export interface GeoSuggestion {
  display: string;
  lat: number;
  lng: number;
}

export async function fetchSuggestions(query: string): Promise<GeoSuggestion[]> {
  if (query.trim().length < 3) return [];
  // Try Photon
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=it`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (response.ok) {
      const data = await response.json();
      if (data?.features?.length) {
        return data.features.map((f: { geometry: { coordinates: [number, number] }; properties: Record<string, string> }) => {
          const [lng, lat] = f.geometry.coordinates;
          const p = f.properties;
          return { display: [p.name, p.street, p.city, p.country].filter(Boolean).join(", "), lat, lng };
        });
      }
    }
  } catch { /* fallback */ }
  // Fallback: Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&accept-language=it`;
    const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return [];
    const data = await response.json();
    return (data || []).map((d: { lat: string; lon: string; display_name: string }) => ({
      lat: parseFloat(d.lat), lng: parseFloat(d.lon), display: d.display_name,
    }));
  } catch { return []; }
}

const GEOCODE_ENDPOINTS = [
  async (address: string) => {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=it`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.features?.length) return null;
    const [lng, lat] = d.features[0].geometry.coordinates;
    const p = d.features[0].properties;
    return { lat, lng, display: [p.name, p.street, p.city, p.country].filter(Boolean).join(", ") };
  },
  async (address: string) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&accept-language=it`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d?.length) return null;
    return { lat: parseFloat(d[0].lat), lng: parseFloat(d[0].lon), display: d[0].display_name };
  },
];

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  for (const fn of GEOCODE_ENDPOINTS) {
    try {
      const result = await fn(address);
      if (result) return result;
    } catch {
      continue;
    }
  }
  throw new Error("Indirizzo non trovato su nessun servizio. Riprova.");
}
