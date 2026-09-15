import { createServerSupabase } from '@kommessa/api/server';
import { leggiTutto, leggiPerId, type EsitoPagina } from '@kommessa/api/pagine';
import { requireTenantContext } from '@kommessa/api/tenant';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { leggiCollegamenti } from '@/app/_lib/integrazione/collegati';
import { GIORNI_ETICHETTA_NUOVO } from '@/app/_lib/integrazione/promuovi';
import { CantieriClient } from './_components/cantieri-client';

/** Una pagina di righe da `leggiTutto`: il builder di supabase-js tipizzato a mano. */
type Pagina<T> = PromiseLike<EsitoPagina<T>>;

export const dynamic = 'force-dynamic';

export interface CantiereRow {
  id: string;
  codice: string;
  codice_commessa: string | null;
  nome: string;
  cliente_nome: string | null;
  indirizzo: string | null;
  categoria: string | null;
  indirizzo_da_verificare: boolean;
  stato: 'attivo' | 'sospeso' | 'chiuso';
  commessaTitolo: string | null;
  nPersone: number;
  haQr: boolean;
  /** Identificativo sul gestionale del cliente, se il cantiere è collegato. */
  externalId: string | null;
  /**
   * Nato da una lettura del gestionale negli ultimi giorni. Si calcola qui e
   * non nel client: un `Date.now()` nel render di un componente SSRato
   * produce un testo diverso fra server e browser.
   */
  nuovoDalGestionale: boolean;
}

export interface CommessaOption {
  id: string;
  titolo: string;
}

export default async function CantieriPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // 1. Carica tutti i cantieri del tenant
  // Tutti, a pagine: i cantieri creati dal gestionale crescono e il database ne
  // restituisce al massimo 1000 per richiesta, senza avvisare.
  const cantieriRaw = await leggiTutto<Record<string, unknown>>(
    (da, a) =>
      supabase
        .from('cantieri' as never)
        .select(
          'id, codice, codice_commessa, nome, cliente_nome, indirizzo, categoria, indirizzo_da_verificare, stato, commessa_id, origine_gestionale_al',
        )
        .eq('tenant_id', ctx.tenantId)
        .order('codice')
        .order('id')
        .range(da, a) as unknown as Pagina<Record<string, unknown>>,
    { contesto: 'cantieri: elenco' },
  );

  const cantieri = cantieriRaw as unknown as {
    id: string;
    codice: string;
    codice_commessa: string | null;
    nome: string;
    cliente_nome: string | null;
    indirizzo: string | null;
    categoria: string | null;
    indirizzo_da_verificare: boolean | null;
    stato: 'attivo' | 'sospeso' | 'chiuso';
    commessa_id: string | null;
    origine_gestionale_al: string | null;
  }[];

  const ids = cantieri.map((c) => c.id);
  const commessaIds = [...new Set(cantieri.map((c) => c.commessa_id).filter(Boolean))] as string[];

  // 2. Batch: conteggio persone per cantiere
  const personeCounts: Record<string, number> = {};
  if (ids.length > 0) {
    // Id di tutti i cantieri: a gruppi (URL) e ogni gruppo a pagine.
    const squadra = await leggiPerId(
      ids,
      (gruppo, da, a) =>
        supabase
          .from('cantiere_squadra' as never)
          .select('cantiere_id')
          .in('cantiere_id', gruppo)
          .order('cantiere_id')
          .order('dipendente_id')
          .range(da, a) as unknown as Pagina<{ cantiere_id: string }>,
      { contesto: 'cantieri: squadre' },
    );
    for (const r of squadra) {
      personeCounts[r.cantiere_id] = (personeCounts[r.cantiere_id] ?? 0) + 1;
    }
  }

  // 3. Batch: set di cantiere_id con QR attivo
  const qrSet = new Set<string>();
  if (ids.length > 0) {
    const qrRows = await leggiPerId(
      ids,
      (gruppo, da, a) =>
        supabase
          .from('cantiere_qr' as never)
          .select('cantiere_id')
          .eq('attivo', true)
          .in('cantiere_id', gruppo)
          .order('id')
          .range(da, a) as unknown as Pagina<{ cantiere_id: string }>,
      { contesto: 'cantieri: QR attivi' },
    );
    for (const r of qrRows) {
      qrSet.add(r.cantiere_id);
    }
  }

  // 4. Batch: titoli commesse collegate
  const commessaTitoliMap: Record<string, string> = {};
  if (commessaIds.length > 0) {
    const commesseRaw = await leggiPerId(
      commessaIds,
      (gruppo, da, a) =>
        supabase
          .from('commesse')
          .select('id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
          .in('id', gruppo)
          .order('id')
          .range(da, a) as unknown as Pagina<Record<string, unknown>>,
      { contesto: 'cantieri: commesse collegate' },
    );
    for (const c of commesseRaw as unknown as {
      id: string;
      codice_interno: string | null;
      nome_cartella: string | null;
      descrizione_ai_finale: string | null;
      descrizione_ai_proposta: string | null;
      note_iniziali: string | null;
    }[]) {
      commessaTitoliMap[c.id] =
        risolviTitoloCommessa({
          descrizione_ai_finale: c.descrizione_ai_finale,
          descrizione_ai_proposta: c.descrizione_ai_proposta,
          note_iniziali: c.note_iniziali,
          nome_cartella: c.nome_cartella,
          codice_interno: c.codice_interno,
        }) || c.codice_interno || c.id;
    }
  }

  // 5. Carica commesse disponibili per il picker nel dialog di creazione
  const commesseDisp = await leggiTutto<Record<string, unknown>>(
    (da, a) =>
      supabase
        .from('commesse')
        .select('id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
        .eq('tenant_id', ctx.tenantId)
        .order('codice_interno')
        .order('id')
        .range(da, a) as unknown as Pagina<Record<string, unknown>>,
    { contesto: 'cantieri: commesse per il collegamento' },
  );

  const commesse: CommessaOption[] = (
    commesseDisp as unknown as {
      id: string;
      codice_interno: string | null;
      nome_cartella: string | null;
      descrizione_ai_finale: string | null;
      descrizione_ai_proposta: string | null;
      note_iniziali: string | null;
    }[]
  ).map((c) => ({
    id: c.id,
    titolo:
      risolviTitoloCommessa({
        descrizione_ai_finale: c.descrizione_ai_finale,
        descrizione_ai_proposta: c.descrizione_ai_proposta,
        note_iniziali: c.note_iniziali,
        nome_cartella: c.nome_cartella,
        codice_interno: c.codice_interno,
      }) || c.codice_interno || c.id,
  }));

  // 6. Chi è collegato al gestionale del cliente (fail-soft: se il modulo è
  //    spento torna vuoto e la nuvoletta non compare da nessuna parte).
  const collegamenti = await leggiCollegamenti(supabase, ctx.tenantId, ids);
  const sogliaNuovo = Date.now() - GIORNI_ETICHETTA_NUOVO * 86_400_000;

  // Valori del gestionale in attesa di smistamento: accendono il pallino sul
  // tasto Categorie, così la coda non resta invisibile finché non ci si entra.
  let daSmistare = 0;
  if (collegamenti.attiva && collegamenti.sistema) {
    const { count } = await supabase
      .from('categoria_mappature' as never)
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', ctx.tenantId)
      .eq('sistema', collegamenti.sistema)
      .is('categoria_id', null);
    daSmistare = count ?? 0;
  }

  // 7. Assembla le righe
  const rows: CantiereRow[] = cantieri.map((c) => ({
    id: c.id,
    codice: c.codice,
    codice_commessa: c.codice_commessa,
    nome: c.nome,
    cliente_nome: c.cliente_nome,
    indirizzo: c.indirizzo,
    categoria: c.categoria,
    indirizzo_da_verificare: Boolean(c.indirizzo_da_verificare),
    stato: c.stato,
    commessaTitolo: c.commessa_id ? (commessaTitoliMap[c.commessa_id] ?? null) : null,
    nPersone: personeCounts[c.id] ?? 0,
    haQr: qrSet.has(c.id),
    externalId: collegamenti.externalPerId.get(c.id) ?? null,
    nuovoDalGestionale:
      !!c.origine_gestionale_al &&
      new Date(c.origine_gestionale_al).getTime() > sogliaNuovo,
  }));

  return (
    <div className="w-full space-y-5">
      <header>
        <h1 className="text-lg font-semibold">Cantieri</h1>
        <p className="text-sm text-muted-foreground">
          Siti di lavoro. Un cantiere può essere indipendente o collegato a una commessa.
        </p>
      </header>
      <CantieriClient
        rows={rows}
        commesse={commesse}
        gestionaleAttivo={collegamenti.attiva}
        daSmistare={daSmistare}
      />
    </div>
  );
}
