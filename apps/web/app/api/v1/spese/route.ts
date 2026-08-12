import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';
import {
  categoriaSpesaCanonica,
  risolviCommessa,
  type MondoTenant,
} from '@kommessa/api/integrazione-mappa';

import {
  autenticaApi,
  erroreApi,
  impagina,
  leggiParametri,
  rispostaElenco,
  soloGiorno,
} from '../_lib/api';
import {
  caricaMappature,
  clienteDelleCommesse,
  esportazioniPerLotto,
  inviabile,
  num,
} from '../_lib/risorse';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * GET /api/v1/spese
 *
 * Le spese di cantiere, come sono state registrate. Arrivano anche le bozze e
 * quelle ancora in analisi, con lo stato in chiaro: filtrarle e' una politica,
 * e non spetta a noi.
 *
 * La categoria viaggia in due forme: `categoria` e' la nostra, fine
 * (`hotel`, `bar`, `trasporti`…), `categoriaCanonica` e' l'accorpamento in
 * macro-voci che serve alla contabilita'. Chi traduce sceglie il livello di
 * dettaglio che il suo gestionale sa reggere, invece di doverlo ricostruire.
 *
 * Parametri: `modificatoDopo`, `dal`, `al`, `cursore`, `limite`.
 */

interface SpesaDb {
  id: string;
  dipendente_id: string | null;
  cantiere_id: string | null;
  commessa_id: string | null;
  categoria: string | null;
  ragione_sociale: string | null;
  importo_totale: unknown;
  importo_iva: unknown;
  imponibile: unknown;
  valuta: string | null;
  partita_iva: string | null;
  metodo_pagamento: string | null;
  numero_documento: string | null;
  indirizzo_esercente: string | null;
  data_scontrino: string | null;
  stato: string;
  rimborsabile: boolean;
  numero_persone: number | null;
  note: string | null;
  geo_lat: unknown;
  geo_lng: unknown;
  r2_key: string | null;
  analisi_at: string | null;
  analisi_errore: string | null;
  created_at: string;
  updated_at: string;
  dipendente: {
    id: string;
    nome: string;
    cognome: string;
    codice_interno: string | null;
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

  let q = service
    .from('spese' as never)
    .select(
      'id, dipendente_id, cantiere_id, commessa_id, categoria, ragione_sociale,' +
        ' importo_totale, importo_iva, imponibile, valuta, partita_iva, metodo_pagamento,' +
        ' numero_documento, indirizzo_esercente, data_scontrino, stato, rimborsabile,' +
        ' numero_persone, note, geo_lat, geo_lng, r2_key, analisi_at, analisi_errore,' +
        ' created_at, updated_at,' +
        ' dipendente:dipendenti(id, nome, cognome, codice_interno)',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('updated_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(p.limite + 1);

  if (p.modificatoDopo) q = q.gt('updated_at', p.modificatoDopo);
  if (p.cursore) q = q.gt('updated_at', p.cursore.t);
  // Il giorno di competenza e' quello dello scontrino; se manca, quello in cui
  // e' stata registrata.
  if (p.dal) q = q.or(`data_scontrino.gte.${p.dal},and(data_scontrino.is.null,created_at.gte.${p.dal})`);
  if (p.al) q = q.or(`data_scontrino.lte.${p.al}T23:59:59,and(data_scontrino.is.null,created_at.lte.${p.al}T23:59:59)`);

  const { data, error } = await q;
  if (error) {
    return erroreApi(503, 'lettura_fallita', 'Non riesco a leggere le spese.');
  }

  const righe = (data ?? []) as unknown as SpesaDb[];
  const [mapp, clienteDi, esport] = await Promise.all([
    caricaMappature(ctx),
    clienteDelleCommesse(ctx),
    esportazioniPerLotto(ctx, 'spese', righe.map((r) => r.id)),
  ]);

  const dati = righe.map((r) => {
    const dip = Array.isArray(r.dipendente) ? r.dipendente[0] : r.dipendente;
    const lavoro = risolviCommessa(r, mondo);
    const commessaExt = lavoro ? (mapp[lavoro.entita].get(lavoro.id) ?? null) : null;

    return {
      id: r.id,
      risorsa: 'spese' as const,
      data: soloGiorno(r.data_scontrino) ?? soloGiorno(r.created_at),

      categoria: r.categoria,
      categoriaCanonica: categoriaSpesaCanonica(r.categoria),
      fornitore: r.ragione_sociale,
      partitaIva: r.partita_iva,
      indirizzoEsercente: r.indirizzo_esercente,
      numeroDocumento: r.numero_documento,

      importo: {
        totale: num(r.importo_totale),
        iva: r.importo_iva == null ? null : num(r.importo_iva),
        imponibile: r.imponibile == null ? null : num(r.imponibile),
        valuta: r.valuta ?? 'EUR',
      },
      metodoPagamento: r.metodo_pagamento,
      rimborsabile: r.rimborsabile,
      numeroPersone: r.numero_persone,
      note: r.note,

      dipendente: dip
        ? {
            id: dip.id,
            nome: dip.nome,
            cognome: dip.cognome,
            nomeCompleto: `${dip.cognome} ${dip.nome}`.trim(),
            matricola: dip.codice_interno,
            externalId: mapp.dipendente.get(dip.id) ?? null,
          }
        : null,

      commessa: lavoro
        ? {
            id: lavoro.id,
            entita: lavoro.entita,
            externalId: commessaExt,
            externalClienteId: commessaExt ? (clienteDi.get(commessaExt) ?? null) : null,
          }
        : null,

      // `bozza` = ancora in revisione o in analisi automatica. Si consegna
      // comunque: sapere che esiste una spesa non ancora confermata puo'
      // servire, ed e' il consumatore a decidere se aspettarla.
      stato: r.stato,
      confermata: r.stato === 'confermata',
      analisi: { conclusaAl: r.analisi_at, errore: r.analisi_errore },

      // Solo l'indicazione che una foto c'e': il file si chiede a parte, con
      // un permesso diverso.
      haFoto: !!r.r2_key,
      posizione:
        r.geo_lat != null && r.geo_lng != null
          ? { lat: num(r.geo_lat), lng: num(r.geo_lng) }
          : null,

      registratoAl: r.created_at,
      modificatoAl: r.updated_at,
      inviabile: inviabile(ctx, commessaExt),
      esportazioni: esport.get(r.id) ?? [],
    };
  });

  const pag = impagina(dati, p.limite, (r) => ({ t: r.modificatoAl, i: r.id }));
  return rispostaElenco(pag.dati, pag.paginazione);
}
