import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import {
  autenticaApi,
  erroreApi,
  impagina,
  leggiParametri,
  rispostaElenco,
} from '../_lib/api';
import { caricaMappature, clienteDelleCommesse, num } from '../_lib/risorse';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/v1/cantieri
 *
 * L'anagrafica dei cantieri come la tiene Kommessa: posizione, referente,
 * categoria, sede di partenza. Serve a chi vuole rispecchiarla altrove, o
 * semplicemente a mostrare un nome accanto a un identificativo.
 *
 * ⚠️ Due codici, da non confondere:
 * - **`codice`** e' il NOSTRO, progressivo e interno (`CAN-00190`);
 * - **`codiceCommessa`** e' quello del cliente o del suo gestionale (`26084`).
 *
 * Scambiarli significa scrivere nella numerazione sbagliata, ed e' un errore
 * che non da' nessun segnale finche' i conti non tornano.
 */

interface CantiereDb {
  id: string;
  codice: string;
  nome: string;
  codice_commessa: string | null;
  cliente_nome: string | null;
  categoria: string | null;
  stato: string;
  indirizzo: string | null;
  indirizzo_lat: unknown;
  indirizzo_lng: unknown;
  indirizzo_da_verificare: boolean;
  sede_partenza: string | null;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export async function GET(request: NextRequest) {
  const g = await autenticaApi(request);
  if (!g.ok) return g.risposta;
  const ctx = g.ctx;

  const p = leggiParametri(new URL(request.url));
  if (p.errore) return erroreApi(400, 'cursore_non_valido', p.errore);

  const service = createServiceSupabase();
  let q = service
    .from('cantieri' as never)
    .select(
      'id, codice, nome, codice_commessa, cliente_nome, categoria, stato, indirizzo,' +
        ' indirizzo_lat, indirizzo_lng, indirizzo_da_verificare, sede_partenza, note,' +
        ' created_at, updated_at',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(p.limite + 1);

  if (p.modificatoDopo) q = q.gt('updated_at', p.modificatoDopo);
  if (p.cursore) q = q.gt('updated_at', p.cursore.t);

  const { data, error } = await q;
  if (error) return erroreApi(503, 'lettura_fallita', 'Non riesco a leggere i cantieri.');

  const righe = (data ?? []) as unknown as CantiereDb[];
  const [mapp, clienteDi] = await Promise.all([
    caricaMappature(ctx),
    clienteDelleCommesse(ctx),
  ]);

  const dati = righe.map((r) => {
    const externalId = mapp.cantiere.get(r.id) ?? null;
    return {
      id: r.id,
      risorsa: 'cantieri' as const,
      codice: r.codice,
      codiceCommessa: r.codice_commessa,
      nome: r.nome,
      cliente: r.cliente_nome,
      categoria: r.categoria,
      stato: r.stato,
      indirizzo: {
        testo: r.indirizzo,
        lat: r.indirizzo_lat == null ? null : num(r.indirizzo_lat),
        lng: r.indirizzo_lng == null ? null : num(r.indirizzo_lng),
        daVerificare: r.indirizzo_da_verificare,
      },
      sedePartenza: r.sede_partenza,
      note: r.note,
      externalId,
      clienteExternalId: externalId ? (clienteDi.get(externalId) ?? null) : null,
      collegato: !!externalId,
      registratoAl: r.created_at,
      modificatoAl: r.updated_at,
    };
  });

  const pag = impagina(dati, p.limite, (r) => ({ t: r.modificatoAl, i: r.id }));
  return rispostaElenco(pag.dati, pag.paginazione);
}
