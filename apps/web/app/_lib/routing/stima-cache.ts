import { createServiceSupabase } from '@kommessa/api/service';

import type { Coord, RoutingProvider } from './index';

/**
 * Stima di un tragitto passando dalla cache geografica condivisa
 * (`routing_cache`). Le coppie di punti sono stabili, e con Google ogni stima si
 * paga: la pagina «Registra giornata» chiede le tratte mentre l'utente compila e
 * il server le richiede al salvataggio, quindi senza cache la stessa tratta si
 * pagherebbe due volte.
 *
 * Il profilo tiene separate le stime col traffico da quelle senza; col traffico
 * la cache vale 15 minuti, perché il valore dipende dall'ora.
 *
 * Minuti GREZZI (l'arrotondamento lo decide chi chiama). `null` se il provider
 * non risponde: chi chiama prosegue senza stima.
 */
const TTL_TRAFFICO_MS = 15 * 60 * 1000;

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export async function stimaConCache(
  provider: RoutingProvider,
  origine: Coord,
  destinazione: Coord,
): Promise<{ minuti: number; km: number | null } | null> {
  const chiave = {
    origin_lat: round6(origine.lat),
    origin_lng: round6(origine.lng),
    dest_lat: round6(destinazione.lat),
    dest_lng: round6(destinazione.lng),
  };
  const svc = createServiceSupabase();

  const { data: cached } = await svc
    .from('routing_cache' as never)
    .select('durata_min, distanza_km, created_at')
    .eq('origin_lat', chiave.origin_lat)
    .eq('origin_lng', chiave.origin_lng)
    .eq('dest_lat', chiave.dest_lat)
    .eq('dest_lng', chiave.dest_lng)
    .eq('profile', provider.profile)
    .maybeSingle();
  const hit = cached as { durata_min: number; distanza_km: number | null; created_at: string } | null;
  const fresca = hit ? Date.parse(hit.created_at) > Date.now() - TTL_TRAFFICO_MS : false;
  if (hit && typeof hit.durata_min === 'number' && (!provider.trafficAware || fresca)) {
    return { minuti: hit.durata_min, km: hit.distanza_km ?? null };
  }

  const res = await provider.stima(origine, destinazione);
  if (res == null) return null;

  const minuti = Math.round(res.minuti);
  const km = Math.round(res.km * 100) / 100;
  // created_at aggiornato: col traffico fa ripartire la validità. Best-effort.
  await svc
    .from('routing_cache' as never)
    .upsert(
      { ...chiave, profile: provider.profile, durata_min: minuti, distanza_km: km, created_at: new Date().toISOString() } as never,
      { onConflict: 'origin_lat,origin_lng,dest_lat,dest_lng,profile' } as never,
    );
  return { minuti, km };
}
