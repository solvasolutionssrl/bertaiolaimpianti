'use client';

import { useEffect, useState } from 'react';

/**
 * Stato di connettività del browser (navigator.onLine + eventi online/offline).
 *
 * SSR-safe: parte da `true` (assume online) e si corregge al mount, così non
 * lampeggia "offline" durante l'idratazione. `navigator.onLine` non è
 * infallibile (può dire true senza rete reale), ma è sufficiente per gestire
 * la UI delle funzioni AI, che comunque falliscono con grazia se la rete manca.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
