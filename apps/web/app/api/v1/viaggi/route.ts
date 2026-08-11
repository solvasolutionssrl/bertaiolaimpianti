import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

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
 * GET /api/v1/viaggi
 *
 * I tragitti: chilometri e tempo, con partenza, arrivo, mezzo e ruolo.
 *
 * **Arrivano anche i passeggeri.** Su quasi ogni contabilita' i km si
 * rimborsano solo a chi guida — ma «solo l'autista» resta una politica, e
 * altrove il passeggero potrebbe servire per la sicurezza o per ricostruire
 * chi c'era su quale mezzo. Il ruolo e' in chiaro in ogni record: chi non ne
 * ha bisogno lo scarta con una riga.
 *
 * La partenza puo' essere una **sede** oppure un **altro cantiere** (gli
 * spostamenti fra cantieri nella stessa giornata): entrambe compaiono, e
 * `tipoPartenza` dice quale delle due.
 *
 * Parametri: `modificatoDopo`, `dal`, `al`, `cursore`, `limite`.
 */

interface ViaggioDb {
  id: string;
  data: string | null;
  direzione: string;
  distanza_km: unknown;
  durata_stimata_min: number | null;
  durata_confermata_min: number;
  autista: boolean;
  giustificazione: string | null;
  cantiere_id: string | null;
  da_cantiere_id: string | null;
  sede_id: string | null;
  mezzo_id: string | null;
  dipendente_id: string;
  timbratura_id: string | null;
  created_at: string;
  dipendente: {
    id: string;
    nome: string;
    cognome: string;
    codice_interno: string | null;
  } | null;
  sede: { id: string; nome: string; indirizzo: string | null } | null;
  mezzo: { id: string; targa: string | null; modello: string | null } | null;
}

export async function GET(request: NextRequest) {
  const g = await autenticaApi(request);
  if (!g.ok) return g.risposta;
  const ctx = g.ctx;

  const p = leggiParametri(new URL(request.url));
  if (p.errore) return erroreApi(400, 'cursore_non_valido', p.errore);

  const service = createServiceSupabase();

  // `timbratura_viaggio` non ha `updated_at`: una tratta si scrive e non si
  // ritocca. Si ordina quindi su `created_at`, che per questa risorsa e' anche
  // il momento dell'ultima modifica.
  let q = service
    .from('timbratura_viaggio' as never)
    .select(
      'id, data, direzione, distanza_km, durata_stimata_min, durata_confermata_min,' +
        ' autista, giustificazione, cantiere_id, da_cantiere_id, sede_id, mezzo_id,' +
        ' dipendente_id, timbratura_id, created_at,' +
        ' dipendente:dipendenti(id, nome, cognome, codice_interno),' +
        ' sede:sedi(id, nome, indirizzo),' +
        ' mezzo:mezzi(id, targa, modello)',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(p.limite + 1);

  if (p.modificatoDopo) q = q.gt('created_at', p.modificatoDopo);
  if (p.cursore) q = q.gt('created_at', p.cursore.t);
  if (p.dal) q = q.gte('data', p.dal);
  if (p.al) q = q.lte('data', p.al);

  const { data, error } = await q;
  if (error) {
    return erroreApi(503, 'lettura_fallita', 'Non riesco a leggere i viaggi.');
  }

  const righe = (data ?? []) as unknown as ViaggioDb[];

  // I nomi dei cantieri servono per la partenza e l'arrivo: senza, chi legge
  // vede due identificativi e non capisce di che tratta si tratta.
  const idCantieri = [
    ...new Set(
      righe.flatMap((r) => [r.cantiere_id, r.da_cantiere_id]).filter((x): x is string => !!x),
    ),
  ];
  const { data: cantRaw } = idCantieri.length
    ? await service
        .from('cantieri' as never)
        .select('id, nome, codice, codice_commessa')
        .in('id', idCantieri)
    : { data: [] };
  const cantieri = new Map(
    ((cantRaw ?? []) as unknown as {
      id: string;
      nome: string;
      codice: string;
      codice_commessa: string | null;
    }[]).map((c) => [c.id, c]),
  );

  const [mapp, clienteDi, esport] = await Promise.all([
    caricaMappature(ctx),
    clienteDelleCommesse(ctx),
    esportazioniPerLotto(ctx, 'viaggi', righe.map((r) => r.id)),
  ]);

  const rifCantiere = (id: string | null) => {
    if (!id) return null;
    const c = cantieri.get(id);
    return {
      id,
      nome: c?.nome ?? null,
      codice: c?.codice ?? null,
      externalId: mapp.cantiere.get(id) ?? null,
    };
  };

  const dati = righe.map((r) => {
    const dip = Array.isArray(r.dipendente) ? r.dipendente[0] : r.dipendente;
    const sede = Array.isArray(r.sede) ? r.sede[0] : r.sede;
    const mezzo = Array.isArray(r.mezzo) ? r.mezzo[0] : r.mezzo;
    // I km si imputano sempre alla DESTINAZIONE, anche negli spostamenti fra
    // cantieri: e' il cantiere che ha causato lo spostamento a sostenerne il
    // costo.
    const destinazione = rifCantiere(r.cantiere_id);
    const commessaExt = destinazione?.externalId ?? null;

    return {
      id: r.id,
      risorsa: 'viaggi' as const,
      data: r.data,
      direzione: r.direzione,

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

      ruolo: r.autista ? ('autista' as const) : ('passeggero' as const),

      partenza: r.da_cantiere_id
        ? { tipo: 'cantiere' as const, ...rifCantiere(r.da_cantiere_id) }
        : sede
          ? {
              tipo: 'sede' as const,
              id: sede.id,
              nome: sede.nome,
              indirizzo: sede.indirizzo,
            }
          : null,
      arrivo: destinazione,

      commessa: destinazione
        ? {
            id: destinazione.id,
            entita: 'cantiere' as const,
            externalId: commessaExt,
            clienteExternalId: commessaExt ? (clienteDi.get(commessaExt) ?? null) : null,
          }
        : null,

      km: num(r.distanza_km),
      // Due tempi: quello stimato dal calcolo percorso e quello riconosciuto.
      // `confermata = 0` vuol dire tratta registrata ma non pagata — succede
      // sugli spostamenti fra cantieri quando il tenant non li conteggia.
      tempo: {
        stimatoMin: r.durata_stimata_min,
        confermatoMin: r.durata_confermata_min,
        confermatoLeggibile: oreHMM(r.durata_confermata_min),
      },
      mezzo: mezzo ? { id: mezzo.id, targa: mezzo.targa, modello: mezzo.modello } : null,
      giustificazione: r.giustificazione,
      timbraturaId: r.timbratura_id,

      registratoAl: r.created_at,
      modificatoAl: r.created_at,
      inviabile: inviabile(ctx, commessaExt),
      esportazioni: esport.get(r.id) ?? [],
    };
  });

  const pag = impagina(dati, p.limite, (r) => ({ t: r.modificatoAl, i: r.id }));
  return rispostaElenco(pag.dati, pag.paginazione);
}
