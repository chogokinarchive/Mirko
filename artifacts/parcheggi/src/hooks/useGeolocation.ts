import { useState, useCallback } from "react";

export interface GeoPosition {
  lat: number;
  lng: number;
}

export function useGeolocation() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getPosition = useCallback((): Promise<GeoPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        const err = "Il tuo browser non supporta la geolocalizzazione";
        setError(err);
        reject(new Error(err));
        return;
      }
      setLoading(true);
      setError(null);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLoading(false);
          resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        (err) => {
          setLoading(false);
          const msg =
            err.code === 1
              ? "Accesso alla posizione negato"
              : err.code === 2
              ? "Posizione non disponibile"
              : "Timeout nella richiesta della posizione";
          setError(msg);
          reject(new Error(msg));
        },
        { timeout: 10000, enableHighAccuracy: true }
      );
    });
  }, []);

  return { getPosition, loading, error };
}
