import 'server-only';
import { redirect } from 'next/navigation';

import { isKantiereOnly } from '@/app/_lib/app-mode';

/**
 * Pagine del mondo commesse (commesse, nuova commessa, sopralluogo, turno,
 * caricamenti, scheda commessa): per i tenant solo Kantiere non esistono.
 * Si torna a /mobile, dove il middleware porta alla home Kantiere del ruolo.
 *
 * Va chiamata dopo `guardMobile`. Se il contesto non si legge (sessione assente
 * o incerta) non decide niente: ci pensa la guardia della pagina.
 */
export async function soloMondoCommesse(): Promise<void> {
  let soloKantiere = false;
  try {
    soloKantiere = await isKantiereOnly();
  } catch {
    return;
  }
  if (soloKantiere) redirect('/mobile');
}
