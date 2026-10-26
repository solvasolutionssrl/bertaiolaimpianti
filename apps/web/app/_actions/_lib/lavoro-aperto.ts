import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import type { createServiceSupabase } from '@kommessa/api/service';
import { MESSAGGIO_FASE_RICHIESTA, messaggioFaseRichiesta } from '@kommessa/api/sottocantieri';
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
 * Le fasi scelte (23/10/2026): ognuna deve esistere, essere del SUO cantiere e
 * non chiusa. Il database rifiuterebbe comunque una fase di un altro cantiere
 * (chiave esterna composta), ma con un errore che una persona non puo' leggere.
 * Le fasi chiuse non bloccano una giornata gia' lavorata (`forzato`), come i
 * cantieri.
 */
export async function sottocantieriScrivibili(
  supa: Supa,
  luoghi: readonly { cantiereId: string; sottocantiereId?: string | null }[],
  tenantId: string,
  opts: { forzato?: boolean } = {},
): Promise<EsitoCantiere> {
  const coppie = new Map<string, string>();
  for (const l of luoghi) if (l.sottocantiereId) coppie.set(l.sottocantiereId, l.cantiereId);
  if (coppie.size === 0) return { ok: true };
  const { data } = await supa
    .from('sottocantieri' as never)
    .select('id, cantiere_id, nome, stato')
    .in('id', [...coppie.keys()])
    .eq('tenant_id', tenantId);
  const righe = (data as { id: string; cantiere_id: string; nome: string; stato: string }[] | null) ?? [];
  if (righe.length !== coppie.size) return { ok: false, error: 'SOTTOCANTIERE_NON_VALIDO' };
  if (righe.some((r) => coppie.get(r.id) !== r.cantiere_id)) return { ok: false, error: 'SOTTOCANTIERE_NON_VALIDO' };
  if (opts.forzato) return { ok: true };
  const chiusa = righe.find((r) => r.stato === 'chiuso');
  if (chiusa) return { ok: false, error: 'SOTTOCANTIERE_CHIUSO', motivo: `La fase «${chiusa.nome}» è chiusa.` };
  return { ok: true };
}

/**
 * Con `fase_obbligatoria` acceso: una riga su un cantiere che HA fasi attive
 * deve indicarne una (`FASE_RICHIESTA`). Le righe che ereditano la fase di un
 * ingresso gia' scritto non passano di qui: chi chiama le toglie dall'elenco.
 * Spento, o cantiere senza fasi: passa tutto.
 */
export async function faseRichiesta(
  supa: Supa,
  luoghi: readonly { cantiereId: string; sottocantiereId?: string | null }[],
  tenantId: string,
  /** Il verbo cambia col contesto: una spesa non si «lavora». */
  messaggio: string = MESSAGGIO_FASE_RICHIESTA,
): Promise<EsitoCantiere> {
  const senzaFase = [...new Set(luoghi.filter((l) => !l.sottocantiereId).map((l) => l.cantiereId))];
  if (senzaFase.length === 0) return { ok: true };
  const { data: modRaw } = await supa
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();
  const cfg = (modRaw as { config: Record<string, unknown> | null } | null)?.config;
  if (cfg?.['fase_obbligatoria'] !== true) return { ok: true };
  // ⚠️ Niente `limit(1)`: con una giornata su tre cantieri di cui uno a fasi,
  // rifiutare senza dire QUALE lascia la persona a indovinare.
  const { data } = await supa
    .from('sottocantieri' as never)
    .select('cantiere_id, cantieri(nome)')
    .in('cantiere_id', senzaFase)
    .eq('tenant_id', tenantId)
    .eq('stato', 'attivo');
  const righe = (data as { cantiere_id: string; cantieri?: { nome?: string | null } | null }[] | null) ?? [];
  if (righe.length > 0) {
    const nomi = [...new Set(righe.map((r) => r.cantieri?.nome ?? '').filter(Boolean))];
    return { ok: false, error: 'FASE_RICHIESTA', motivo: messaggioFaseRichiesta(nomi, messaggio) };
  }
  return { ok: true };
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
