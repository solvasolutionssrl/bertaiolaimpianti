import { type NextRequest } from 'next/server';
import { quoteDaRiga, quoteOre } from '@kommessa/api/kantiere-quote';

import { createServiceSupabase } from '@kommessa/api/service';
import { risolviCommessa, type MondoTenant } from '@kommessa/api/integrazione-mappa';

import {
  autenticaApi,
  daCursore,
  erroreApi,
  impagina,
  leggiParametri,
  rispostaElenco,
} from '../_lib/api';
import {
  caricaMappature,
  clienteDelleCommesse,
  esportazioniPerLotto,
  inviabile,
  num,
  oreHMM,
} from '../_lib/risorse';
import { riferimentoFase, type SottocantiereDb } from '../_lib/sottocantieri';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/v1/ore
 *
 * Le ore lavorate, una riga per giornata e per cantiere.
 *
 * **Nessun filtro di merito.** Arrivano anche le giornate in bozza e quelle
 * respinte, con il loro stato in chiaro: decidere se una giornata non
 * approvata vada portata fuori e' una politica, e le politiche appartengono a
 * chi conosce il sistema di destinazione. Kommessa dice com'e' fatta la
 * realta', non cosa farne.
 *
 * **Le quote restano separate** e non si sommano mai. Su quasi ogni gestionale
 * sono causali diverse, e la somma perderebbe proprio l'informazione che serve
 * alle paghe. Chi le vuole insieme le somma; chi ha sommato non puo' piu'
 * separarle.
 *
 * Dati puri: `lavoro` e `viaggio`. Quote (regola del tenant, 15/09/2026):
 * `ordinarie` = lavoro entro l'orario ordinario, `straordinarie` = lavoro oltre,
 * `viaggioOrdinario` = viaggio entro l'orario ordinario rimasto, `viaggioEccedente`
 * = viaggio oltre. Le ore ordinarie retribuite sono `ordinarie + viaggioOrdinario`.
 * Le giornate precedenti alla regola hanno `viaggioOrdinario` 0 e tutto il viaggio
 * in `viaggioEccedente`.
 *
 * **L'`id` di una riga e' stabile** (dal 28/10/2026): correggere una giornata
 * aggiorna la riga dello stesso cantiere+fase invece di crearne una nuova. Un
 * id nuovo vuol dire un cantiere o una fase nuovi in quella giornata; un id che
 * sparisce, un cantiere tolto. Le righe scritte prima di quella data hanno gia'
 * cambiato id a ogni correzione.
 *
 * Parametri: `modificatoDopo`, `dal`, `al`, `cursore`, `limite`.
 */

interface RigaDb {
  id: string;
  rapportino_id: string;
  cantiere_id: string | null;
  sottocantiere_id: string | null;
  sottocantiere: SottocantiereDb | SottocantiereDb[] | null;
  commessa_id: string | null;
  ore_ordinarie: unknown;
  ore_straordinarie: unknown;
  ore_viaggio: unknown;
  minuti_lavoro: number | null;
  minuti_viaggio: number | null;
  ore_viaggio_ordinarie: unknown;
  ore_viaggio_eccedenti: unknown;
  note: string | null;
  rapportino: {
    id: string;
    data: string;
    stato: string;
    note: string | null;
    approvato_at: string | null;
    inviato_at: string | null;
    updated_at: string;
    dipendente_id: string;
    dipendente: {
      id: string;
      nome: string;
      cognome: string;
      mansione: string | null;
      codice_interno: string | null;
      stato_attivo: boolean;
    } | null;
  } | null;
}

export async function GET(request: NextRequest) {
  const g = await autenticaApi(request);
  if (!g.ok) return g.risposta;
  const ctx = g.ctx;

  const p = leggiParametri(new URL(request.url));
  if (p.errore) return erroreApi(400, 'cursore_non_valido', p.errore);

  const service = createServiceSupabase();

  const { data: tRaw } = await service
    .from('tenants')
    .select('app_mode')
    .eq('id', ctx.tenantId)
    .maybeSingle();
  const mondo = (((tRaw as unknown as { app_mode: string } | null)?.app_mode ??
    'kantiere') as MondoTenant);

  // ⚠️ Si ordina e si pagina su colonne di PRIMO livello: `(rapportino_id, id)`.
  //
  // Fino al 22/10/2026 questa rotta credeva di ordinare per
  // `rapportini.updated_at` con `.order(..., { referencedTable })`: PostgREST
  // pero' con quello ordina l'embed DENTRO ogni riga — un oggetto solo, quindi
  // niente — e le righe arrivavano ordinate per `id` e basta. Il cursore
  // `(updated_at, id)` filtrava su una chiave che non era l'ordine vero:
  // misurato, paginando a 5 restituiva 21 righe su 358 con 8 doppioni.
  //
  // La chiave e' ora `(rapportino_id, id)`: entrambe sulla tabella delle righe,
  // stabile, e il cursore e' opaco per chi legge (l'agente lo rimanda e basta).
  // `modificatoDopo` resta il filtro «solo le novita'» su `rapportini.updated_at`:
  // e' un filtro, non un ordine, e come filtro funziona.
  let q = service
    .from('rapportino_righe' as never)
    .select(
      'id, rapportino_id, cantiere_id, sottocantiere_id, commessa_id, ore_ordinarie, ore_straordinarie, ore_viaggio,' +
        ' minuti_lavoro, minuti_viaggio, ore_viaggio_ordinarie, ore_viaggio_eccedenti, note,' +
        ' sottocantiere:sottocantieri(id, nome, codice, stato),' +
        ' rapportino:rapportini!inner(id, data, stato, note, approvato_at, inviato_at, updated_at, dipendente_id,' +
        ' dipendente:dipendenti(id, nome, cognome, mansione, codice_interno, stato_attivo))',
    )
    .eq('rapportino.tenant_id', ctx.tenantId)
    .order('rapportino_id', { ascending: true })
    .order('id', { ascending: true })
    .limit(p.limite + 1);

  if (p.modificatoDopo) q = q.gt('rapportino.updated_at', p.modificatoDopo);
  q = daCursore(q, 'rapportino_id', p.cursore);
  if (p.dal) q = q.gte('rapportino.data', p.dal);
  if (p.al) q = q.lte('rapportino.data', p.al);

  const { data, error } = await q;
  if (error) {
    return erroreApi(503, 'lettura_fallita', 'Non riesco a leggere le ore.');
  }

  const righe = ((data ?? []) as unknown as RigaDb[]).filter((r) => r.rapportino);
  const [mapp, clienteDi, esport] = await Promise.all([
    caricaMappature(ctx),
    clienteDelleCommesse(ctx),
    esportazioniPerLotto(ctx, 'ore', righe.map((r) => r.id)),
  ]);

  const dati = righe.map((r) => {
    const rap = r.rapportino!;
    const dip = Array.isArray(rap.dipendente) ? rap.dipendente[0] : rap.dipendente;
    const lavoro = risolviCommessa(r, mondo);
    const commessaExt = lavoro
      ? (mapp[lavoro.entita].get(lavoro.id) ?? null)
      : null;
    const ord = num(r.ore_ordinarie);
    const str = num(r.ore_straordinarie);
    const via = num(r.ore_viaggio);
    const q = quoteDaRiga({
      minuti_lavoro: r.minuti_lavoro,
      minuti_viaggio: r.minuti_viaggio,
      ore_ordinarie: ord,
      ore_straordinarie: str,
      ore_viaggio: via,
      ore_viaggio_ordinarie: r.ore_viaggio_ordinarie == null ? null : num(r.ore_viaggio_ordinarie),
      ore_viaggio_eccedenti: r.ore_viaggio_eccedenti == null ? null : num(r.ore_viaggio_eccedenti),
    });
    const qo = quoteOre(q);

    return {
      id: r.id,
      risorsa: 'ore' as const,
      data: rap.data,

      dipendente: dip
        ? {
            id: dip.id,
            nome: dip.nome,
            cognome: dip.cognome,
            nomeCompleto: `${dip.cognome} ${dip.nome}`.trim(),
            mansione: dip.mansione,
            matricola: dip.codice_interno,
            inForza: dip.stato_attivo,
            externalId: mapp.dipendente.get(dip.id) ?? null,
          }
        : null,

      commessa: lavoro
        ? {
            id: lavoro.id,
            // `cantiere` o `commessa` a seconda del mondo del tenant: chi
            // consuma non deve saperlo, ma chi indaga un problema si'.
            entita: lavoro.entita,
            externalId: commessaExt,
            externalClienteId: commessaExt
              ? (clienteDi.get(commessaExt) ?? null)
                : null,
          }
        : null,
      // La fase del cantiere (23/10/2026), se le ore sono state attribuite a
      // una fase. Una riga per fase: il totale per cantiere si somma a valle.
      sottocantiere: riferimentoFase(r.sottocantiere, mapp.sottocantiere),

      // Le tre quote, mai sommate. In ore decimali e in minuti: i gestionali
      // vogliono l'una o gli altri, e convertire a valle e' un'occasione di
      // errore di arrotondamento in piu'.
      ore: {
        lavoro: qo.lavoro,
        ordinarie: ord,
        straordinarie: str,
        viaggio: via,
        viaggioOrdinario: qo.viaggioOrdinario,
        viaggioEccedente: qo.viaggioEccedente,
        totale: Math.round((ord + str + via) * 100) / 100,
      },
      minuti: {
        lavoro: q.minutiLavoro,
        ordinarie: Math.round(ord * 60),
        straordinarie: Math.round(str * 60),
        viaggio: Math.round(via * 60),
        viaggioOrdinario: q.minutiViaggioOrdinari,
        viaggioEccedente: q.minutiViaggioEccedenti,
      },
      durataLeggibile: oreHMM(Math.round((ord + str + via) * 60)),

      note: r.note,
      giornata: {
        id: rap.id,
        stato: rap.stato,
        approvata: rap.stato === 'approvato' || rap.stato === 'esportato',
        approvataAl: rap.approvato_at,
        inviataAl: rap.inviato_at,
        note: rap.note,
      },

      modificatoAl: rap.updated_at,
      inviabile: inviabile(ctx, commessaExt),
      esportazioni: esport.get(r.id) ?? [],
    };
  });

  // La chiave del cursore e' l'ordine vero della query, non un campo del payload.
  const chiave = new Map(righe.map((r) => [r.id, r.rapportino_id]));
  const pag = impagina(dati, p.limite, (r) => ({ t: chiave.get(r.id) ?? '', i: r.id }));
  return rispostaElenco(pag.dati, pag.paginazione);
}
