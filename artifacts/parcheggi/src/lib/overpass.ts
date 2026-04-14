export interface ParkingSpot {
  id: string;
  lat: number;
  lng: number;
  name: string;
  fee: "free" | "paid" | "unknown";
  capacity?: string;
  access?: string;
  surface?: string;
  maxstay?: string;
  operator?: string;
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
    throw new Error(`Errore API: ${response.status}`);
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

    spots.push({
      id: `${element.type}_${element.id}`,
      lat: elLat,
      lng: elLng,
      name: parseName(tags, String(element.id)),
      fee: parseFee(tags),
      capacity: tags["capacity"],
      access: tags["access"],
      surface: tags["surface"],
      maxstay: tags["maxstay"],
      operator: tags["operator"],
      type: element.type,
    });
  }

  return spots;
}

export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; display: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;
  const response = await fetch(url, {
    headers: { "Accept-Language": "it", "User-Agent": "ParcheggiApp/1.0" },
  });
  if (!response.ok) return null;
  const data = await response.json();
  if (!data || data.length === 0) return null;
  return {
    lat: parseFloat(data[0].lat),
    lng: parseFloat(data[0].lon),
    display: data[0].display_name,
  };
}
