/**
 * Astrazione provider di routing (stima tempo di percorrenza + km in auto).
 *
 * Due famiglie:
 *  - **free** (default): OpenRouteService se `ORS_API_KEY`, altrimenti OSRM demo
 *    pubblico. Gratis, **senza traffico** (flusso libero): è solo un suggerimento.
 *  - **google**: Google Routes API (`computeRoutes`, `TRAFFIC_AWARE`) → durata col
 *    **traffico reale**. A pagamento. La chiave è UNICA a livello piattaforma
 *    (`GOOGLE_MAPS_API_KEY`, env); il super admin decide PER-TENANT se usarla
 *    (`tenant_modules.config.routing_provider` ∈ 'free'|'google').
 *
 * Le coppie origine→dest (sede↔cantiere) sono stabili → si cachano in
 * `routing_cache`. Il `profile` distingue free ('driving-car') da traffico
 * ('driving-traffic') così i due non si mescolano; per il traffico la cache ha
 * un TTL corto (il valore cambia con l'ora), gestito dal chiamante.
 */

export type Coord = { lat: number; lng: number };

/** Esito di una stima: minuti grezzi (non arrotondati) + km. */
export type StimaPercorso = { minuti: number; km: number };

export type RoutingProfile = 'driving-car' | 'driving-traffic';

export interface RoutingProvider {
  /** Chiave di cache geografica (e discrimina free vs traffico). */
  readonly profile: RoutingProfile;
  /** true se la stima dipende dal traffico ora → cache a TTL corto. */
  readonly trafficAware: boolean;
  /** Durata (min grezzi) + distanza (km) di guida, o null se non stimabile. */
  stima(origin: Coord, dest: Coord): Promise<StimaPercorso | null>;
}

export type RoutingProviderChoice = 'free' | 'google';

function km(metri: number): number {
  return Math.round((metri / 1000) * 100) / 100;
}

// ─── free: OpenRouteService (chiave) ─────────────────────────────────────────
const ORS_URL = 'https://api.openrouteservice.org/v2/directions/driving-car';

function createOrsProvider(apiKey: string): RoutingProvider {
  return {
    profile: 'driving-car',
    trafficAware: false,
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

// ─── free: OSRM demo pubblico (nessuna chiave) ───────────────────────────────
// Server demo senza SLA → ok come ripiego (la stima è non vincolante), non
// ideale come unica dipendenza. Con ORS_API_KEY si usa ORS (più affidabile).
const OSRM_URL = 'https://router.project-osrm.org/route/v1/driving';

function createOsrmProvider(): RoutingProvider {
  return {
    profile: 'driving-car',
    trafficAware: false,
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

// ─── google: Routes API computeRoutes (traffico reale) ───────────────────────
const GOOGLE_ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

function createGoogleProvider(apiKey: string): RoutingProvider {
  return {
    profile: 'driving-traffic',
    trafficAware: true,
    async stima(origin, dest) {
      try {
        const res = await fetch(GOOGLE_ROUTES_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            // Field mask OBBLIGATORIA: chiediamo solo durata + distanza (si paga
            // per i campi richiesti). `duration` include il traffico attuale.
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
          },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
            destination: { location: { latLng: { latitude: dest.lat, longitude: dest.lng } } },
            travelMode: 'DRIVE',
            // TRAFFIC_AWARE = traffico reale "adesso", bassa latenza. Niente
            // departureTime: di default è "ora", e ometterlo evita errori
            // "departureTime nel passato" da skew dell'orologio.
            routingPreference: 'TRAFFIC_AWARE',
            units: 'METRIC',
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (!res.ok) return null;
        const json = (await res.json()) as {
          routes?: { duration?: string; distanceMeters?: number }[];
        };
        const r = json.routes?.[0];
        // `duration` arriva come stringa di secondi, es. "1234s".
        const durStr = r?.duration;
        const metri = r?.distanceMeters;
        if (typeof durStr !== 'string') return null;
        const sec = parseInt(durStr.replace(/s$/, ''), 10);
        if (!Number.isFinite(sec)) return null;
        return { minuti: sec / 60, km: typeof metri === 'number' ? km(metri) : 0 };
      } catch {
        return null;
      }
    },
  };
}

/** true se la chiave Google di piattaforma è configurata (env). */
export function googleRoutingDisponibile(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY?.trim();
}

/**
 * Provider attivo per il tenant.
 *  - choice 'google' + chiave piattaforma presente → Google Routes (traffico).
 *  - altrimenti free: ORS se `ORS_API_KEY`, altrimenti OSRM demo.
 * Mai null → la stima gratuita è sempre disponibile (fail-soft).
 */
export function getRoutingProvider(opts?: { provider?: RoutingProviderChoice }): RoutingProvider {
  const googleKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (opts?.provider === 'google' && googleKey) {
    return createGoogleProvider(googleKey);
  }
  const orsKey = process.env.ORS_API_KEY?.trim();
  return orsKey ? createOrsProvider(orsKey) : createOsrmProvider();
}
