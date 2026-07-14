'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Receipt, ChevronRight, Loader2 } from 'lucide-react';

import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import { NuovaSpesa } from './nuova-spesa';
import { SpesaDettaglio } from './spesa-dettaglio';
import type { SpesaRiga } from './spese-client';
import type { PickerCantiere } from '@/app/mobile/kantiere/_components/cantiere-picker';

function fmtImporto(n: number | null, valuta: string | null): string {
  if (n == null) return '—';
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta || 'EUR' }).format(n);
  } catch {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(n);
  }
}

function fmtData(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(d);
}

/**
 * Panoramica spese in "area personale" (profilo Kantiere, admin/office): le
 * ultime spese come card cliccabili che aprono DIRETTAMENTE il dettaglio
 * (niente "Vedi tutte" → poi apri), + aggiungi + link a tutte.
 */
export function SpesePanoramica({
  spese,
  cantieriNomi,
  canEdit,
  cantieri,
  cantieriPicker,
  turnoCantiereId = null,
  turnoCantiereNome = null,
  dipendenteId,
}: {
  spese: SpesaRiga[];
  cantieriNomi: Record<string, string>;
  canEdit: boolean;
  /** formato semplice per il picker di modifica del dettaglio */
  cantieri: { id: string; nome: string }[];
  /** formato ricerca per la nuova spesa (cantiere prima della foto) */
  cantieriPicker: PickerCantiere[];
  turnoCantiereId?: string | null;
  turnoCantiereNome?: string | null;
  dipendenteId: string | null;
}) {
  const [sel, setSel] = React.useState<SpesaRiga | null>(null);
  const router = useRouter();

  // Se c'è almeno una spesa "in elaborazione" (foto caricata, AI ancora in
  // corso), aggiorna la pagina ogni 30s: chi resta a guardare vede la spesa
  // completarsi da sola senza dover ricaricare. Si ferma quando non ce ne sono più.
  const inElabCount = spese.filter((s) => s.stato === 'in_elaborazione').length;
  React.useEffect(() => {
    if (inElabCount === 0) return;
    const t = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(t);
  }, [inElabCount, router]);

  return (
    <section className="rounded-xl border border-border bg-card p-4 shadow-soft">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary">
          <Receipt className="h-3.5 w-3.5" aria-hidden="true" />
          Le tue spese
        </p>
        <Link
          href="/mobile/kantiere/spese"
          className="flex items-center gap-0.5 text-xs font-medium text-primary active:opacity-70"
        >
          Vedi tutte
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      {spese.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {spese.map((s) => {
            const inElab = s.stato === 'in_elaborazione';
            return (
              <li
                key={s.id}
                onClick={() => setSel(s)}
                className={
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-transform active:scale-[0.99] ' +
                  (inElab ? 'border-primary/25 bg-primary/[0.05]' : 'border-border bg-background')
                }
              >
                <div
                  className={
                    'h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-muted/40 ' +
                    (inElab ? 'border-primary/25' : 'border-border')
                  }
                >
                  {s.hasThumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/api/kantiere/spese/${s.id}/foto?size=thumb`}
                      alt=""
                      className={'h-full w-full object-cover ' + (inElab ? 'opacity-70' : '')}
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Receipt className="h-4 w-4" aria-hidden="true" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  {inElab ? (
                    <>
                      <p className="truncate text-sm font-semibold text-primary">In elaborazione…</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                        Analisi in corso
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="truncate text-sm font-medium text-foreground">
                        {s.ragioneSociale || CATEGORIA_META[s.categoria]?.label || 'Spesa'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtData(s.dataScontrino ?? s.createdAt)}
                      </p>
                    </>
                  )}
                </div>
                {inElab ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
                ) : (
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                    {fmtImporto(s.importoTotale, s.valuta)}
                  </span>
                )}
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Nessuna spesa registrata.</p>
      )}

      {dipendenteId ? (
        <div className="mt-3">
          <NuovaSpesa
            cantieri={cantieriPicker}
            turnoCantiereId={turnoCantiereId}
            turnoCantiereNome={turnoCantiereNome}
            triggerVariant="quick"
          />
        </div>
      ) : null}

      <SpesaDettaglio
        spesa={sel}
        cantieriNomi={cantieriNomi}
        canEdit={canEdit}
        cantieri={cantieri}
        onClose={() => setSel(null)}
      />
    </section>
  );
}
