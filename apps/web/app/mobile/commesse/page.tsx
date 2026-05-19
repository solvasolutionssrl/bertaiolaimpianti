import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { createServerSupabase } from '@impiantixplus/api/server';
import type { StatoCommessa } from '@impiantixplus/api/types';
import { getMobileShell } from '@impiantixplus/api/types';

import { guardMobile } from '../_lib/guard';
import { Hero, HeroMeta } from '../_components/blueprint';
import { CommesseBrowser, type BrowserRow } from './_components/commesse-browser';

export const metadata: Metadata = {
  title: 'Tutte le commesse',
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
    .limit(120);

  if (error) {
    return (
      <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-6">
        <p className="font-semibold text-destructive">Errore di caricamento</p>
        <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
      </div>
    );
  }

  const rows: BrowserRow[] = ((data ?? []) as any[]).map((r) => {
    const cli = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente;
    const resp = Array.isArray(r.responsabile) ? r.responsabile[0] : r.responsabile;
    return {
      id: r.id,
      codice_interno: r.codice_interno,
      nome_cartella: r.nome_cartella,
      stato: r.stato as StatoCommessa,
      cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
      data_apertura: r.data_apertura,
      cliente_nome: cli?.ragione_sociale ?? null,
      responsabile_nome: resp?.display_name ?? null,
    };
  });

  const countByStato = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.stato] = (acc[r.stato] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex min-h-[100dvh] flex-col pb-24">
      {/* Hero dark */}
      <Hero>
        <HeroMeta>Gestione · Tutte le commesse</HeroMeta>
        <h1 className="mt-2 font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
          COMMESSE
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/70">
          {rows.length === 0
            ? 'Nessuna commessa.'
            : `${rows.length} attive nel tenant`}
        </p>
      </Hero>

      {/* Browser flottante che fa overlap sull'hero */}
      <div className="-mt-8 px-4 animate-fade-up [animation-delay:40ms]">
        <CommesseBrowser rows={rows} countByStato={countByStato} />
      </div>
    </div>
  );
}
