import 'server-only';

import type { createServerSupabase } from '@kommessa/api/server';
import { etichettaLuogo } from '@kommessa/api/sottocantieri';

/** Il client del server o quello di servizio: la query e' la stessa. */
type Supa = ReturnType<typeof createServerSupabase>;

export interface SottocantiereNome {
  id: string;
  cantiereId: string;
  nome: string;
  codice: string | null;
  stato: string;
}

/**
 * I nomi delle fasi di un cliente, per chi deve scrivere «Cantiere › Fase».
 * Con `ids` legge solo quelle; senza, tutte quelle del cliente (sono poche
 * decine per cantiere, non un elenco di migliaia).
 */
export async function nomiSottocantieri(supabase: Supa, tenantId: string, ids?: readonly (string | null | undefined)[]): Promise<Map<string, SottocantiereNome>> {
  const out = new Map<string, SottocantiereNome>();
  const lista = ids ? [...new Set(ids.filter((x): x is string => !!x))] : null;
  if (lista && lista.length === 0) return out;
  for (let i = 0; i < (lista ? lista.length : 1); i += 100) {
    let q = supabase.from('sottocantieri' as never).select('id, cantiere_id, nome, codice, stato').eq('tenant_id', tenantId);
    if (lista) q = q.in('id', lista.slice(i, i + 100));
    const { data } = await q;
    for (const r of (data as { id: string; cantiere_id: string; nome: string; codice: string | null; stato: string }[] | null) ?? []) {
      out.set(r.id, { id: r.id, cantiereId: r.cantiere_id, nome: r.nome, codice: r.codice, stato: r.stato });
    }
  }
  return out;
}

/** «Cantiere › Fase» dato il nome del cantiere e la mappa delle fasi. */
export function etichettaConFase(nomeCantiere: string, sottocantiereId: string | null | undefined, fasi: Map<string, SottocantiereNome>): string {
  const f = sottocantiereId ? fasi.get(sottocantiereId) : null;
  return etichettaLuogo(nomeCantiere, f?.nome ?? null);
}
