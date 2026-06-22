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

/** Esito di una stima: minuti grezzi (non arrotondati) + km. */
export type StimaPercorso = { minuti: number; km: number };

export interface RoutingProvider {
  /** Durata (min grezzi) + distanza (km) di guida, o null se non stimabile. */
  stima(origin: Coord, dest: Coord): Promise<StimaPercorso | null>;
}

const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

function km(metri: number): number {
  return Math.round((metri / 1000) * 100) / 100;
}

function createOrsProvider(apiKey: string): RoutingProvider {
  return {
    async stima(origin, dest) {
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
          routes?: { summary?: { duration?: number; distance?: number } }[];
        };
        const s = json.routes?.[0]?.summary;
        const sec = s?.duration;
        const metri = s?.distance;
        if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
        return { minuti: sec / 60, km: typeof metri === 'number' ? km(metri) : 0 };
      } catch {
        return null;
      }
    },
  };
}

// OSRM demo pubblico: nessuna chiave. Fallback "free zero-setup". È un server
// demo senza SLA → ok come ripiego (la stima è non vincolante), non ideale come
// unica dipendenza. Quando c'è ORS_API_KEY si usa ORS (più affidabile).
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

function createOsrmProvider(): RoutingProvider {
  return {
    async stima(origin, dest) {
      try {
        const url = `${OSRM_URL}/${origin.lng},${origin.lat};${dest.lng},${dest.lat}?overview=false`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (!res.ok) return null;
        const json = (await res.json()) as { routes?: { duration?: number; distance?: number }[] };
        const r = json.routes?.[0];
        const sec = r?.duration;
        const metri = r?.distance;
        if (typeof sec !== 'number' || !Number.isFinite(sec)) return null;
        return { minuti: sec / 60, km: typeof metri === 'number' ? km(metri) : 0 };
      } catch {
        return null;
      }
    },
  };
}

/**
 * Provider attivo: ORS se `ORS_API_KEY` è configurata (primario, affidabile),
 * altrimenti OSRM demo pubblico (free, senza chiave). Mai null → la stima
 * gratuita è sempre disponibile.
 */
export function getRoutingProvider(): RoutingProvider {
  const key = process.env.ORS_API_KEY?.trim();
  return key ? createOrsProvider(key) : createOsrmProvider();
}
