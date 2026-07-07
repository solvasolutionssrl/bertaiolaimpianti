import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, ChevronLeft, ChevronRight, GraduationCap, HardHat, Truck } from 'lucide-react';

import { createServerSupabase } from '@kommessa/api/server';
import { romeDay } from '@kommessa/api/rome-time';
import {
  lunediDellaSettimana,
  addGiorni,
  giorniSettimana,
  NOMI_GIORNO_BREVI,
  LABEL_FASCIA,
} from '@kommessa/api/pianificazione';
import { titoloCase } from '@/app/mobile/_lib/display-case';

import { guardMobile } from '../_lib/guard';
import { tenantHasModule } from '../../_lib/modules';
import { caricaBlocchiRange } from '@/app/office/personale/pianificazione/_lib/query';

export const metadata: Metadata = { title: 'La mia settimana' };
export const dynamic = 'force-dynamic';

export default async function MiaSettimanaPage({
  searchParams,
}: {
  searchParams: { lun?: string };
}) {
  const ctx = await guardMobile();
  if (!(await tenantHasModule('dipendenti'))) notFound();
  const supabase = createServerSupabase();

  const oggi = romeDay(new Date());
  const lunRaw = searchParams.lun;
  const lunedi =
    lunRaw && /^\d{4}-\d{2}-\d{2}$/.test(lunRaw) ? lunediDellaSettimana(lunRaw) : lunediDellaSettimana(oggi);
  const domenica = addGiorni(lunedi, 6);

  // Dipendente dell'utente loggato.
  const { data: dipRow } = await supabase
    .from('dipendenti' as never)
    .select('id')
    .eq('tenant_id', ctx.tenantId)
    .eq('user_id', ctx.userId)
    .maybeSingle();
  const mioDip = (dipRow as { id: string } | null)?.id ?? null;

  const [blocchiRaw, mezziRes, dipRes] = await Promise.all([
    caricaBlocchiRange(supabase, ctx.tenantId, lunedi, domenica),
    supabase.from('mezzi' as never).select('id, targa').eq('tenant_id', ctx.tenantId),
    supabase.from('dipendenti' as never).select('id, nome, cognome').eq('tenant_id', ctx.tenantId),
  ]);

  const mezziMap = new Map(
    ((mezziRes.data ?? []) as unknown as { id: string; targa: string }[]).map((m) => [m.id, m.targa]),
  );
  const dipMap = new Map(
    ((dipRes.data ?? []) as unknown as { id: string; nome: string; cognome: string }[]).map((d) => [
      d.id,
      `${d.nome} ${d.cognome}`.trim(),
    ]),
  );

  // Solo i miei blocchi pubblicati.
  const miei = mioDip
    ? blocchiRaw.filter((b) => b.stato === 'pubblicato' && b.membri.includes(mioDip))
    : [];
  const giorni = giorniSettimana(lunedi);
  const perGiorno = new Map<string, typeof miei>();
  for (const g of giorni) perGiorno.set(g, []);
  for (const b of miei) perGiorno.get(b.data)?.push(b);

  const fmtRange = `${etichettaGiorno(lunedi)} · ${etichettaGiorno(domenica)}`;

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="mt-2">
        <h1 className="flex items-center gap-2 text-lg font-semibold">
          <CalendarDays className="h-5 w-5 text-primary" />
          La mia settimana
        </h1>
        <div className="mt-2 flex items-center justify-between gap-2">
          <Link
            href={`/mobile/pianificazione?lun=${addGiorni(lunedi, -7)}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card"
            aria-label="Settimana precedente"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="text-sm font-medium text-muted-foreground">{fmtRange}</span>
          <Link
            href={`/mobile/pianificazione?lun=${addGiorni(lunedi, 7)}`}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card"
            aria-label="Settimana successiva"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {!mioDip ? (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          Il tuo account non è collegato a una scheda dipendente. Chiedi all&apos;ufficio.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {giorni.map((g, i) => {
            const items = perGiorno.get(g) ?? [];
            const isOggi = g === oggi;
            return (
              <section
                key={g}
                className={
                  'rounded-xl border bg-card p-3 ' +
                  (isOggi ? 'border-primary/40 ring-1 ring-primary/20' : 'border-border')
                }
              >
                <div className="mb-2 flex items-baseline justify-between">
                  <h2 className="text-sm font-semibold">
                    {NOMI_GIORNO_BREVI[i]} {etichettaGiorno(g)}
                    {isOggi ? (
                      <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                        oggi
                      </span>
                    ) : null}
                  </h2>
                </div>
                {items.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessuna assegnazione.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {items.map((b) => {
                      const nome =
                        b.tipo === 'cantiere'
                          ? b.cantiereNome
                            ? titoloCase(b.cantiereNome)
                            : 'Cantiere'
                          : b.titolo ?? 'Evento';
                      const colleghi = b.membri
                        .filter((d) => d !== mioDip)
                        .map((d) => dipMap.get(d))
                        .filter(Boolean);
                      const targhe = b.mezzi.map((m) => mezziMap.get(m)).filter(Boolean);
                      return (
                        <div key={b.id} className="rounded-lg bg-muted/40 p-2.5">
                          <div className="flex items-center gap-2">
                            {b.tipo === 'evento' ? (
                              <GraduationCap className="h-4 w-4 shrink-0 text-primary" />
                            ) : (
                              <HardHat className="h-4 w-4 shrink-0 text-primary" />
                            )}
                            <span className="min-w-0 flex-1 truncate text-sm font-medium">{nome}</span>
                            <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                              {b.oraInizio}-{b.oraFine}
                            </span>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-6 text-[11px] text-muted-foreground">
                            <span>{LABEL_FASCIA[b.fascia]}</span>
                            {b.tipo === 'evento' && b.luogo ? <span>{b.luogo}</span> : null}
                            {targhe.length > 0 ? (
                              <span className="inline-flex items-center gap-1">
                                <Truck className="h-3 w-3" /> {targhe.join(', ')}
                              </span>
                            ) : null}
                            {colleghi.length > 0 ? <span>con {colleghi.join(', ')}</span> : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function etichettaGiorno(iso: string): string {
  const [Y, M, D] = iso.split('-').map(Number);
  return new Date(Date.UTC(Y!, M! - 1, D!)).toLocaleDateString('it-IT', {
    day: 'numeric',
    month: 'short',
    timeZone: 'Europe/Rome',
  });
}
