import type { VercelRequest, VercelResponse } from "@vercel/node";

const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.openstreetmap.ru/api/interpreter",
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body;
  if (!body || !body.data) {
    return res.status(400).json({ error: "Missing query data" });
  }

  let lastError = "Tutti i server Overpass non disponibili.";

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(body.data)}`,
        signal: AbortSignal.timeout(25000),
      });

      if (response.ok) {
        const data = await response.json();
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Cache-Control", "s-maxage=60");
        return res.status(200).json(data);
      }

      if (response.status === 429 || response.status === 503) {
        lastError = "Servizi sovraccarichi, riprova tra qualche secondo.";
        continue;
      }

      lastError = `Errore server: ${response.status}`;
    } catch {
      lastError = "Connessione al servizio fallita.";
    }
  }

  return res.status(503).json({ error: lastError });
}
