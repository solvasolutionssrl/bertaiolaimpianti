import { redirect } from 'next/navigation';
import type { Metadata } from 'next';

import { createServerSupabase } from '@kommessa/api/server';
import type { StatoCommessa } from '@kommessa/api/types';
import { getMobileShell } from '@kommessa/api/types';
import { STATI_COMMESSA_SU_MOBILE } from '@kommessa/api/stato-lavoro';
import { leggiTutto, type EsitoPagina } from '@kommessa/api/pagine';

import { guardMobile } from '../_lib/guard';
import { soloMondoCommesse } from '../_lib/mondo';
import { Hero, HeroMeta } from '../_components/blueprint';
import { CommesseBrowser, type BrowserRow } from './_components/commesse-browser';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';

/**
 * Dati dell'utente, quindi sempre freschi. Next lo dedurrebbe comunque dalla
 * lettura dei cookie, ma dichiararlo rende la regola la stessa su tutte le
 * rotte dell'app invece di dipendere da cosa capita di leggere.
 */
export const dynamic = 'force-dynamic';


export const metadata: Metadata = {
  title: 'Tutte le commesse',
};

export default async function MobileCommessePage() {
  const ctx = await guardMobile();
  await soloMondoCommesse();

  if (getMobileShell(ctx.role) !== 'gestione') {
    redirect('/mobile');
  }

  const supabase = createServerSupabase();

  // ⚠️ **Qui c'era `.limit(120)` su un tenant che ne ha oltre duecento.**
  // Non era «le ultime 120 e poi si scorre»: le altre non esistevano, e
  // nemmeno la ricerca le trovava, perche' il filtro di questa pagina lavora
  // in memoria su cio' che e' arrivato. Dal computer si vedevano tutte (la
  // pagina d'ufficio e' paginata), dal telefono no: la stessa domanda aveva
  // due risposte a seconda di dove la facevi.
  //
  // Si legge tutto a pagine, come la panoramica d'ufficio. ⚠️ Il terzo
  // `.order('id')` non e' un vezzo: senza una colonna unica in coda, due
  // commesse aperte lo stesso giorno possono cambiare posto fra una pagina e
  // l'altra, e in mezzo si perde o si duplica una riga.
  let data: any[];
  try {
    data = await leggiTutto<any>(
      (da, a) =>
        supabase
          .from('commesse')
          .select(
            `
        id, codice_interno, nome_cartella, stato, is_critica,
        cliente_indirizzo_cantiere, data_apertura,
        descrizione_ai_finale, descrizione_ai_proposta, note_iniziali,
        cliente:clienti ( id, ragione_sociale ),
        responsabile:responsabile_id ( id, display_name )
      `,
          )
          // Le completate restano consultabili anche dal telefono: il lavoro e'
          // finito ma la scheda si guarda ancora. Fuori solo le archiviate — la
          // regola sta in `commessaVisibileSuMobile`, qui se ne usa la lista.
          .in('stato', [...STATI_COMMESSA_SU_MOBILE])
          .order('data_apertura', { ascending: false })
          .order('codice_interno', { ascending: false })
          .order('id')
          .range(da, a) as unknown as PromiseLike<EsitoPagina<any>>,
      { contesto: 'commesse sul telefono' },
    );
  } catch (e) {
    const messaggio = e instanceof Error ? e.message : String(e);
    return (
      <div className="m-4 rounded-lg border border-destructive/30 bg-destructive/10 p-6">
        <p className="font-semibold text-destructive">Errore di caricamento</p>
        <p className="mt-1 text-xs text-muted-foreground">{messaggio}</p>
      </div>
    );
  }

  const rows: BrowserRow[] = (data as any[]).map((r) => {
    const cli = Array.isArray(r.cliente) ? r.cliente[0] : r.cliente;
    const resp = Array.isArray(r.responsabile) ? r.responsabile[0] : r.responsabile;
    const cliente_nome = cli?.ragione_sociale ?? null;
    // Titolo "vivo": stessa logica della dashboard /mobile (pickTitolo).
    // Fallback nome_cartella ripulito da codice+cliente. Mai mostriamo
    // il nome_cartella raw del DB (è la dir Nextcloud, brutto in UI).
    const titolo = risolviTitoloCommessa({
      descrizione_ai_finale: r.descrizione_ai_finale,
      descrizione_ai_proposta: r.descrizione_ai_proposta,
      note_iniziali: r.note_iniziali,
      nome_cartella: r.nome_cartella,
      codice_interno: r.codice_interno,
      cliente_nome,
    });
    return {
      id: r.id,
      codice_interno: r.codice_interno,
      nome_cartella: r.nome_cartella,
      titolo,
      is_critica: !!r.is_critica,
      stato: r.stato as StatoCommessa,
      cliente_indirizzo_cantiere: r.cliente_indirizzo_cantiere,
      data_apertura: r.data_apertura,
      cliente_nome,
      responsabile_nome: resp?.display_name ?? null,
    };
  });

  const countByStato = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.stato] = (acc[r.stato] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="animate-content-in flex min-h-[100dvh] flex-col pb-24">
      {/* Hero dark */}
      <Hero>
        <HeroMeta>Gestione · Tutte le commesse</HeroMeta>
        <h1 className="mt-2 font-mono text-3xl font-bold leading-none tracking-tightest text-primary-foreground">
          COMMESSE
        </h1>
        <p className="mt-2 text-sm text-primary-foreground/70">
          {/* Ora e' il totale vero, non quello della pagina. E «attive» era
              sbagliato comunque: nell'elenco ci sono anche le bozze e le
              completate. */}
          {rows.length === 0
            ? 'Nessuna commessa.'
            : `${rows.length} ${rows.length === 1 ? 'commessa' : 'commesse'}`}
        </p>
      </Hero>

      {/* Browser flottante che fa overlap sull'hero */}
      <div className="-mt-8 px-4 animate-fade-up [animation-delay:40ms]">
        <CommesseBrowser rows={rows} countByStato={countByStato} />
      </div>
    </div>
  );
}
