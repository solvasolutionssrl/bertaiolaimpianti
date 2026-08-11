import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import {
  autenticaApi,
  erroreApi,
  impagina,
  leggiParametri,
  rispostaElenco,
} from '../_lib/api';
import { caricaMappature, num } from '../_lib/risorse';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/v1/dipendenti
 *
 * L'anagrafica del personale. Arrivano anche i **non piu' in forza**, con
 * `inForza: false`: le loro ore storiche esistono ancora e vanno pur
 * attribuite a qualcuno.
 *
 * `costoOrario` c'e' perche' e' un attributo del dipendente e questa API
 * espone i dati completi — ma e' un dato sensibile: chi lo consuma decida se
 * gli serve davvero, e chi emette il token sappia che lo sta concedendo.
 */

interface DipendenteDb {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  codice_interno: string | null;
  stato_attivo: boolean;
  a_turni: boolean;
  costo_orario: unknown;
  note: string | null;
  user_id: string | null;
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
    .from('dipendenti' as never)
    .select(
      'id, nome, cognome, mansione, codice_interno, stato_attivo, a_turni,' +
        ' costo_orario, note, user_id, created_at, updated_at',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(p.limite + 1);

  if (p.modificatoDopo) q = q.gt('updated_at', p.modificatoDopo);
  if (p.cursore) q = q.gt('updated_at', p.cursore.t);

  const { data, error } = await q;
  if (error) return erroreApi(503, 'lettura_fallita', 'Non riesco a leggere i dipendenti.');

  const righe = (data ?? []) as unknown as DipendenteDb[];
  const mapp = await caricaMappature(ctx);

  const dati = righe.map((r) => ({
    id: r.id,
    risorsa: 'dipendenti' as const,
    nome: r.nome,
    cognome: r.cognome,
    nomeCompleto: `${r.cognome} ${r.nome}`.trim(),
    mansione: r.mansione,
    /** La matricola aziendale, se l'ufficio l'ha inserita. */
    matricola: r.codice_interno,
    inForza: r.stato_attivo,
    aTurni: r.a_turni,
    costoOrario: r.costo_orario == null ? null : num(r.costo_orario),
    note: r.note,
    /** Se ha un accesso all'app. L'identificativo utente non si espone. */
    haAccessoApp: !!r.user_id,
    externalId: mapp.dipendente.get(r.id) ?? null,
    collegato: mapp.dipendente.has(r.id),
    registratoAl: r.created_at,
    modificatoAl: r.updated_at,
  }));

  const pag = impagina(dati, p.limite, (r) => ({ t: r.modificatoAl, i: r.id }));
  return rispostaElenco(pag.dati, pag.paginazione);
}
