/**
 * Gestione dei ChunkLoadError: dopo un deploy il client può referenziare un
 * chunk JS con hash vecchio, rimosso dal server (404) → l'hydration lancia e
 * l'error boundary mostra la schermata di errore. Il rimedio standard è
 * ricaricare UNA volta per prendere il manifest fresco. Tipico su PWA iOS in
 * standalone (dipende molto dalla cache del service worker).
 */

/** True se l'errore è un fallimento di caricamento chunk/modulo dinamico. */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const e = error as { name?: string; message?: string };
  const name = e.name ?? '';
  const msg = e.message ?? '';
  return (
    name === 'ChunkLoadError' ||
    /Loading chunk [^ ]+ failed/i.test(msg) ||
    /Loading CSS chunk/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /importing a module script failed/i.test(msg) || // wording Safari/WebKit
    /Failed to fetch dynamically imported module/i.test(msg)
  );
}

const RELOAD_FLAG = '__kommessa_chunk_reload';

/**
 * Se l'errore è un ChunkLoadError e non abbiamo già ricaricato in questa
 * sessione, avvia un reload one-shot e ritorna true (chi chiama può mostrare
 * uno stato neutro invece della schermata di errore). Guardia anti-loop: al
 * massimo un reload per sessione; se dopo il reload il chunk manca davvero,
 * mostra la schermata normale. Se `sessionStorage` non è disponibile
 * (Safari private), NON ricarica (per non rischiare loop).
 */
export function reloadOnceOnChunkError(error: unknown): boolean {
  if (typeof window === 'undefined') return false;
  if (!isChunkLoadError(error)) return false;
  try {
    if (window.sessionStorage.getItem(RELOAD_FLAG)) return false;
    window.sessionStorage.setItem(RELOAD_FLAG, '1');
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
