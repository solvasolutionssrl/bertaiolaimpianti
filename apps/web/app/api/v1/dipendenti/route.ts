import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import {
  autenticaApi,
  erroreApi,
  daCursore,
  impagina,
  leggiParametri,
  rispostaElenco,
} from '../_lib/api';
import { profiloDipendenti } from '@kommessa/api/scope-api';

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
 *
 * `dataNascita` esce perche' la timbratrice fa gli auguri quando la persona
 * passa il badge all'ingresso. E' un dato personale, e il token lo concede a
 * chiunque ce l'abbia.
 *
 * ⭐ **Due profili, non uno.** Un token con `leggi:dipendenti` riceve la forma
 * *base*: niente costo orario, niente note, niente identificativi del
 * gestionale. La forma *completa* la ottiene solo chi ha
 * `leggi:dipendenti:costi` oppure `integrazione`. Il motivo e' concreto: un
 * orologio da ingresso non deve tenere in memoria quanto costa ogni persona.
 *
 * ⚠️ I campi non concessi **non si mandano a null, si omettono**: un
 * `costoOrario: null` dice «non lo sappiamo», che e' falso, e chi lo mette in
 * cache registrerebbe costi a zero. E non si leggono nemmeno dal database —
 * la select cambia con il profilo, come per le superfici pubbliche.
 */

/** Le colonne della forma base: quelle che un token di sola lettura puo' vedere. */
const COLONNE_BASE =
  'id, nome, cognome, mansione, codice_interno, data_nascita,' +
  ' stato_attivo, created_at, updated_at';

/** In piu', per chi ha i costi o il gestionale. */
const COLONNE_COMPLETE = `${COLONNE_BASE}, a_turni, costo_orario, note, user_id`;

interface DipendenteDb {
  id: string;
  nome: string;
  cognome: string;
  mansione: string | null;
  codice_interno: string | null;
  data_nascita: string | null;
  stato_attivo: boolean;
  created_at: string;
  updated_at: string;
  // Presenti solo nel profilo completo: la select non le chiede nell'altro.
  a_turni?: boolean;
  costo_orario?: unknown;
  note?: string | null;
  user_id?: string | null;
}

export async function GET(request: NextRequest) {
  const g = await autenticaApi(request, 'leggi:dipendenti');
  if (!g.ok) return g.risposta;
  const ctx = g.ctx;
  const profilo = profiloDipendenti(ctx.scopes);

  const p = leggiParametri(new URL(request.url));
  if (p.errore) return erroreApi(400, 'cursore_non_valido', p.errore);

  const service = createServiceSupabase();
  let q = service
    .from('dipendenti' as never)
    .select(profilo === 'completo' ? COLONNE_COMPLETE : COLONNE_BASE)
    .eq('tenant_id', ctx.tenantId)
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(p.limite + 1);

  if (p.modificatoDopo) q = q.gt('updated_at', p.modificatoDopo);
  q = daCursore(q, 'updated_at', p.cursore);

  const { data, error } = await q;
  if (error) return erroreApi(503, 'lettura_fallita', 'Non riesco a leggere i dipendenti.');

  const righe = (data ?? []) as unknown as DipendenteDb[];
  // Le mappature sono identificativi del gestionale: non si leggono affatto
  // per un token che non lo rappresenta.
  const mapp = profilo === 'completo' ? await caricaMappature(ctx) : null;

  const dati = righe.map((r) => {
    const base = {
      id: r.id,
      risorsa: 'dipendenti' as const,
      nome: r.nome,
      cognome: r.cognome,
      nomeCompleto: `${r.cognome} ${r.nome}`.trim(),
      mansione: r.mansione,
      /** La matricola aziendale, se l'ufficio l'ha inserita. */
      matricola: r.codice_interno,
      /** `AAAA-MM-GG`, oppure null se l'ufficio non l'ha inserita. */
      dataNascita: r.data_nascita,
      inForza: r.stato_attivo,
      registratoAl: r.created_at,
      modificatoAl: r.updated_at,
    };
    if (profilo !== 'completo') return base;
    return {
      ...base,
      aTurni: !!r.a_turni,
      costoOrario: r.costo_orario == null ? null : num(r.costo_orario),
      note: r.note ?? null,
      /** Se ha un accesso all'app. L'identificativo utente non si espone. */
      haAccessoApp: !!r.user_id,
      externalId: mapp?.dipendente.get(r.id) ?? null,
      collegato: mapp?.dipendente.has(r.id) ?? false,
    };
  });

  const pag = impagina(dati, p.limite, (r) => ({ t: r.modificatoAl, i: r.id }));
  return rispostaElenco(pag.dati, pag.paginazione);
}
