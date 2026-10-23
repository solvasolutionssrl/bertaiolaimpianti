/**
 * Le fasi (sottocantieri) come escono dall'API, dal 23/10/2026.
 *
 * Un posto solo per la forma e l'ordine: `/cantieri` le annida nel padre,
 * `/ore` e `/spese` ne citano una per riga. Chiuse comprese: chi legge
 * distingue «chiusa» da «sparita» solo se gliela mandiamo.
 */

export interface SottocantiereDb {
  id: string;
  nome: string;
  descrizione?: string | null;
  codice: string | null;
  stato: string;
  created_at?: string;
  updated_at?: string;
}

/** Per codice (con i numeri in ordine naturale) e poi per nome. */
export function fasiOrdinate<T extends SottocantiereDb>(fasi: readonly T[] | null | undefined): T[] {
  return [...(fasi ?? [])].sort(
    (a, b) =>
      (a.codice ?? '').localeCompare(b.codice ?? '', 'it', { numeric: true }) ||
      a.nome.localeCompare(b.nome, 'it'),
  );
}

/** Il riferimento alla fase su una riga di ore o di spesa; `null` = cantiere intero. */
export function riferimentoFase(
  f: SottocantiereDb | SottocantiereDb[] | null | undefined,
  externalDi: Map<string, string>,
): { id: string; nome: string; codice: string | null; externalId: string | null } | null {
  const fase = Array.isArray(f) ? f[0] : f;
  if (!fase) return null;
  return { id: fase.id, nome: fase.nome, codice: fase.codice, externalId: externalDi.get(fase.id) ?? null };
}
