import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight, MapPin, Search } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { StatoLed } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';
import { getMobileShell } from '@impiantixplus/api/types';

import { guardMobile } from '../_lib/guard';
import { SectionNumber, MetaLine, Stagger } from '../_components/blueprint';

export const metadata: Metadata = {
  title: 'Tutte le commesse',
};

interface CommessaRow {
  id: string;
  codice_interno: string;
  nome_cartella: string;
  stato: StatoCommessa;
  cliente_indirizzo_cantiere: string | null;
  data_apertura: string;
  cliente: { id: string; ragione_sociale: string } | null;
  responsabile: { id: string; display_name: string | null } | null;
}

const STATO_ORDER: StatoCommessa[] = [
  'in_corso',
  'aperta',
  'collaudo',
  'bozza',
  'completata',
  'archiviata',
];

const STATO_LABEL: Record<string, string> = {
  in_corso: 'In corso',
  aperta: 'Aperta',
  collaudo: 'Collaudo',
  bozza: 'Bozza',
  completata: 'Completata',
  archiviata: 'Archiviata',
};

export default async function MobileCommessePage() {
  const ctx = await guardMobile();

  if (getMobileShell(ctx.role) !== 'gestione') {
    redirect('/mobile');
  }

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('commesse')
    .select(
      `
        id, codice_interno, nome_cartella, stato,
        cliente_indirizzo_cantiere, data_apertura,
        cliente:clienti ( id, ragione_sociale ),
        responsabile:responsabile_id ( id, display_name )
      `,
    )
    .in('stato', ['aperta', 'in_corso', 'collaudo', 'bozza'])
    .order('data_apertura', { ascending: false })
    .limit(80);

  if (error) {
    return (
      <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-6">
        <p className="font-semibold text-destructive">Errore di caricamento</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  const rows: CommessaRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    codice_interno: r.codice_interno,
    nome_cartella: r.nome_cartella,
    stato: r.stato as StatoCommessa,
    cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
    data_apertura: r.data_apertura,
    cliente: Array.isArray(r.cliente) ? r.cliente[0] ?? null : r.cliente,
    responsabile: Array.isArray(r.responsabile) ? r.responsabile[0] ?? null : r.responsabile,
  }));

  const countByStato = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.stato] = (acc[r.stato] ?? 0) + 1;
    return acc;
  }, {});

  // Ordina per priorità stato, poi per data
  const sortedRows = [...rows].sort((a, b) => {
    const sa = STATO_ORDER.indexOf(a.stato);
    const sb = STATO_ORDER.indexOf(b.stato);
    if (sa !== sb) return sa - sb;
    return b.data_apertura.localeCompare(a.data_apertura);
  });

  return (
    <div className="flex min-h-[100dvh] flex-col gap-7 p-4 pb-24">
      {/* Hero */}
      <header className="pt-2 animate-fade-up">
        <MetaLine>Gestione · Tutte le commesse</MetaLine>
        <h1 className="mt-2 font-mono text-3xl font-bold leading-none tracking-tightest">
          COMMESSE
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {rows.length === 0 ? 'Nessuna commessa.' : `${rows.length} attive in tutto il tenant`}
        </p>
      </header>

      {/* Filtri stato */}
      {rows.length > 0 && (
        <section className="space-y-3 animate-fade-up [animation-delay:40ms]">
          <SectionNumber n={1} title="Filtra per stato" />
          <div className="flex flex-wrap gap-1.5">
            {STATO_ORDER.filter((s) => countByStato[s]).map((stato) => (
              <span
                key={stato}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5"
              >
                <StatoLed stato={stato} />
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground">
                  {STATO_LABEL[stato] ?? stato}
                </span>
                <span className="font-mono text-[10px] font-bold tabular-nums text-muted-foreground">
                  {String(countByStato[stato]).padStart(2, '0')}
                </span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Lista commesse */}
      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-8 text-center">
          <span className="mx-auto mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Search className="h-4 w-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium text-foreground">Nessuna commessa</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Le commesse compaiono qui appena vengono aperte
          </p>
        </div>
      ) : (
        <section className="space-y-3 animate-fade-up [animation-delay:80ms]">
          <SectionNumber
            n={2}
            title="Elenco"
            trailing={
              <span className="font-mono text-[10px] tabular-nums text-muted-foreground/70">
                {String(sortedRows.length).padStart(2, '0')}
              </span>
            }
          />
          <Stagger className="flex flex-col gap-2">
            {sortedRows.map((c, idx) => (
              <Link
                key={c.id}
                href={`/mobile/commessa/${c.id}`}
                className="group relative flex items-stretch gap-3 overflow-hidden rounded-lg border border-border bg-card p-3 shadow-soft transition-all active:scale-[0.99] active:bg-muted"
              >
                <span
                  aria-hidden="true"
                  className="flex w-7 shrink-0 flex-col items-center justify-center border-r border-border/60 pr-2 font-mono text-[10px] font-bold tabular-nums text-muted-foreground/60"
                >
                  {String(idx + 1).padStart(2, '0')}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatoLed stato={c.stato} />
                    <span className="font-mono text-xs font-semibold tabular-nums text-muted-foreground">
                      {c.codice_interno}
                    </span>
                  </div>
                  <p className="mt-1.5 truncate text-base font-semibold tracking-tight text-foreground">
                    {c.cliente?.ragione_sociale ?? c.nome_cartella}
                  </p>
                  {c.cliente_indirizzo_cantiere ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{c.cliente_indirizzo_cantiere}</span>
                    </p>
                  ) : null}
                  {c.responsabile?.display_name && (
                    <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground/70">
                      Resp · {c.responsabile.display_name}
                    </p>
                  )}
                </div>

                <ChevronRight
                  className="self-center h-4 w-4 shrink-0 text-muted-foreground transition-transform group-active:translate-x-0.5"
                  aria-hidden="true"
                />
              </Link>
            ))}
          </Stagger>
        </section>
      )}
    </div>
  );
}
