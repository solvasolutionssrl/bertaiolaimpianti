'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BellRing, X } from 'lucide-react';

const CHIAVE = 'kommessa.banner-notifiche.chiuso';
const GIORNI_SILENZIO = 14;

/**
 * «Attiva le notifiche»: una riga, una volta, su questo telefono.
 *
 * Perche' esiste: le notifiche sul telefono partono solo se la persona ha
 * detto si' al permesso del browser, e quel permesso si chiede **dentro un
 * tocco**. La pagina che lo fa (`/mobile/profilo/notifiche`) sta due livelli
 * sotto il profilo: nessuno ci arriva da solo, e infatti al 21/10/2026 c'era
 * una sottoscrizione sola su quattro clienti. Questo banner porta li'.
 *
 * Compare solo se ha senso: il browser supporta le push, il permesso non e'
 * stato ne' dato ne' negato (o e' dato ma non c'e' una sottoscrizione), e non
 * e' stato chiuso negli ultimi quattordici giorni. Il check gira nel browser,
 * dopo il montaggio: sul server non esiste `Notification`.
 */
export function AttivaNotificheBanner() {
  const [mostra, setMostra] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (typeof window === 'undefined' || typeof Notification === 'undefined') return;
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        if (Notification.permission === 'denied') return;
        try {
          const chiuso = Number(localStorage.getItem(CHIAVE) ?? '0');
          if (chiuso && Date.now() - chiuso < GIORNI_SILENZIO * 86_400_000) return;
        } catch {
          // storage non disponibile: si mostra comunque
        }
        // Permesso dato E sottoscrizione presente: niente da chiedere.
        if (Notification.permission === 'granted') {
          const reg = await navigator.serviceWorker.getRegistration();
          const sub = await reg?.pushManager.getSubscription();
          if (sub) return;
        }
        if (vivo) setMostra(true);
      } catch {
        // meglio nessun banner che un banner che rompe la pagina
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!mostra) return null;

  const chiudi = () => {
    try {
      localStorage.setItem(CHIAVE, String(Date.now()));
    } catch {
      // ignora
    }
    setMostra(false);
  };

  return (
    <div className="mx-4 mt-3 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/[0.06] px-3 py-2 text-xs">
      <BellRing className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <Link href="/mobile/profilo/notifiche" className="min-w-0 flex-1 leading-snug text-foreground">
        <span className="font-semibold">Attiva le notifiche su questo telefono</span>
        <span className="block text-muted-foreground">Un tocco, e gli avvisi arrivano anche ad app chiusa.</span>
      </Link>
      <button
        type="button"
        onClick={chiudi}
        aria-label="Non ora"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-muted"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
