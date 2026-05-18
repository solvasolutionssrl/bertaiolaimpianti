import type { Metadata } from 'next';
import { Timer } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';

import { guardMobile } from '../_lib/guard';
import {
  InterventiOggiList,
  TurnoClient,
  type ApertoCommessa,
  type CommessaOpzione,
  type IntervAperto,
  type InterventoRecente,
} from './_components/turno-client';

export const metadata: Metadata = {
  title: 'Turno',
};

export const dynamic = 'force-dynamic';

/**
 * /mobile/turno — pagina time tracking PWA tecnici.
 *
 * Server Component:
 *  - Recupera l'intervento aperto corrente dell'utente (se esiste)
 *  - Recupera ultimi 5 interventi del giorno
 *  - Recupera commesse aperte dell'utente per quick-select
 *
 * Il client component renderizza il cronometro live + bottoni
 * start/stop e invoca le Server Actions in `../_actions/turno.ts`.
 */
export default async function MobileTurnoPage() {
  const ctx = await guardMobile();
  const supabase = createServerSupabase();

  // Inizio giornata locale (timezone server = UTC su Vercel; usiamo
  // semplicemente "ultime 24h" per evitare problemi di TZ — il filtro
  // strict by-day si farà a livello office/turni con date locali).
  const oggiStart = new Date();
  oggiStart.setHours(0, 0, 0, 0);

  const [apertoRes, recentiRes, commesseRes] = await Promise.all([
    supabase
      .from('interventi')
      .select(
        `
          id,
          start_at,
          commessa:commesse!inner (
            id,
            codice_interno,
            cliente:clienti ( ragione_sociale )
          )
        `,
      )
      .eq('user_id', ctx.userId)
      .is('end_at', null)
      .maybeSingle(),
    supabase
      .from('interventi')
      .select(
        `
          id, start_at, end_at, duration_minutes, geo_lat, geo_lng,
          commessa:commesse!inner ( codice_interno )
        `,
      )
      .eq('user_id', ctx.userId)
      .gte('start_at', oggiStart.toISOString())
      .order('start_at', { ascending: false })
      .limit(5),
    supabase
      .from('commesse')
      .select(
        `
          id, codice_interno,
          cliente:clienti ( ragione_sociale )
        `,
      )
      .in('stato', ['aperta', 'in_corso', 'collaudo'])
      .order('data_apertura', { ascending: false })
      .limit(50),
  ]);

  const apertoRaw = apertoRes.data as any;
  let aperto: IntervAperto | null = null;
  if (apertoRaw) {
    const c = Array.isArray(apertoRaw.commessa)
      ? apertoRaw.commessa[0]
      : apertoRaw.commessa;
    const cliente = c
      ? Array.isArray(c.cliente)
        ? c.cliente[0]
        : c.cliente
      : null;
    aperto = {
      id: apertoRaw.id,
      start_at: apertoRaw.start_at,
      commessa: c
        ? ({
            id: c.id,
            codice_interno: c.codice_interno,
            cliente_ragione_sociale: cliente?.ragione_sociale ?? null,
          } as ApertoCommessa)
        : null,
    };
  }

  const recenti: InterventoRecente[] = ((recentiRes.data as any[]) ?? []).map(
    (r) => {
      const c = Array.isArray(r.commessa) ? r.commessa[0] : r.commessa;
      return {
        id: r.id,
        commessa_codice: c?.codice_interno ?? '—',
        start_at: r.start_at,
        end_at: r.end_at,
        duration_minutes: r.duration_minutes,
        geo_lat: r.geo_lat,
        geo_lng: r.geo_lng,
      };
    },
  );

  const commesse: CommessaOpzione[] = ((commesseRes.data as any[]) ?? []).map(
    (r) => {
      const cliente = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente;
      return {
        id: r.id,
        codice_interno: r.codice_interno,
        cliente_ragione_sociale: cliente?.ragione_sociale ?? null,
      };
    },
  );

  return (
    <div className="flex min-h-[100dvh] flex-col gap-5 p-4">
      <header className="pt-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
          <Timer className="h-3.5 w-3.5" aria-hidden="true" />
          Time tracking
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Il mio turno
        </h1>
      </header>

      <TurnoClient aperto={aperto} commesse={commesse} />

      <section className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Oggi
        </h2>
        <InterventiOggiList items={recenti} />
      </section>
    </div>
  );
}
