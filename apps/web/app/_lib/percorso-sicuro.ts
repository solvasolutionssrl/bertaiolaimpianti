/**
 * Dove tornare dopo login o link di accesso (`?next=`): solo percorsi interni
 * all'app. Un `next=//altro-sito.it` o `next=https://…` porterebbe l'utente,
 * appena autenticato, su un sito esterno.
 */
export function percorsoInterno(valore: string | null | undefined, predefinito: string): string {
  if (!valore) return predefinito;
  if (!valore.startsWith('/') || valore.startsWith('//') || valore.startsWith('/\\')) return predefinito;
  return valore;
}
