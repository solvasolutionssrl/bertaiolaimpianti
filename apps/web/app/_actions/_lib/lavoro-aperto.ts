import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import type { createServiceSupabase } from '@kommessa/api/service';
import {
  cantiereImputabile,
  motivoCantiereChiuso,
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
type EsitoCantiere =
  | {
      ok: true;
      /** La commessa collegata, se il chiamante la stava gia' cercando. */
      commessaId?: string | null;
    }
  | {
      ok: false;
      /** Codice, non frase: la UI decide come dirlo. */
      error: string;
      /** Il motivo in italiano, pronto da mostrare quando serve il dettaglio. */
      motivo?: string;
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
    };
  }

  return { ok: true, commessaId: riga.commessa_id ?? null };
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
    };
  }

  return { ok: true };
}
