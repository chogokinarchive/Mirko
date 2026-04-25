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
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.openstreetmap.ru/api/interpreter",
  ];

  let lastError = "Tutti i server Overpass non disponibili.";

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(queryData)}`,
        signal: AbortSignal.timeout(25000),
      });

      if (response.ok) {
        const data = await response.json();
        res.setHeader("Cache-Control", "s-maxage=60");
        return res.status(200).json(data);
      }

      lastError = response.status === 429 || response.status === 503
        ? "Servizi sovraccarichi, riprova tra qualche secondo."
        : `Errore server: ${response.status}`;
    } catch {
      lastError = "Connessione al servizio fallita.";
    }
  }

  return res.status(503).json({ error: lastError });
}
