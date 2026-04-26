export const config = {
  api: { bodyParser: { sizeLimit: "1mb" } },
  maxDuration: 10,
};

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const queryData = typeof req.body === "string"
    ? JSON.parse(req.body).data
    : req.body?.data;

  if (!queryData) return res.status(400).json({ error: "Missing query data" });

  const endpoints = [
    "https://overpass-api.de/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://z.overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ];

  // Prova tutti in parallelo, usa il primo che risponde
  const body = `data=${encodeURIComponent(queryData)}`;
  const headers = { "Content-Type": "application/x-www-form-urlencoded" };

  try {
    const result = await Promise.any(
      endpoints.map(endpoint =>
        fetch(endpoint, {
          method: "POST",
          headers,
          body,
          signal: AbortSignal.timeout(8000),
        }).then(r => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r;
        })
      )
    );

    const data = await result.json();
    res.setHeader("Cache-Control", "s-maxage=60");
    return res.status(200).json(data);
  } catch {
    return res.status(503).json({ error: "Tutti i server Overpass non disponibili. Riprova tra qualche secondo." });
  }
}
