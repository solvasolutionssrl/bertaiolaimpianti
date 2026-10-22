/**
 * Riallinea la sottoscrizione push del browser all'utente loggato.
 *
 * Il browser tiene UNA sottoscrizione per origine, e non sa chi e' loggato.
 * Dopo un cambio di utente sullo stesso telefono la pagina diceva «attive»
 * (la sottoscrizione c'era) ma sul server era registrata a nome di un altro.
 * Si chiama a ogni apertura dell'app e dalla pagina delle notifiche: se una
 * sottoscrizione esiste, la si rimanda al server, che la assegna a chi e'
 * dentro adesso.
 */
export type EsitoSync = 'nessuna' | 'ok' | 'errore' | 'nonsupportato';

export async function sincronizzaSottoscrizionePush(): Promise<EsitoSync> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'nonsupportato';
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return 'nessuna';
    const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return 'errore';
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
    });
    return res.ok ? 'ok' : 'errore';
  } catch {
    return 'errore';
  }
}
