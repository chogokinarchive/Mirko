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

  const response = await fetch("https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(query)}`,
  });

  if (!response.ok) {
    if (response.status === 429 || response.status === 503) {
      throw new Error("Servizio sovraccarico, riprova tra qualche secondo.");
    }
    throw new Error(`Errore Overpass: ${response.status}`);
  }

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
    });
  }

  return spots;
}

export async function geocodeAddress(
  address: string
): Promise<{ lat: number; lng: number; display: string } | null> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(address)}&limit=1&lang=it`;
  const response = await fetch(url);
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || !data.features || data.features.length === 0) return null;
  const feature = data.features[0];
  const [lng, lat] = feature.geometry.coordinates;
  const p = feature.properties;
  const display = [p.name, p.street, p.city, p.country].filter(Boolean).join(", ");
  return { lat, lng, display };
}
