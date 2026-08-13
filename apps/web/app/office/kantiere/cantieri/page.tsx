import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { risolviTitoloCommessa } from '@/app/_lib/commessa-display';
import { leggiCollegamenti } from '@/app/_lib/integrazione-collegati';
import { CantieriClient } from './_components/cantieri-client';

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
}

export interface CommessaOption {
  id: string;
  titolo: string;
}

export default async function CantieriPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  // 1. Carica tutti i cantieri del tenant
  const { data: cantieriRaw } = await supabase
    .from('cantieri' as never)
    .select(
      'id, codice, codice_commessa, nome, cliente_nome, indirizzo, categoria, indirizzo_da_verificare, stato, commessa_id',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('codice');

  const cantieri = (cantieriRaw ?? []) as {
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
  }[];

  const ids = cantieri.map((c) => c.id);
  const commessaIds = [...new Set(cantieri.map((c) => c.commessa_id).filter(Boolean))] as string[];

  // 2. Batch: conteggio persone per cantiere
  const personeCounts: Record<string, number> = {};
  if (ids.length > 0) {
    const { data: squadra } = await supabase
      .from('cantiere_squadra' as never)
      .select('cantiere_id')
      .in('cantiere_id', ids);
    for (const r of (squadra ?? []) as { cantiere_id: string }[]) {
      personeCounts[r.cantiere_id] = (personeCounts[r.cantiere_id] ?? 0) + 1;
    }
  }

  // 3. Batch: set di cantiere_id con QR attivo
  const qrSet = new Set<string>();
  if (ids.length > 0) {
    const { data: qrRows } = await supabase
      .from('cantiere_qr' as never)
      .select('cantiere_id')
      .eq('attivo', true)
      .in('cantiere_id', ids);
    for (const r of (qrRows ?? []) as { cantiere_id: string }[]) {
      qrSet.add(r.cantiere_id);
    }
  }

  // 4. Batch: titoli commesse collegate
  const commessaTitoliMap: Record<string, string> = {};
  if (commessaIds.length > 0) {
    const { data: commesseRaw } = await supabase
      .from('commesse')
      .select('id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
      .in('id', commessaIds);
    for (const c of (commesseRaw ?? []) as {
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
  const { data: commesseDisp } = await supabase
    .from('commesse')
    .select('id, codice_interno, nome_cartella, descrizione_ai_finale, descrizione_ai_proposta, note_iniziali')
    .eq('tenant_id', ctx.tenantId)
    .order('codice_interno');

  const commesse: CommessaOption[] = (
    (commesseDisp ?? []) as {
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
        sistemaGestionale={collegamenti.attiva ? collegamenti.sistema : null}
      />
    </div>
  );
}
