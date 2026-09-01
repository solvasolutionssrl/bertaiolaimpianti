import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * I metodi di pagamento delle spese, gestibili dall'ufficio.
 *
 * Prima erano un elenco chiuso nel codice, ripetuto in quattro punti (prompt
 * dell'AI, schema di validazione, scheda spesa dell'app, form dell'ufficio):
 * aggiungerne uno voleva dire toccarli tutti e rifare il deploy. Ora vivono su
 * `metodi_pagamento`, uno per cliente.
 *
 * ⚠️ **Il `codice` non si tocca mai.** È il testo che finisce dentro
 * `spese.metodo_pagamento`: cambiarlo scollegherebbe le spese già registrate e
 * quelle già uscite verso il gestionale. Si rinomina soltanto il `nome`, che è
 * l'etichetta a schermo.
 *
 * Il lettore è **difensivo**: finché la migrazione non è applicata — o per un
 * cliente appena creato che non ha ancora le righe — torna i tre di sempre,
 * così nessuna schermata resta senza opzioni.
 */

export interface MetodoPagamento {
  id: string | null;
  codice: string;
  nome: string;
  attivo: boolean;
  ordine: number;
  diSistema: boolean;
}

/** I tre di partenza. Sono anche la rete se la tabella non risponde. */
export const METODI_PREDEFINITI: MetodoPagamento[] = [
  { id: null, codice: 'carta', nome: 'Carta aziendale', attivo: true, ordine: 10, diSistema: true },
  { id: null, codice: 'contanti', nome: 'Contanti', attivo: true, ordine: 20, diSistema: true },
  { id: null, codice: 'altro', nome: 'Altro', attivo: true, ordine: 30, diSistema: true },
];

/** Su cosa ripiega chi non trova niente: il primo attivo, o 'carta'. */
export const CODICE_PAGAMENTO_DI_RIPIEGO = 'carta';

type Supa = SupabaseClient<never, 'public', never>;

/**
 * Tutti i metodi del cliente, spenti compresi.
 *
 * Servono anche quelli spenti: una spesa vecchia può puntare a un metodo che
 * l'ufficio ha nel frattempo ritirato, e a schermo deve comunque leggersi col
 * suo nome invece che col codice grezzo.
 */
export async function leggiMetodiPagamento(
  supabase: Supa,
  tenantId: string,
): Promise<MetodoPagamento[]> {
  try {
    const { data, error } = await supabase
      .from('metodi_pagamento' as never)
      .select('id, codice, nome, attivo, ordine, di_sistema')
      .eq('tenant_id', tenantId)
      .order('ordine', { ascending: true })
      .order('nome', { ascending: true });

    if (error || !data || data.length === 0) return METODI_PREDEFINITI;

    return (data as unknown as {
      id: string;
      codice: string;
      nome: string;
      attivo: boolean;
      ordine: number;
      di_sistema: boolean;
    }[]).map((r) => ({
      id: r.id,
      codice: r.codice,
      nome: r.nome,
      attivo: r.attivo,
      ordine: r.ordine,
      diSistema: r.di_sistema,
    }));
  } catch {
    // Tabella non ancora migrata: si va avanti coi tre di sempre.
    return METODI_PREDEFINITI;
  }
}

/** Solo quelli scegliibili adesso: è questo che vedono l'app e l'AI. */
export async function leggiMetodiAttivi(
  supabase: Supa,
  tenantId: string,
): Promise<MetodoPagamento[]> {
  const tutti = await leggiMetodiPagamento(supabase, tenantId);
  const attivi = tutti.filter((m) => m.attivo);
  // Se l'ufficio li spegne tutti, meglio i predefiniti che una tendina vuota.
  return attivi.length > 0 ? attivi : METODI_PREDEFINITI;
}

/**
 * Da «Bonifico bancario» a `bonifico_bancario`.
 *
 * Il codice si genera una volta sola, alla creazione, e da lì è per sempre:
 * rinominare il metodo NON lo rigenera.
 */
export function codiceDaNome(nome: string): string {
  const base = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base.length >= 2 ? base : `metodo_${Date.now().toString(36).slice(-6)}`;
}

/** L'etichetta da mostrare per un codice salvato su una spesa. */
export function nomeMetodo(metodi: MetodoPagamento[], codice: string | null): string {
  if (!codice) return '—';
  return metodi.find((m) => m.codice === codice)?.nome ?? codice;
}
