'use client';

import * as React from 'react';

/**
 * SwRegistrar — registra il Service Worker custom `/sw.js` al mount.
 *
 * - Degrado graceful: se il browser non supporta SW o la registrazione
 *   fallisce (Safari privacy mode, file:// dev, ecc.) la PWA continua
 *   comunque a funzionare come Web App standard.
 * - In dev (`NODE_ENV=development`) registriamo lo stesso, perché Next 14
 *   serve `/sw.js` da `public/` anche in dev: utile per validare manifest
 *   + install prompt. Per disattivare: `?nosw=1` in querystring.
 */
export default function SwRegistrar(): null {
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;

    // Opt-out via querystring (debug)
    if (new URLSearchParams(window.location.search).get('nosw') === '1') {
      return;
    }

    let cancelled = false;

    const register = async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        if (cancelled) return;

        // Se c'è un SW in waiting, chiediamogli di attivarsi subito
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        // Best-effort: registra background sync per la coda foto
        // (se il browser non supporta sync, fallisce silenziosamente)
        const syncMgr = (reg as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        }).sync;
        if (syncMgr) {
          try {
            await syncMgr.register('photo-upload-queue');
          } catch {
            /* ignora: Safari iOS non supporta Background Sync */
          }
        }

        // Forza un drain della coda quando torna online
        const onOnline = () => {
          reg.active?.postMessage({ type: 'DRAIN_PHOTO_QUEUE' });
        };
        window.addEventListener('online', onOnline);
        return () => window.removeEventListener('online', onOnline);
      } catch (err) {
        // Non bloccante: log solo in dev
        if (process.env.NODE_ENV !== 'production') {
          // eslint-disable-next-line no-console
          console.warn('[sw] registrazione fallita', err);
        }
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
