import { type NextRequest } from 'next/server';

import { createServiceSupabase } from '@kommessa/api/service';

import {
  CONTRATTO,
  type ContestoApi,
  autenticaApi,
  erroreApi,
  impagina,
  leggiParametri,
  rispostaElenco,
} from '../_lib/api';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const RISORSE = ['ore', 'spese', 'viaggi', 'cantieri', 'dipendenti', 'clienti'] as const;
const MAX_LOTTO = 500;

/**
 * `/api/v1/scritture` — il registro di cosa e' finito su un sistema esterno.
 *
 * **Perche' esiste.** Molti gestionali non lasciano rileggere quello che hanno
 * ricevuto, e alcuni non lasciano nemmeno cancellare. In quel mondo «l'ho gia'
 * mandato?» e' la domanda piu' importante che ci sia, e non puo' avere come
 * unica risposta il giornale locale di una macchina: se quel disco muore, o se
 * l'agente viene reinstallato, ripartire da zero significa scrivere tutto due
 * volte, per sempre.
 *
 * Il registro sta quindi qui, e ogni risorsa lo espone dentro di se' nel campo
 * `esportazioni`: chi legge sa subito cosa manca, senza tenere conti propri.
 *
 * **Due tempi distinti.** `scrittoAl` e' quando il record e' arrivato davvero
 * sul sistema esterno, dichiarato da chi ce l'ha portato; `registratoAl` e'
 * quando ce l'ha detto. Lo scarto fra i due misura il ritardo del
 * collegamento, ed e' il primo indizio quando qualcosa si sta accumulando.
 *
 * POST — annuncia una o piu' scritture.
 * GET  — rilegge il registro (`modificatoDopo`, `cursore`, `limite`).
 */

interface ScritturaIn {
  risorsa: (typeof RISORSE)[number];
  risorsaId: string;
  /** Distingue piu' scritture nate dallo stesso record. Vuoto se non serve. */
  variante?: string | null;
  esito?: 'ok' | 'errore';
  /** Quando e' finito sul sistema esterno. Se assente, adesso. */
  scrittoAl?: string | null;
  /** Cosa ha risposto il sistema esterno: numero documento, protocollo... */
  externalRiferimento?: unknown;
  /** Messaggio leggibile in ufficio. Niente tracce di stack. */
  errore?: string | null;
}

/** Dove sta il cantiere, per ogni risorsa che si puo' annunciare. */
const TABELLA_PER_RISORSA: Record<string, string> = {
  ore: 'rapportino_righe',
  spese: 'spese',
  viaggi: 'timbratura_viaggio',
};

type RigaRegistro = { risorsa: string; risorsa_id: string };

/**
 * Toglie dall'annuncio le righe che appartengono a un lavoro tenuto fuori.
 *
 * Non filtra per tenant sulle tabelle di dettaglio: non serve, perche' i
 * cantieri esclusi sono gia' letti nello scope del tenant e un id di un altro
 * cliente non puo' combaciare. Al massimo si sbaglia lasciando passare, mai
 * leggendo dati altrui.
 */
async function togliEsclusi<T extends RigaRegistro>(
  service: ReturnType<typeof createServiceSupabase>,
  ctx: ContestoApi,
  righe: T[],
  scartate: Array<{ risorsaId: string; motivo: string }>,
): Promise<T[]> {
  const { data: mapRaw } = await service
    .from('integrazione_mappature' as never)
    .select('entita_id')
    .eq('tenant_id', ctx.tenantId)
    .eq('sistema', ctx.sistema!)
    .eq('entita', 'cantiere')
    .in('external_id', ctx.esclusiEsterni);

  const cantieriEsclusi = new Set(
    ((mapRaw ?? []) as unknown as { entita_id: string }[]).map((m) => m.entita_id),
  );
  if (cantieriEsclusi.size === 0) return righe;

  const cantierePerRiga = new Map<string, string | null>();
  for (const [risorsa, tabella] of Object.entries(TABELLA_PER_RISORSA)) {
    const ids = righe.filter((r) => r.risorsa === risorsa).map((r) => r.risorsa_id);
    for (let i = 0; i < ids.length; i += 100) {
      const { data } = await service
        .from(tabella as never)
        .select('id, cantiere_id')
        .in('id', ids.slice(i, i + 100));
      for (const x of (data ?? []) as unknown as { id: string; cantiere_id: string | null }[]) {
        cantierePerRiga.set(x.id, x.cantiere_id);
      }
    }
  }

  return righe.filter((r) => {
    const cantiere = cantierePerRiga.get(r.risorsa_id);
    if (cantiere && cantieriEsclusi.has(cantiere)) {
      scartate.push({
        risorsaId: r.risorsa_id,
        motivo: 'lavoro tenuto fuori dalle scritture',
      });
      return false;
    }
    return true;
  });
}

export async function POST(request: NextRequest) {
  const g = await autenticaApi(request);
  if (!g.ok) return g.risposta;
  const ctx = g.ctx;

  if (!ctx.sistema) {
    return erroreApi(
      409,
      'sistema_non_configurato',
      'Manca il sistema di destinazione nella configurazione del cliente.',
    );
  }

  let body: { scritture?: ScritturaIn[] } | null = null;
  try {
    body = (await request.json()) as { scritture?: ScritturaIn[] };
  } catch {
    return erroreApi(400, 'corpo_non_valido', 'Il corpo non è JSON valido.');
  }

  const scritture = body?.scritture;
  if (!Array.isArray(scritture) || scritture.length === 0) {
    return erroreApi(400, 'corpo_non_valido', 'Manca l’elenco `scritture`.');
  }
  if (scritture.length > MAX_LOTTO) {
    return erroreApi(
      413,
      'lotto_troppo_grande',
      `Massimo ${MAX_LOTTO} scritture per chiamata.`,
    );
  }

  const scartate: Array<{ risorsaId: string; motivo: string }> = [];
  const righe = scritture
    .filter((s) => {
      if (!s || !RISORSE.includes(s.risorsa)) {
        scartate.push({ risorsaId: String(s?.risorsaId ?? '?'), motivo: 'risorsa sconosciuta' });
        return false;
      }
      if (typeof s.risorsaId !== 'string' || !s.risorsaId.trim()) {
        scartate.push({ risorsaId: '?', motivo: 'risorsaId mancante' });
        return false;
      }
      return true;
    })
    .map((s) => ({
      tenant_id: ctx.tenantId,
      sistema: ctx.sistema!,
      risorsa: s.risorsa,
      risorsa_id: s.risorsaId.trim(),
      // Stringa vuota e non null: cosi' il vincolo di unicita' funziona senza
      // trucchi, e «nessuna variante» resta un valore come gli altri.
      variante: (s.variante ?? '').trim(),
      esito: s.esito === 'errore' ? 'errore' : 'ok',
      scritto_at: s.scrittoAl ?? new Date().toISOString(),
      external_ref: s.externalRiferimento ?? null,
      errore: s.errore?.slice(0, 2000) ?? null,
      token_id: ctx.tokenId,
      registrato_at: new Date().toISOString(),
    }));

  const service = createServiceSupabase();

  // I lavori tenuti fuori non si registrano, nemmeno se l'agente ci prova.
  // Senza questo `esclusi_esterni` resterebbe solo un'etichetta: `inviabile:
  // false` e' un consiglio dentro la risposta, e un agente che non lo guarda
  // scriverebbe lo stesso su un gestionale che non lascia cancellare. Qui il
  // rifiuto e' nostro, e non dipende da come e' fatto l'agente.
  const ammesse = ctx.esclusiEsterni.length
    ? await togliEsclusi(service, ctx, righe, scartate)
    : righe;

  if (ammesse.length === 0) {
    return erroreApi(400, 'nessuna_scrittura_valida', 'Nessuna riga utilizzabile.', {
      scartate,
    });
  }
  // `onConflict` sulla chiave naturale: riannunciare la stessa scrittura non
  // crea un doppione. E' voluto — un agente che riparte dopo un guasto deve
  // poter ripetere gli annunci senza pensarci.
  const { data, error } = await service
    .from('integrazione_scritture' as never)
    .upsert(ammesse as never, {
      onConflict: 'tenant_id,sistema,risorsa,risorsa_id,variante',
    })
    .select('id');

  if (error) {
    return erroreApi(503, 'registrazione_fallita', 'Non riesco a registrare: ' + error.message);
  }

  return Response.json({
    contratto: CONTRATTO,
    registrate: (data ?? []).length,
    scartate,
  });
}

export async function GET(request: NextRequest) {
  const g = await autenticaApi(request);
  if (!g.ok) return g.risposta;
  const ctx = g.ctx;

  const p = leggiParametri(new URL(request.url));
  if (p.errore) return erroreApi(400, 'cursore_non_valido', p.errore);

  const url = new URL(request.url);
  const risorsa = url.searchParams.get('risorsa');

  const service = createServiceSupabase();
  let q = service
    .from('integrazione_scritture' as never)
    .select(
      'id, risorsa, risorsa_id, variante, esito, external_ref, errore, scritto_at, registrato_at',
    )
    .eq('tenant_id', ctx.tenantId)
    .order('registrato_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(p.limite + 1);

  if (ctx.sistema) q = q.eq('sistema', ctx.sistema);
  if (risorsa && (RISORSE as readonly string[]).includes(risorsa)) q = q.eq('risorsa', risorsa);
  if (p.modificatoDopo) q = q.gt('registrato_at', p.modificatoDopo);
  if (p.cursore) q = q.gt('registrato_at', p.cursore.t);

  const { data, error } = await q;
  if (error) return erroreApi(503, 'lettura_fallita', 'Non riesco a leggere il registro.');

  const dati = ((data ?? []) as unknown as {
    id: string;
    risorsa: string;
    risorsa_id: string;
    variante: string;
    esito: string;
    external_ref: unknown;
    errore: string | null;
    scritto_at: string;
    registrato_at: string;
  }[]).map((r) => ({
    id: r.id,
    risorsa: r.risorsa,
    risorsaId: r.risorsa_id,
    variante: r.variante,
    esito: r.esito,
    externalRiferimento: r.external_ref,
    errore: r.errore,
    scrittoAl: r.scritto_at,
    registratoAl: r.registrato_at,
  }));

  const pag = impagina(dati, p.limite, (r) => ({ t: r.registratoAl, i: r.id }));
  return rispostaElenco(pag.dati, pag.paginazione);
}
