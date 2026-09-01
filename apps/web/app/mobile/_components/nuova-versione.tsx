'use client';

import * as React from 'react';
import { RefreshCw } from 'lucide-react';
import { Portal } from './portal';

/**
 * Avvisa che è uscita una versione nuova dell'app.
 *
 * **Perché serve.** Il service worker scarica e attiva la versione nuova, ma la
 * pagina non si ricarica: l'app resta in memoria col codice di prima. Chi tiene
 * l'app aperta — cioè chiunque, per giorni — continua a usare la versione
 * vecchia anche dopo un rilascio, e vede difetti già corretti. È successo il
 * 01/09/2026 con il foglio delle ore a mano.
 *
 * **Perché non ricarica da solo.** Qui dentro si scrivono ore e si compilano
 * scontrini: una ricarica a sorpresa cancellerebbe quello che uno sta
 * scrivendo. Quindi si avvisa e si lascia decidere. Stessa logica del
 * «mai buttare fuori per un intoppo di rete».
 */
export default function NuovaVersione() {
  const [pronta, setPronta] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    let vivo = true;

    // Il controller cambia quando la versione nuova prende il posto della
    // vecchia. Alla primissima installazione non c'era un controller prima:
    // quello non è un aggiornamento, e non va segnalato.
    const onCambio = () => {
      if (vivo) setPronta(true);
    };
    const giaControllata = !!navigator.serviceWorker.controller;
    if (giaControllata) {
      navigator.serviceWorker.addEventListener('controllerchange', onCambio);
    }

    // Un'app aperta da giorni non si accorge da sola che è uscita una versione:
    // si controlla quando torna in primo piano, senza esagerare.
    let ultimoControllo = 0;
    const controlla = async () => {
      if (document.visibilityState !== 'visible') return;
      const adesso = Date.now();
      if (adesso - ultimoControllo < 5 * 60 * 1000) return;
      ultimoControllo = adesso;
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        await reg?.update();
      } catch {
        // Offline o registrazione assente: si riproverà.
      }
    };
    document.addEventListener('visibilitychange', controlla);

    return () => {
      vivo = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onCambio);
      document.removeEventListener('visibilitychange', controlla);
    };
  }, []);

  if (!pronta) return null;

  return (
    <Portal>
      <div
        className="fixed inset-x-3 z-[60] flex items-center gap-3 rounded-xl border border-border bg-card p-3 shadow-lg"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)' }}
        role="status"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <RefreshCw className="h-4 w-4" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-foreground">
          È disponibile una versione aggiornata.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[40px] shrink-0 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground"
        >
          Aggiorna
        </button>
      </div>
    </Portal>
  );
}
