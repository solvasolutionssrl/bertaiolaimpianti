import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';
import { risolviCommessa, type MondoTenant } from '@kommessa/api/integrazione-mappa';

import {
  autenticaApi,
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
 * **Le tre quote restano separate** — ordinarie, straordinarie, viaggio — e
 * non si sommano mai. Su quasi ogni gestionale sono causali diverse, e la
 * somma perderebbe proprio l'informazione che serve alle paghe. Chi le vuole
 * insieme le somma; chi ha sommato non puo' piu' separarle.
 *
 * Parametri: `modificatoDopo`, `dal`, `al`, `cursore`, `limite`.
 */

interface RigaDb {
  id: string;
  cantiere_id: string | null;
  commessa_id: string | null;
  ore_ordinarie: unknown;
  ore_straordinarie: unknown;
  ore_viaggio: unknown;
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

  // Si ordina e si pagina su `rapportini.updated_at`: e' il momento in cui la
  // giornata e' stata toccata l'ultima volta, quindi quello che serve a chi
  // vuole solo le novita'. Le righe non hanno un `updated_at` proprio, ma
  // cambiano sempre insieme al rapportino che le contiene.
  let q = service
    .from('rapportino_righe' as never)
    .select(
      'id, cantiere_id, commessa_id, ore_ordinarie, ore_straordinarie, ore_viaggio, note,' +
        ' rapportino:rapportini!inner(id, data, stato, note, approvato_at, inviato_at, updated_at, dipendente_id,' +
        ' dipendente:dipendenti(id, nome, cognome, mansione, codice_interno, stato_attivo))',
    )
    .eq('rapportino.tenant_id', ctx.tenantId)
    .order('updated_at', { referencedTable: 'rapportini', ascending: true })
    .order('id', { ascending: true })
    .limit(p.limite + 1);

  if (p.modificatoDopo) q = q.gt('rapportino.updated_at', p.modificatoDopo);
  if (p.cursore) q = q.gt('rapportino.updated_at', p.cursore.t);
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
            clienteExternalId: commessaExt
              ? (clienteDi.get(commessaExt) ?? null)
              : null,
          }
        : null,

      // Le tre quote, mai sommate. In ore decimali e in minuti: i gestionali
      // vogliono l'una o gli altri, e convertire a valle e' un'occasione di
      // errore di arrotondamento in piu'.
      ore: {
        ordinarie: ord,
        straordinarie: str,
        viaggio: via,
        totale: Math.round((ord + str + via) * 100) / 100,
      },
      minuti: {
        ordinarie: Math.round(ord * 60),
        straordinarie: Math.round(str * 60),
        viaggio: Math.round(via * 60),
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

  const pag = impagina(dati, p.limite, (r) => ({ t: r.modificatoAl, i: r.id }));
  return rispostaElenco(pag.dati, pag.paginazione);
}
