import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { arrotondaA } from '@kommessa/api/kantiere-ore';
import { tenantHasModule } from '@/app/_lib/modules';
import { leggiArrotondamenti, leggiRoutingProvider } from '@/app/_lib/kantiere-config';
import { getRoutingProvider, type Coord } from '@/app/_lib/routing';
import { stimaConCache } from '@/app/_lib/routing/stima-cache';

/**
 * POST /api/routing/stima
 *
 * Stima minuti e km di guida. Due forme di body:
 *  - `{ sedeId, cantiereId, direzione: 'andata'|'ritorno' }` sede ↔ cantiere
 *      andata: sede → cantiere · ritorno: cantiere → sede
 *  - `{ daCantiereId, aCantiereId }` cantiere → cantiere, per le tratte fra
 *      cantieri che «Registra giornata» mostra mentre si compila
 *
 * Cache geografica condivisa (`stimaConCache`). Fail-soft: se mancano le
 * coordinate o il provider non risponde torna `{ ok:true, minuti:null }` e il
 * tecnico inserisce il tempo a mano.
 *
 * Auth: tenant + modulo. Le coordinate si leggono col client del tenant (RLS):
 * una sede o un cantiere di un altro cliente semplicemente non esiste.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const uuid = z.string().uuid();
const inputSchema = z.union([
  z.object({ sedeId: uuid, cantiereId: uuid, direzione: z.enum(['andata', 'ritorno']) }),
  z.object({ daCantiereId: uuid, aCantiereId: uuid }),
]);

type Supa = ReturnType<typeof createServerSupabase>;

async function coordSede(supabase: Supa, id: string): Promise<Coord | null> {
  const { data } = await supabase.from('sedi' as never).select('lat, lng').eq('id', id).maybeSingle();
  const r = data as { lat: number | null; lng: number | null } | null;
  return r?.lat != null && r?.lng != null ? { lat: Number(r.lat), lng: Number(r.lng) } : null;
}

async function coordCantiere(supabase: Supa, id: string): Promise<Coord | null> {
  const { data } = await supabase
    .from('cantieri' as never)
    .select('indirizzo_lat, indirizzo_lng')
    .eq('id', id)
    .maybeSingle();
  const r = data as { indirizzo_lat: number | null; indirizzo_lng: number | null } | null;
  return r?.indirizzo_lat != null && r?.indirizzo_lng != null
    ? { lat: Number(r.indirizzo_lat), lng: Number(r.indirizzo_lng) }
    : null;
}

export async function POST(req: Request) {
  const ctx = await getTenantContext();
  if (!ctx) return NextResponse.json({ ok: false, error: 'UNAUTHENTICATED' }, { status: 401 });
  if (!(await tenantHasModule('kantiere')))
    return NextResponse.json({ ok: false, error: 'MODULO_OFF' }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = inputSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'INPUT' }, { status: 400 });
  const input = parsed.data;

  const supabase = createServerSupabase();

  let origine: Coord | null;
  let destinazione: Coord | null;
  if ('daCantiereId' in input) {
    [origine, destinazione] = await Promise.all([
      coordCantiere(supabase, input.daCantiereId),
      coordCantiere(supabase, input.aCantiereId),
    ]);
  } else {
    const [sede, cantiere] = await Promise.all([
      coordSede(supabase, input.sedeId),
      coordCantiere(supabase, input.cantiereId),
    ]);
    [origine, destinazione] = input.direzione === 'andata' ? [sede, cantiere] : [cantiere, sede];
  }
  if (!origine || !destinazione) {
    return NextResponse.json({ ok: true, minuti: null, km: null, motivo: 'coord_mancanti' });
  }

  // Provider per-tenant: 'google' (traffico reale) se abilitato dal super admin
  // e con la chiave di piattaforma, altrimenti free (ORS/OSRM).
  const [{ viaggioMin: stepViaggio }, scelta] = await Promise.all([
    leggiArrotondamenti(supabase, ctx.tenantId),
    leggiRoutingProvider(supabase, ctx.tenantId),
  ]);
  const stima = await stimaConCache(getRoutingProvider({ provider: scelta }), origine, destinazione);
  if (!stima) {
    return NextResponse.json({ ok: true, minuti: null, km: null, motivo: 'stima_non_disponibile' });
  }

  // Step di arrotondamento del viaggio (configurabile dall'ufficio, default 5).
  return NextResponse.json({
    ok: true,
    minuti: arrotondaA(stima.minuti, stepViaggio),
    minutiRaw: stima.minuti,
    km: stima.km,
  });
}
