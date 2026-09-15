import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import { leggiTutto, leggiPerId, type EsitoPagina } from '@kommessa/api/pagine';

type Supa = ReturnType<typeof createServerSupabase>;

/** Una pagina di righe da `leggiTutto`: il builder di supabase-js tipizzato a mano. */
type Pagina<T> = PromiseLike<EsitoPagina<T>>;

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

    // Tutte le righe, a pagine; con gli id a schermo (centinaia di cantieri)
    // anche a gruppi, perché non stanno in un URL solo.
    type Mappatura = { entita_id: string; external_id: string };
    const base = () =>
      supabase
        .from('integrazione_mappature' as never)
        .select('entita_id, external_id')
        .eq('tenant_id', tenantId)
        .eq('sistema', sistema)
        .in('entita', ['cantiere', 'commessa']);
    const data = idNostri
      ? await leggiPerId(
          idNostri,
          (gruppo, da, a) =>
            base().in('entita_id', gruppo).order('id').range(da, a) as unknown as Pagina<Mappatura>,
          { contesto: 'collegamenti al gestionale' },
        )
      : await leggiTutto<Mappatura>(
          (da, a) => base().order('id').range(da, a) as unknown as Pagina<Mappatura>,
          { contesto: 'collegamenti al gestionale' },
        );
    const externalPerId = new Map(
      data.map((m) => [
        m.entita_id,
        m.external_id,
      ]),
    );
    return { attiva: true, sistema, externalPerId };
  } catch {
    return NESSUN_COLLEGAMENTO;
  }
}

/**
 * Cosa di questo lotto è già stato portato sul gestionale.
 *
 * Legge il **registro delle scritture**, che è l'unica fonte che sopravvive a
 * una macchina che muore: il giornale locale dell'agente no. Una query per
 * lotto, mai una per riga.
 *
 * Fail-soft come il resto: se qualcosa non torna si restituisce una mappa
 * vuota e il segno non compare. L'elenco spese serve tutti i giorni,
 * l'integrazione riguarda un cliente su due.
 */
export interface EsportazioneRiga {
  esito: string;
  scrittoAl: string;
  riferimento: unknown;
  errore: string | null;
}

export async function leggiEsportazioni(
  supabase: Supa,
  tenantId: string,
  risorsa: 'ore' | 'spese' | 'viaggi',
  idNostri: string[],
): Promise<Map<string, EsportazioneRiga[]>> {
  const out = new Map<string, EsportazioneRiga[]>();
  if (idNostri.length === 0) return out;
  try {
    type Scrittura = {
      risorsa_id: string;
      esito: string;
      scritto_at: string;
      external_ref: unknown;
      errore: string | null;
    };
    // Id a gruppi (un lotto può avere centinaia di righe) e ogni gruppo a pagine.
    const data = await leggiPerId(
      idNostri,
      (gruppo, da, a) =>
        supabase
          .from('integrazione_scritture' as never)
          .select('risorsa_id, esito, scritto_at, external_ref, errore')
          .eq('tenant_id', tenantId)
          .eq('risorsa', risorsa)
          .in('risorsa_id', gruppo)
          .order('id')
          .range(da, a) as unknown as Pagina<Scrittura>,
      { contesto: 'scritture sul gestionale' },
    );

    for (const r of data) {
      const lista = out.get(r.risorsa_id) ?? [];
      lista.push({
        esito: r.esito,
        scrittoAl: r.scritto_at,
        riferimento: r.external_ref,
        errore: r.errore,
      });
      out.set(r.risorsa_id, lista);
    }
  } catch {
    // vedi sopra: mai bloccante
  }
  return out;
}
