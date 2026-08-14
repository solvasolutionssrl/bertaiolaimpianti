import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';

type Supa = ReturnType<typeof createServerSupabase>;

/**
 * Chi c'è sul gestionale e da noi no.
 *
 * È lo stato **derivato** da tre insiemi — quello che il gestionale ci ha
 * depositato, quello che abbiamo già collegato, quello che l'ufficio ha
 * dichiarato non essere roba nostra — e per questo non ha una tabella sua:
 * una coda materializzata andrebbe tenuta in pari, e il giorno che qualcuno
 * collega un record da un'altra strada la coda direbbe una bugia.
 *
 * Si usa per l'avviso in anagrafica. Vale per i dipendenti oggi; l'`entita` è
 * un parametro perché domani la stessa domanda si farà sui cantieri.
 */

export interface NuovoDalGestionale {
  externalId: string;
  nome: string;
  /** Codice sul gestionale, se ce l'ha mandato. */
  externalCodice: string | null;
  /** `false` = il gestionale lo dà per chiuso / non più in forza. */
  attiva: boolean | null;
  vistoAl: string;
}

export interface IgnoratoRiga {
  externalId: string;
  etichetta: string | null;
  motivo: string | null;
}

export async function nuoviDalGestionale(
  supabase: Supa,
  tenantId: string,
  entita: 'dipendente' | 'commessa',
): Promise<{
  sistema: string | null;
  nuovi: NuovoDalGestionale[];
  ignorati: IgnoratoRiga[];
}> {
  try {
    const { data: mod } = await supabase
      .from('tenant_modules' as never)
      .select('attivo, config')
      .eq('tenant_id', tenantId)
      .eq('module_code', 'integrazione')
      .maybeSingle();

    const riga = mod as unknown as {
      attivo: boolean;
      config: Record<string, unknown> | null;
    } | null;
    if (!riga?.attivo) return { sistema: null, nuovi: [], ignorati: [] };
    const sistema =
      typeof riga.config?.sistema === 'string' ? riga.config.sistema : null;
    if (!sistema) return { sistema: null, nuovi: [], ignorati: [] };

    // L'entità nostra corrispondente: nel registro delle mappature i
    // dipendenti si chiamano come qui, le commesse diventano `cantiere` nel
    // mondo Kantiere. Un solo punto che lo sa.
    const entitaMappata = entita === 'dipendente' ? ['dipendente'] : ['cantiere', 'commessa'];

    const [staging, mappate, ignorate] = await Promise.all([
      supabase
        .from('integrazione_staging' as never)
        .select('external_id, nome, external_codice, attiva, letto_at')
        .eq('tenant_id', tenantId)
        .eq('sistema', sistema)
        .eq('entita', entita),
      supabase
        .from('integrazione_mappature' as never)
        .select('external_id')
        .eq('tenant_id', tenantId)
        .eq('sistema', sistema)
        .in('entita', entitaMappata),
      supabase
        .from('integrazione_ignorati' as never)
        .select('external_id, etichetta, motivo')
        .eq('tenant_id', tenantId)
        .eq('sistema', sistema)
        .eq('entita', entita)
        .order('etichetta'),
    ]);

    const fuori = new Set([
      ...((mappate.data ?? []) as unknown as { external_id: string }[]).map((r) => r.external_id),
      ...((ignorate.data ?? []) as unknown as { external_id: string }[]).map((r) => r.external_id),
    ]);

    const ignorati: IgnoratoRiga[] = (
      (ignorate.data ?? []) as unknown as {
        external_id: string;
        etichetta: string | null;
        motivo: string | null;
      }[]
    ).map((r) => ({ externalId: r.external_id, etichetta: r.etichetta, motivo: r.motivo }));

    const nuovi = ((staging.data ?? []) as unknown as {
      external_id: string;
      nome: string | null;
      external_codice: string | null;
      attiva: boolean | null;
      letto_at: string;
    }[])
      .filter((r) => !fuori.has(r.external_id))
      .map((r) => ({
        externalId: r.external_id,
        nome: r.nome ?? r.external_id,
        externalCodice: r.external_codice,
        attiva: r.attiva,
        vistoAl: r.letto_at,
      }))
      // Prima chi il gestionale dà per attivo: è quello su cui si rischia di
      // perdere ore vere. Chi è già chiuso là fuori può aspettare.
      .sort(
        (a, b) =>
          Number(b.attiva !== false) - Number(a.attiva !== false) ||
          a.nome.localeCompare(b.nome),
      );

    return { sistema, nuovi, ignorati };
  } catch {
    // Fail-soft: l'anagrafica dipendenti serve tutti i giorni, l'avviso no.
    return { sistema: null, nuovi: [], ignorati: [] };
  }
}
