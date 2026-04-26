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

  const fetchHeaders = {
    "Content-Type": "application/x-www-form-urlencoded",
    "User-Agent": "ParcheggiApp/1.0 (https://mirko-parcheggi.vercel.app; parking finder app)",
    "Referer": "https://mirko-parcheggi.vercel.app",
  };

  try {
    const result = await Promise.any(
      endpoints.map(endpoint =>
        fetch(endpoint, {
          method: "POST",
          headers: fetchHeaders,
          body: `data=${encodeURIComponent(queryData)}`,
          signal: AbortSignal.timeout(8000),
        }).then(r => {
          if (!r.ok) throw new Error(`${r.status}`);
          return r;
        })
      )
    );

    const data = await result.json();
    res.setHeader("Cache-Control", "s-maxage=120");
    return res.status(200).json(data);
  } catch (e) {
    return res.status(503).json({ error: "Server parcheggi non disponibili. Riprova tra qualche secondo." });
  }
}
