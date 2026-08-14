import { Suspense } from 'react';

import { RiprovaClient } from './riprova-client';

/**
 * «Un attimo, riprendo il collegamento.»
 *
 * Ci si finisce quando il server non è riuscito a verificare la sessione ma i
 * cookie ci sono ancora — tipicamente l'app riaperta dopo ore, o un buco di
 * campo in cantiere. Prima in quel caso si tornava alla schermata di accesso:
 * password da riscrivere, turno da riprendere, e la sensazione che l'app ti
 * abbia mollato. Invece la sessione era viva: bastava rinnovarla.
 *
 * Qui il rinnovo lo fa il browser, che il biglietto ce l'ha, e poi si torna
 * esattamente dov'eravamo. Solo se dopo tre tentativi non se ne esce si passa
 * dall'accesso — a quel punto è un problema vero e va detto.
 */
export const dynamic = 'force-dynamic';

export default function RiprovaPage() {
  return (
    <Suspense fallback={null}>
      <RiprovaClient />
    </Suspense>
  );
}
