import type { VercelRequest, VercelResponse } from "@vercel/node";

export const config = {
  api: { bodyParser: { sizeLimit: "100kb" } },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const q = req.query.q as string;
  const limit = req.query.limit || "5";
  if (!q) return res.status(400).json({ error: "Missing query" });

  // Try Photon
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=it`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (r.ok) {
      const data = await r.json();
      if (data?.features?.length) {
        res.setHeader("Cache-Control", "s-maxage=300");
        return res.status(200).json(data);
      }
    }
  } catch { /* fallback */ }

  // Fallback: Nominatim
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=${limit}&accept-language=it`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) return res.status(503).json({ error: "Geocoding non disponibile" });
    const data = await r.json();
    // Convert Nominatim format to GeoJSON-like for compatibility
    const features = (data || []).map((d: { lat: string; lon: string; display_name: string }) => ({
      geometry: { coordinates: [parseFloat(d.lon), parseFloat(d.lat)] },
      properties: { name: d.display_name.split(",")[0], city: d.display_name.split(",")[1]?.trim(), country: "Italia" },
    }));
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({ features });
  } catch {
    return res.status(503).json({ error: "Geocoding non disponibile" });
  }
}
