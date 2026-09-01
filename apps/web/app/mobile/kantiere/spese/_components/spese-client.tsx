'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Receipt, ChevronRight, Loader2 } from 'lucide-react';

import type { CategoriaSpesa } from '@kommessa/api/spese';
import { CATEGORIA_META } from '@/app/_components/spese/categoria';
import { PersoneBadge } from '@/app/_components/spese/persone-badge';
import { SpesaDettaglio } from './spesa-dettaglio';

export type SpesaRiga = {
  id: string;
  cantiereId: string | null;
  categoria: CategoriaSpesa;
  ragioneSociale: string | null;
  importoTotale: number | null;
  importoIva: number | null;
  imponibile: number | null;
  valuta: string | null;
  dataScontrino: string | null;
  metodoPagamento: 'contanti' | 'carta' | 'altro' | null;
  note: string | null;
  createdAt: string | null;
  hasThumb: boolean;
  hasFile: boolean;
  fotoMime: string | null;
  numeroPersone: number;
  /** 'in_elaborazione' = foto caricata, AI in cloud; 'bozza' = da verificare. */
  stato?: 'bozza' | 'confermata' | 'in_elaborazione' | null;
};

function formatImporto(importo: number | null, valuta: string | null): string {
  if (importo == null) return '—';
  try {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: valuta || 'EUR' }).format(importo);
  } catch {
    return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(importo);
  }
}

function formatData(iso: string | null): string {
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

// "YYYY-MM-DD" (Rome) per confronto giorno.
function romeDayKeyOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

function meseLabel(iso: string): string {
  const d = new Date(iso);
  const s = new Intl.DateTimeFormat('it-IT', {
    timeZone: 'Europe/Rome',
    month: 'long',
    year: 'numeric',
  }).format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

type Sezione = { key: string; label: string; items: SpesaRiga[] };

function raggruppa(spese: SpesaRiga[], todayKey: string, yesterdayKey: string): Sezione[] {
  const sezioni: Sezione[] = [];
  const byKey = new Map<string, Sezione>();
  for (const s of spese) {
    const iso = s.dataScontrino ?? s.createdAt;
    const dk = romeDayKeyOf(iso);
    let key: string;
    let label: string;
    if (dk && dk === todayKey) {
      key = 'oggi';
      label = 'Oggi';
    } else if (dk && dk === yesterdayKey) {
      key = 'ieri';
      label = 'Ieri';
    } else if (dk && iso) {
      key = `m-${dk.slice(0, 7)}`;
      label = meseLabel(iso);
    } else {
      key = 'senza-data';
      label = 'Senza data';
    }
    let sez = byKey.get(key);
    if (!sez) {
      sez = { key, label, items: [] };
      byKey.set(key, sez);
      sezioni.push(sez);
    }
    sez.items.push(s);
  }
  return sezioni;
}

export function SpeseClient({
  spese,
  cantieriNomi,
  canEdit = false,
  cantieri = [],
  metodi = [],
  todayKey,
  yesterdayKey,
}: {
  spese: SpesaRiga[];
  cantieriNomi: Record<string, string>;
  /** admin/office → dettaglio modificabile; tecnico → sola lettura. */
  canEdit?: boolean;
  cantieri?: { id: string; nome: string }[];
  /** Metodi di pagamento del cliente, gestiti da Impostazioni > Pagamenti. */
  metodi?: { codice: string; nome: string }[];
  todayKey: string;
  yesterdayKey: string;
}) {
  const [dettaglio, setDettaglio] = React.useState<SpesaRiga | null>(null);
  const router = useRouter();

  // Auto-refresh ogni 30s finché una spesa è "in elaborazione": chi resta a
  // guardare vede la ricevuta compilarsi da sola. Si ferma quando non ce ne sono.
  const inElabCount = spese.filter((s) => s.stato === 'in_elaborazione').length;
  React.useEffect(() => {
    if (inElabCount === 0) return;
    const t = setInterval(() => router.refresh(), 30000);
    return () => clearInterval(t);
  }, [inElabCount, router]);

  if (spese.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center">
        <span className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Receipt className="h-5 w-5" aria-hidden="true" />
        </span>
        <p className="text-sm font-medium text-foreground">Nessuna spesa ancora.</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Scatta la prima ricevuta.</p>
      </div>
    );
  }

  const sezioni = raggruppa(spese, todayKey, yesterdayKey);

  return (
    <div className="space-y-5">
      {sezioni.map((sez) => (
        <section key={sez.key}>
          <h2 className="mb-1.5 px-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
            {sez.label}
          </h2>
          <ul className="space-y-2.5">
            {sez.items.map((s) => {
              const meta = CATEGORIA_META[s.categoria];
              const cantiereNome = s.cantiereId ? cantieriNomi[s.cantiereId] : null;
              const data = formatData(s.dataScontrino ?? s.createdAt);
              const inElab = s.stato === 'in_elaborazione';
              return (
                <li
                  key={s.id}
                  onClick={() => setDettaglio(s)}
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-soft transition-transform active:scale-[0.99]"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border border-border bg-muted/40">
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
                        <Receipt className="h-5 w-5" aria-hidden="true" />
                      </span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-foreground">
                      {s.ragioneSociale || (inElab ? 'Ricevuta caricata' : 'Spesa')}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {inElab ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.06] px-2 py-0.5 text-[11px] font-medium text-primary">
                          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
                          In elaborazione…
                        </span>
                      ) : meta ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}
                        >
                          {meta.label}
                        </span>
                      ) : null}
                      <span className="truncate text-xs text-muted-foreground">
                        {cantiereNome || 'Da assegnare'}
                      </span>
                    </div>
                    {data ? <p className="mt-0.5 text-xs text-muted-foreground">{data}</p> : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-1.5">
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {inElab && s.importoTotale == null ? (
                          <span className="text-xs font-medium text-muted-foreground">In analisi</span>
                        ) : (
                          formatImporto(s.importoTotale, s.valuta)
                        )}
                      </p>
                      {!inElab ? (
                        <div className="mt-1 flex justify-end">
                          <PersoneBadge numero={s.numeroPersone} />
                        </div>
                      ) : null}
                    </div>
                    <ChevronRight
                      className="h-4 w-4 shrink-0 text-muted-foreground/50"
                      aria-hidden="true"
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <SpesaDettaglio
        metodi={metodi}
        spesa={dettaglio}
        cantieriNomi={cantieriNomi}
        canEdit={canEdit}
        cantieri={cantieri}
        onClose={() => setDettaglio(null)}
      />
    </div>
  );
}
