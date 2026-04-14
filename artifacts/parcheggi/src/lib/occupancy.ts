import { ParkingSpot } from "./overpass";

function seededRandom(seed: number): number {
  const x = Math.sin(seed + 1) * 10000;
  return x - Math.floor(x);
}

function idToSeed(id: string): number {
  return id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
}

export interface OccupancyResult {
  percent: number;
  label: string;
  color: string;
  confidence: "high" | "medium" | "low";
  breakdown: { label: string; value: string; delta: number }[];
}

export function estimateOccupancy(spot: ParkingSpot): OccupancyResult {
  const seed = idToSeed(spot.id);
  const base = 20 + Math.floor(seededRandom(seed) * 40);

  const now = new Date();
  const hour = now.getHours();
  const day = now.getDay();
  const isWeekend = day === 0 || day === 6;

  let timeDelta = 0;
  let timeLabel = "";
  if (hour >= 0 && hour < 6) {
    timeDelta = -30;
    timeLabel = "notte (basso traffico)";
  } else if (hour >= 6 && hour < 9) {
    timeDelta = 10;
    timeLabel = "mattina presto";
  } else if (hour >= 9 && hour < 12) {
    timeDelta = 25;
    timeLabel = "mattina (picco)";
  } else if (hour >= 12 && hour < 14) {
    timeDelta = 30;
    timeLabel = "pausa pranzo (picco)";
  } else if (hour >= 14 && hour < 17) {
    timeDelta = 15;
    timeLabel = "pomeriggio";
  } else if (hour >= 17 && hour < 20) {
    timeDelta = 32;
    timeLabel = "sera (picco)";
  } else if (hour >= 20 && hour < 22) {
    timeDelta = 5;
    timeLabel = "sera tardi";
  } else {
    timeDelta = -15;
    timeLabel = "notte";
  }

  const dayDelta = isWeekend ? -8 : 8;
  const dayLabel = isWeekend ? "weekend" : "giorno feriale";

  let feeDelta = 0;
  let feeLabel = "";
  if (spot.fee === "free") {
    feeDelta = 18;
    feeLabel = "gratuito (alta domanda)";
  } else if (spot.fee === "paid") {
    feeDelta = -12;
    feeLabel = "a pagamento (bassa domanda)";
  } else {
    feeDelta = 4;
    feeLabel = "tipo non specificato";
  }

  let capDelta = 0;
  let capLabel = "";
  if (spot.capacity) {
    const cap = parseInt(spot.capacity, 10);
    if (!isNaN(cap)) {
      if (cap < 20) {
        capDelta = 15;
        capLabel = `piccolo (${cap} posti)`;
      } else if (cap < 100) {
        capDelta = 0;
        capLabel = `medio (${cap} posti)`;
      } else {
        capDelta = -12;
        capLabel = `grande (${cap} posti)`;
      }
    }
  }

  const total = Math.max(0, Math.min(98, base + timeDelta + dayDelta + feeDelta + capDelta));

  let label: string;
  let color: string;
  if (total <= 25) {
    label = "Molto libero";
    color = "#16a34a";
  } else if (total <= 50) {
    label = "Posti disponibili";
    color = "#65a30d";
  } else if (total <= 70) {
    label = "Occupazione media";
    color = "#d97706";
  } else if (total <= 85) {
    label = "Quasi pieno";
    color = "#ea580c";
  } else {
    label = "Probabilmente pieno";
    color = "#dc2626";
  }

  const breakdown: { label: string; value: string; delta: number }[] = [
    { label: "Orario", value: timeLabel, delta: timeDelta },
    { label: "Giorno", value: dayLabel, delta: dayDelta },
    { label: "Tipo parcheggio", value: feeLabel, delta: feeDelta },
  ];

  if (capLabel) {
    breakdown.push({ label: "Dimensione", value: capLabel, delta: capDelta });
  }

  const hasRealData = !!spot.capacity || spot.fee !== "unknown" || !!spot.opening_hours;
  const confidence: "high" | "medium" | "low" = hasRealData ? "medium" : "low";

  return { percent: total, label, color, confidence, breakdown };
}
