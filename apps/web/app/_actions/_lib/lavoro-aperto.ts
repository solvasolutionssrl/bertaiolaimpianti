import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import type { createServiceSupabase } from '@kommessa/api/service';
import {
  COMMESSA_CHIUSA,
  cantiereImputabile,
  commessaImputabile,
  motivoCantiereChiuso,
  motivoCommessaChiusa,
} from '@kommessa/api/stato-lavoro';

/**
 * Il guardiano: su un cantiere chiuso non si scrive.
 *
 * Prima di questo file la difesa stava solo negli elenchi, cioe' da nessuna
 * parte: ogni punto di scrittura verificava il tenant e mai lo stato, quindi
 * bastava un id per registrare ore, spese o timbrature su un lavoro finito.
 * Con l'arrivo delle commesse chiuse dal gestionale (centinaia in una notte)
 * sarebbe diventato il caso normale.
 *
 * Regola unica, un punto solo: **chiuso non accetta scritture nuove**. Chi
 * aggiunge un flusso domani passa di qui e la eredita.
 *
 * ## La forzatura
 *
 * L'ufficio, da computer, puo' sempre scrivere: gli si chiede conferma e si
 * passa `forzato: true`. Il caso «ho lavorato oggi su un cantiere chiuso ieri»
 * e' reale, e a saperlo e' l'ufficio, non chi e' in cantiere. **Dall'app la
 * forzatura non esiste**: nessun flusso del tecnico deve poterla chiedere.
 *
 * Un turno gia' aperto si chiude sempre, chiuso o no il cantiere: lasciare a
 * meta' una giornata vera sarebbe il danno peggiore. Per questo il guardiano
 * si mette sull'**apertura** di qualcosa di nuovo, mai sulla chiusura.
 */

type Supa = ReturnType<typeof createServerSupabase> | ReturnType<typeof createServiceSupabase>;

/**
 * Unione discriminata, non un oggetto con tutto opzionale: cosi' dopo un
 * `if (!esito.ok) return { error: esito.error }` il compilatore sa che quel
 * codice c'e' davvero, e i chiamanti non devono difendersi da un `undefined`
 * che non puo' esistere.
 */
export type EsitoCantiere =
  | {
      ok: true;
      nome?: string;
      /** La commessa collegata, se il chiamante la stava gia' cercando. */
      commessaId?: string | null;
    }
  | {
      ok: false;
      /** Codice, non frase: la UI decide come dirlo. */
      error: string;
      /** Il motivo in italiano, pronto da mostrare quando serve il dettaglio. */
      motivo?: string;
      nome?: string;
    };

interface RigaCantiere {
  id: string;
  nome: string | null;
  stato: string | null;
  commessa_id?: string | null;
}

/**
 * Un cantiere: esiste, e' di questo tenant, e accetta ancora scritture.
 *
 * Sostituisce la coppia `.select('id') + .eq('tenant_id')` ripetuta in giro,
 * che verificava solo la prima meta' della domanda.
 */
export async function cantiereScrivibile(
  supa: Supa,
  cantiereId: string,
  tenantId: string,
  opts: { forzato?: boolean } = {},
): Promise<EsitoCantiere> {
  const { data } = await supa
    .from('cantieri' as never)
    .select('id, nome, stato, commessa_id')
    .eq('id', cantiereId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const riga = data as RigaCantiere | null;
  if (!riga) return { ok: false, error: 'CANTIERE_NON_VALIDO' };

  if (!opts.forzato && !cantiereImputabile(riga.stato)) {
    return {
      ok: false,
      error: 'CANTIERE_CHIUSO',
      motivo: motivoCantiereChiuso(riga.nome),
      nome: riga.nome ?? undefined,
    };
  }

  return { ok: true, nome: riga.nome ?? undefined, commessaId: riga.commessa_id ?? null };
}

/**
 * Piu' cantieri in un colpo (split di fine turno, Registra giornata).
 *
 * Basta uno chiuso perche' la registrazione non parta: meglio fermarsi prima
 * che scrivere meta' giornata e lasciare l'altra meta' per strada.
 */
export async function cantieriScrivibili(
  supa: Supa,
  cantiereIds: readonly string[],
  tenantId: string,
  opts: { forzato?: boolean } = {},
): Promise<EsitoCantiere> {
  const ids = [...new Set(cantiereIds)];
  if (ids.length === 0) return { ok: true };

  const { data } = await supa
    .from('cantieri' as never)
    .select('id, nome, stato')
    .in('id', ids)
    .eq('tenant_id', tenantId);

  const righe = (data as RigaCantiere[] | null) ?? [];
  if (righe.length !== ids.length) return { ok: false, error: 'CANTIERE_NON_VALIDO' };

  if (opts.forzato) return { ok: true };

  const chiuso = righe.find((r) => !cantiereImputabile(r.stato));
  if (chiuso) {
    return {
      ok: false,
      error: 'CANTIERE_CHIUSO',
      motivo: motivoCantiereChiuso(chiuso.nome),
      nome: chiuso.nome ?? undefined,
    };
  }

  return { ok: true };
}

/**
 * Lo stesso guardiano, per il mondo commesse.
 *
 * Valeva anche qui il difetto di partenza: ogni punto di scrittura guardava il
 * tenant e mai lo stato, quindi bastava tenere aperta la scheda di un lavoro
 * gia' chiuso per continuare ad attaccarci foto, attivita' e riunioni.
 *
 * `completata` e `archiviata` si consultano e basta. La differenza fra le due
 * e' **dove si vedono** (la seconda sparisce dal telefono), non cosa si puo'
 * farci: per scrivere sono chiuse allo stesso modo.
 *
 * Per riaprire una commessa si cambia stato, che e' un gesto esplicito e
 * tracciato: per questo `forzato` esiste solo per simmetria con i cantieri e
 * nessun flusso lo passa. Qui non c'e' il caso «l'ho fatto ieri».
 */
export type EsitoCommessa =
  | {
      ok: true;
      /** Lo stato letto: chi lo vuole mostrare non deve rileggerlo. */
      stato?: string | null;
    }
  | {
      ok: false;
      /** Codice, non frase: la UI decide come dirlo. */
      error: string;
      /** Il motivo in italiano, pronto da mostrare quando serve il dettaglio. */
      motivo?: string;
      stato?: string | null;
    };

interface RigaCommessa {
  id: string;
  stato: string | null;
}

/**
 * Una commessa: esiste, e' di questo tenant, e accetta ancora scritture.
 *
 * Da usare quando si ha in mano solo un id. Dove la riga della commessa e'
 * gia' stata letta per altri motivi, si chiama direttamente `commessaImputabile`
 * sullo stato che si ha: una query in meno, stessa regola.
 */
export async function commessaScrivibile(
  supa: Supa,
  commessaId: string,
  tenantId: string,
  opts: { forzato?: boolean } = {},
): Promise<EsitoCommessa> {
  const { data } = await supa
    .from('commesse')
    .select('id, stato')
    .eq('id', commessaId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  const riga = data as RigaCommessa | null;
  if (!riga) return { ok: false, error: 'COMMESSA_NON_VALIDA' };

  if (!opts.forzato && !commessaImputabile(riga.stato)) {
    return {
      ok: false,
      error: COMMESSA_CHIUSA,
      motivo: motivoCommessaChiusa(riga.stato),
      stato: riga.stato,
    };
  }

  return { ok: true, stato: riga.stato };
}
