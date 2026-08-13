import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';

type Supa = ReturnType<typeof createServerSupabase>;

/**
 * Quali dei nostri lavori sono collegati al gestionale del cliente.
 *
 * Serve alla nuvoletta che l'ufficio vede in elenco e nella scheda. La
 * domanda dietro e' pratica: *le ore di questo cantiere finiranno sull'ERP o
 * resteranno qui?* Prima si poteva rispondere solo aprendo la pagina
 * Gestionale, cioe' quasi mai.
 *
 * Legge con il client normale (RLS): `integrazione_mappature` e
 * `tenant_modules` hanno entrambe una policy di lettura per il proprio
 * tenant, quindi non serve il service role — e non usarlo qui e' la scelta
 * giusta, perche' questa e' una lettura di comodo dentro una pagina d'ufficio.
 *
 * **Fail-soft**: se il modulo e' spento o qualcosa non torna, si restituisce
 * "nessuno collegato" e la nuvoletta semplicemente non compare. Un errore qui
 * non deve poter rompere l'elenco dei cantieri, che serve tutti i giorni
 * mentre l'integrazione la usa un cliente su due.
 */
export interface StatoCollegamenti {
  /** `false` per i tenant senza integrazione: la UI non mostra niente. */
  attiva: boolean;
  sistema: string | null;
  /** id nostro → identificativo sul gestionale. */
  externalPerId: Map<string, string>;
}

export const NESSUN_COLLEGAMENTO: StatoCollegamenti = {
  attiva: false,
  sistema: null,
  externalPerId: new Map(),
};

export async function leggiCollegamenti(
  supabase: Supa,
  tenantId: string,
  /** Se passati, si filtra su questi: in elenco sono gia' tutti quelli a schermo. */
  idNostri?: string[],
): Promise<StatoCollegamenti> {
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
    if (!riga?.attivo) return NESSUN_COLLEGAMENTO;

    const sistema =
      typeof riga.config?.sistema === 'string' ? riga.config.sistema : null;
    if (!sistema) return NESSUN_COLLEGAMENTO;

    if (idNostri && idNostri.length === 0) {
      return { attiva: true, sistema, externalPerId: new Map() };
    }

    let q = supabase
      .from('integrazione_mappature' as never)
      .select('entita_id, external_id')
      .eq('tenant_id', tenantId)
      .eq('sistema', sistema)
      .in('entita', ['cantiere', 'commessa']);
    if (idNostri) q = q.in('entita_id', idNostri);

    const { data } = await q;
    const externalPerId = new Map(
      ((data ?? []) as unknown as { entita_id: string; external_id: string }[]).map((m) => [
        m.entita_id,
        m.external_id,
      ]),
    );
    return { attiva: true, sistema, externalPerId };
  } catch {
    return NESSUN_COLLEGAMENTO;
  }
}
