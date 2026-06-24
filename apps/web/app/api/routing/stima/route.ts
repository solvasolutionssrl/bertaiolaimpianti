import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { createServiceSupabase } from '@kommessa/api/service';
import { arrotondaA } from '@kommessa/api/kantiere-ore';
import { tenantHasModule } from '@/app/_lib/modules';
import { leggiArrotondamenti } from '@/app/_lib/kantiere-config';
import { getRoutingProvider, type Coord } from '@/app/_lib/routing';

/**
 * POST /api/routing/stima
 * Body: { sedeId, cantiereId, direzione: 'andata'|'ritorno' }
 *
 * Stima i minuti di percorrenza in auto tra sede e cantiere.
 *  - andata  : origine = sede,     destinazione = cantiere
 *  - ritorno : origine = cantiere, destinazione = sede
 *
 * Le coppie (origine,dest) sono stabili → cache in `routing_cache` (service).
 * Fail-soft: se il provider non è configurato/risponde, o mancano le coord,
 * ritorna `{ ok:true, minuti:null }` → il tecnico inserisce a mano.
 *
 * Auth: requireTenantContext. Le letture sede/cantiere passano dalla RLS del
 * tenant (server client); la cache geografica usa il service client.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const inputSchema = z.object({
  sedeId: z.string().uuid(),
  cantiereId: z.string().uuid(),
  direzione: z.enum(['andata', 'ritorno']),
});

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export async function POST(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  if (!(await tenantHasModule('kantiere')))
    return NextResponse.json({ ok: false, error: 'MODULO_OFF' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INPUT' }, { status: 400 });

  const supabase = createServerSupabase();
  // Step di arrotondamento del tempo di viaggio (configurabile dall'ufficio,
  // default 5 min). Applicato sia sul valore in cache sia su quello fresco.
  const { viaggioMin: stepViaggio } = await leggiArrotondamenti(supabase, ctx.tenantId);

  const { data: sedeRaw } = await supabase
    .from('sedi' as never)
    .select('lat, lng')
    .eq('id', parsed.data.sedeId)
    .maybeSingle();
  const { data: cantRaw } = await supabase
    .from('cantieri' as never)
    .select('indirizzo_lat, indirizzo_lng')
    .eq('id', parsed.data.cantiereId)
    .maybeSingle();

  const sede = sedeRaw as { lat: number | null; lng: number | null } | null;
  const cant = cantRaw as { indirizzo_lat: number | null; indirizzo_lng: number | null } | null;

  if (!sede?.lat || !sede?.lng || !cant?.indirizzo_lat || !cant?.indirizzo_lng) {
    return NextResponse.json({ ok: true, minuti: null, motivo: 'coord_mancanti' });
  }

  const sedeCoord: Coord = { lat: Number(sede.lat), lng: Number(sede.lng) };
  const cantCoord: Coord = { lat: Number(cant.indirizzo_lat), lng: Number(cant.indirizzo_lng) };
  const origin = parsed.data.direzione === 'andata' ? sedeCoord : cantCoord;
  const dest = parsed.data.direzione === 'andata' ? cantCoord : sedeCoord;

  const oLat = round6(origin.lat);
  const oLng = round6(origin.lng);
  const dLat = round6(dest.lat);
  const dLng = round6(dest.lng);

  const svc = createServiceSupabase();

  // 1) cache
  const { data: cached } = await svc
    .from('routing_cache' as never)
    .select('durata_min, distanza_km')
    .eq('origin_lat', oLat)
    .eq('origin_lng', oLng)
    .eq('dest_lat', dLat)
    .eq('dest_lng', dLng)
    .eq('profile', 'driving-car')
    .maybeSingle();

  const hit = cached as { durata_min: number; distanza_km: number | null } | null;
  if (hit && typeof hit.durata_min === 'number') {
    return NextResponse.json({
      ok: true,
      minuti: arrotondaA(hit.durata_min, stepViaggio),
      minutiRaw: hit.durata_min,
      km: hit.distanza_km ?? null,
    });
  }

  // 2) provider (ORS se chiave, altrimenti OSRM demo: sempre disponibile)
  const provider = getRoutingProvider();
  const res = await provider.stima(origin, dest);
  if (res == null) {
    return NextResponse.json({ ok: true, minuti: null, km: null, motivo: 'stima_non_disponibile' });
  }

  const durata = Math.round(res.minuti);
  const distanza = Math.round(res.km * 100) / 100;
  // 3) salva in cache (best-effort)
  await svc
    .from('routing_cache' as never)
    .upsert(
      {
        origin_lat: oLat,
        origin_lng: oLng,
        dest_lat: dLat,
        dest_lng: dLng,
        profile: 'driving-car',
        durata_min: durata,
        distanza_km: distanza,
      } as never,
      { onConflict: 'origin_lat,origin_lng,dest_lat,dest_lng,profile' } as never,
    );

  return NextResponse.json({ ok: true, minuti: arrotondaA(durata, stepViaggio), minutiRaw: durata, km: distanza });
}
