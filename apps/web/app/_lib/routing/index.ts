/**
 * Astrazione provider di routing (stima tempo di percorrenza in auto).
 *
 * Oggi: OpenRouteService (Directions driving-car), tier gratuito, chiave in
 * `ORS_API_KEY`. La stima NON è traffic-aware: serve solo come suggerimento,
 * il tecnico conferma o corregge con giustificazione. Le coppie origine→dest
 * (sede↔cantiere) sono geograficamente stabili → si cachano in `routing_cache`.
 *
 * Astratto di proposito (come lo StorageProvider): per passare in futuro a un
 * provider traffic-aware a pagamento (Google Routes / Mapbox / TomTom) basta
 * implementare `RoutingProvider` senza toccare i chiamanti.
 */

export type Coord = { lat: number; lng: number };

export interface RoutingProvider {
  /** Durata di guida in MINUTI grezzi (non arrotondati), o null se non stimabile. */
  durataMin(origin: Coord, dest: Coord): Promise<number | null>;
}

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

function createOrsProvider(apiKey: string): RoutingProvider {
  return {
    async durataMin(origin, dest) {
      try {
        const res = await fetch(ORS_URL, {
          method: 'POST',
          headers: { Authorization: apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // ORS vuole [lng, lat]
            coordinates: [
              [origin.lng, origin.lat],
              [dest.lng, dest.lat],
            ],
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          routes?: { summary?: { duration?: number } }[];
        };
        const sec = json.routes?.[0]?.summary?.duration;
        if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
        return sec / 60;
      } catch {
        return null;
      }
    },
  };
}

/** Provider attivo o null se non configurato (env `ORS_API_KEY` mancante). */
export function getRoutingProvider(): RoutingProvider | null {
  const key = process.env.ORS_API_KEY?.trim();
  if (!key) return null;
  return createOrsProvider(key);
}
