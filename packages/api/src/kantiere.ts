/** Etichetta UI che distingue dipendenti con login app da quelli solo-timbratura. */
export function etichettaAccesso(d: { user_id?: string | null }): 'Con accesso' | 'Solo timbratura' {
  return d.user_id ? 'Con accesso' : 'Solo timbratura';
}
