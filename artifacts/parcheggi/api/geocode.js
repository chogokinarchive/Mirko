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

  // Nominatim con User-Agent corretto (funziona lato server)
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=${limit}&accept-language=it&addressdetails=1`;
    const r = await fetch(url, {
      signal: AbortSignal.timeout(7000),
      headers: {
        "User-Agent": "ParcheggiApp/1.0 (https://mirko-parcheggi.vercel.app)",
        "Accept": "application/json",
      },
    });
    if (!r.ok) return res.status(503).json({ error: "Geocoding non disponibile" });
    const data = await r.json();
    if (!data?.length) return res.status(200).json({ features: [] });
    const features = data.map(d => ({
      geometry: { coordinates: [parseFloat(d.lon), parseFloat(d.lat)] },
      properties: {
        name: d.display_name.split(",")[0].trim(),
        city: (d.address?.city || d.address?.town || d.address?.village || d.display_name.split(",")[1] || "").trim(),
        country: d.address?.country || "Italia",
      },
    }));
    res.setHeader("Cache-Control", "s-maxage=300");
    return res.status(200).json({ features });
  } catch (e) {
    return res.status(503).json({ error: "Geocoding non disponibile" });
  }
}
