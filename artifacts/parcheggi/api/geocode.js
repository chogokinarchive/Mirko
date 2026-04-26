export const config = {
  api: { bodyParser: false },
  maxDuration: 10,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  if (req.method === "OPTIONS") return res.status(200).end();

  const q = req.query.q;
  const limit = req.query.limit || "5";
  if (!q) return res.status(400).json({ error: "Missing query" });

  // Try Photon first
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=${limit}&lang=it`;
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
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
    const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!r.ok) return res.status(503).json({ error: "Geocoding non disponibile" });
    const data = await r.json();
    const features = (data || []).map(d => ({
      geometry: { coordinates: [parseFloat(d.lon), parseFloat(d.lat)] },
      properties: {
        name: d.display_name.split(",")[0].trim(),
        city: d.display_name.split(",")[1]?.trim() || "",
        country: "Italia",
      },
    }));
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({ features });
  } catch {
    return res.status(503).json({ error: "Geocoding non disponibile" });
  }
}
