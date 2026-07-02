'use client';

import * as React from 'react';
import Link from 'next/link';
import { Receipt, ChevronRight } from 'lucide-react';

import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import { NuovaSpesa } from './nuova-spesa';
import { SpesaDettaglio } from './spesa-dettaglio';
import type { SpesaRiga } from './spese-client';

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
  dipendenteId,
}: {
  spese: SpesaRiga[];
  cantieriNomi: Record<string, string>;
  canEdit: boolean;
  cantieri: { id: string; nome: string }[];
  dipendenteId: string | null;
}) {
  const [sel, setSel] = React.useState<SpesaRiga | null>(null);

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
          {spese.map((s) => (
            <li
              key={s.id}
              onClick={() => setSel(s)}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border bg-background p-2.5 transition-transform active:scale-[0.99]"
            >
              <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
                {s.hasThumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`/api/kantiere/spese/${s.id}/foto?size=thumb`}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Receipt className="h-4 w-4" aria-hidden="true" />
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {s.ragioneSociale || CATEGORIA_META[s.categoria]?.label || 'Spesa'}
                </p>
                <p className="text-xs text-muted-foreground">{fmtData(s.dataScontrino ?? s.createdAt)}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {fmtImporto(s.importoTotale, s.valuta)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden="true" />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">Nessuna spesa registrata.</p>
      )}

      {dipendenteId ? (
        <div className="mt-3">
          <NuovaSpesa
            adminMode
            cantieri={cantieri}
            dipendenteId={dipendenteId}
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
