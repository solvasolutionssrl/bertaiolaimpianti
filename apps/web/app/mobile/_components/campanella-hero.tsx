'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';

import { useRealtimeUnread } from './use-realtime-unread';

/**
 * La campanella in alto a destra, dentro l'intestazione blu della home.
 *
 * ## Perché dentro l'intestazione e non fissa sullo schermo
 *
 * La campanella fissa esiste già, ma vive solo nell'area Kantiere, dove la
 * fascia in alto è libera. Nel mondo commesse quella fascia è contesa: la
 * scheda di una commessa ci mette il menu «⋯», e un elemento `fixed` ci
 * finirebbe sopra. Messa dentro l'intestazione, la campanella sta dove uno la
 * cerca e non litiga con niente: scorre con la pagina, non ha bisogno di
 * calcoli sul notch, e compare solo dove ha senso.
 *
 * Il numero è lo stesso della barra in basso e si aggiorna da solo: due numeri
 * sulla stessa schermata che dicono cose diverse sono peggio di un numero solo.
 */
export function CampanellaHero({
  userId,
  tenantId,
  initialCount,
}: {
  userId: string;
  tenantId: string;
  initialCount: number;
}) {
  const nonLette = useRealtimeUnread({
    userId,
    tenantId,
    initialCount,
    canale: 'campanella',
  });

  return (
    <Link
      href="/mobile/notifiche"
      aria-label={nonLette > 0 ? `Notifiche, ${nonLette} da leggere` : 'Notifiche'}
      className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-primary-foreground/25 bg-primary-foreground/10 text-primary-foreground transition active:scale-95"
    >
      <Bell className="h-[18px] w-[18px]" aria-hidden="true" />
      {nonLette > 0 ? (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] font-bold leading-none tabular-nums text-accent-foreground shadow">
          {nonLette > 99 ? '99+' : nonLette}
        </span>
      ) : null}
    </Link>
  );
}
