/** Etichetta UI che distingue dipendenti con login app da quelli solo-timbratura. */
export function etichettaAccesso(d: { user_id?: string | null }): 'Con accesso' | 'Solo timbratura' {
  return d.user_id ? 'Con accesso' : 'Solo timbratura';
}

/** Prossimo codice dipendente progressivo per-tenant: DIP-001, DIP-002, … */
export function prossimoCodiceDipendente(
  codiciEsistenti: (string | null | undefined)[],
): string {
  let max = 0;
  for (const c of codiciEsistenti) {
    const m = typeof c === 'string' ? c.match(/^DIP-(\d+)$/) : null;
    if (m && m[1] !== undefined) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `DIP-${String(max + 1).padStart(3, '0')}`;
}

/** Autorizzazione pura: chi può timbrare per chi.
 *  - sé stesso: sempre;
 *  - capo squadra su quella commessa: solo per membri della sua squadra. */
export function puoTimbrarePer(args: {
  self: boolean;
  capoSquadra: boolean;
  bersaglioInSquadra: boolean;
}): boolean {
  return args.self || (args.capoSquadra && args.bersaglioInSquadra);
}

/** Prossimo codice cantiere progressivo per-tenant: CAN-001, CAN-002, … */
export function prossimoCodiceCantiere(
  codiciEsistenti: (string | null | undefined)[],
): string {
  let max = 0;
  for (const c of codiciEsistenti) {
    const m = typeof c === 'string' ? c.match(/^CAN-(\d+)$/) : null;
    if (m && m[1] !== undefined) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return `CAN-${String(max + 1).padStart(3, '0')}`;
}

/** Risolve il target di una timbratura: cantiere ha priorità su commessa (difensivo).
 *  Restituisce null se nessuno dei due è valorizzato. */
export function targetTimbratura(row: {
  commessa_id: string | null;
  cantiere_id: string | null;
}): { tipo: 'commessa' | 'cantiere'; id: string } | null {
  if (row.cantiere_id) return { tipo: 'cantiere', id: row.cantiere_id };
  if (row.commessa_id) return { tipo: 'commessa', id: row.commessa_id };
  return null;
}
