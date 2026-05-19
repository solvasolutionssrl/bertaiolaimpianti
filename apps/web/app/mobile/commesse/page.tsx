import Link from 'next/link';
import type { Metadata } from 'next';
import { ChevronRight, MapPin } from 'lucide-react';

import { createServerSupabase } from '@impiantixplus/api/server';
import { StatoBadge } from '@impiantixplus/ui';
import type { StatoCommessa } from '@impiantixplus/api/types';
import { getMobileShell } from '@impiantixplus/api/types';

import { guardMobile } from '../_lib/guard';
import { redirect } from 'next/navigation';

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

export default async function MobileCommessePage() {
  const ctx = await guardMobile();

  // Questa pagina è solo per il shell gestione. Tecnici → torna a home.
  if (getMobileShell(ctx.role) !== 'gestione') {
    redirect('/mobile');
  }

  const supabase = createServerSupabase();

  const { data, error } = await supabase
    .from('commesse')
    .select(
      `
        id,
        codice_interno,
        nome_cartella,
        stato,
        cliente_indirizzo_cantiere,
        data_apertura,
        cliente:clienti ( id, ragione_sociale ),
        responsabile:responsabile_id ( id, display_name )
      `,
    )
    .in('stato', ['aperta', 'in_corso', 'collaudo', 'bozza'])
    .order('data_apertura', { ascending: false })
    .limit(50);

  if (error) {
    return (
      <div className="m-4 rounded-xl border border-destructive/30 bg-destructive/10 p-6">
        <p className="font-semibold text-destructive">Errore di caricamento</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: CommessaRow[] = ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    codice_interno: r.codice_interno,
    nome_cartella: r.nome_cartella,
    stato: r.stato as StatoCommessa,
    cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
    data_apertura: r.data_apertura,
    cliente: Array.isArray(r.cliente) ? (r.cliente[0] ?? null) : (r.cliente as CommessaRow['cliente']),
    responsabile: Array.isArray(r.responsabile) ? (r.responsabile[0] ?? null) : (r.responsabile as CommessaRow['responsabile']),
  }));

  const countByStato = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.stato] = (acc[r.stato] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex min-h-[100dvh] flex-col gap-4 p-4">
      <header className="pt-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          · Gestione · Tutte ·
        </p>
        <h1 className="mt-1 text-[26px] font-semibold leading-none tracking-tight">Commesse</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {rows.length === 0 ? 'Nessuna commessa.' : `${rows.length} commesse attive`}
        </p>
      </header>

      {/* Stato summary pills */}
      {rows.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(countByStato).map(([stato, count]) => (
            <span
              key={stato}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground"
            >
              <StatoBadge stato={stato as StatoCommessa} hideEmoji />
              <span className="ml-0.5 font-bold text-foreground">{count}</span>
            </span>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/30 p-8 text-center">
          <p className="text-sm text-muted-foreground">Nessuna commessa attiva.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {rows.map((c) => (
            <li key={c.id}>
              <Link
                href={`/mobile/commessa/${c.id}`}
                className="block rounded-xl border border-border bg-card p-4 shadow-sm transition-colors active:bg-muted"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {c.codice_interno}
                      </span>
                      <StatoBadge stato={c.stato} hideEmoji />
                    </div>
                    <p className="mt-1 truncate text-base font-medium text-foreground">
                      {c.cliente?.ragione_sociale ?? c.nome_cartella}
                    </p>
                    {c.cliente_indirizzo_cantiere ? (
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span className="truncate">{c.cliente_indirizzo_cantiere}</span>
                      </p>
                    ) : null}
                    {c.responsabile ? (
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/70">
                        Resp: {c.responsabile.display_name ?? '—'}
                      </p>
                    ) : null}
                  </div>
                  <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
