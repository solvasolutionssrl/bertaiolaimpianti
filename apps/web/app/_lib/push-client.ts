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

/**
 * La registrazione del service worker, se c'e'. ⚠️ Mai `serviceWorker.ready`
 * qui: e' una promise che si risolve solo quando UNA registrazione esiste, e
 * sull'ufficio da PC il service worker non lo registra nessuno (`SwRegistrar`
 * sta nel guscio del telefono). Con `ready` il logout da desktop restava
 * appeso alla prima riga per sempre (misurato il 23/10/2026: il menu si
 * chiudeva e non succedeva niente). `getRegistration()` risponde subito,
 * anche «nessuna».
 */
async function registrazioneSw(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration('/')) ?? null;
  } catch {
    return null;
  }
}

export async function sincronizzaSottoscrizionePush(): Promise<EsitoSync> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return 'nonsupportato';
  }
  try {
    const reg = await registrazioneSw();
    if (!reg) return 'nessuna';
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

/**
 * Al logout: questo telefono non e' piu' di nessuno.
 *
 * Si toglie la riga sul server PRIMA di chiudere la sessione (dopo, la
 * chiamata non sarebbe autorizzata) e poi si cancella la sottoscrizione dal
 * browser, cosi' chi entra dopo riparte da «spento» e la riattiva a suo nome.
 * Best-effort: un intoppo qui non deve impedire di uscire.
 */
export async function spegniSottoscrizionePush(): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) return;
  try {
    const reg = await registrazioneSw();
    if (!reg) return;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, { method: 'DELETE' }).catch(() => null);
    await sub.unsubscribe().catch(() => false);
  } catch {
    // ignorato: si esce comunque
  }
}

// ── Attivare, e sapere a che punto si e' ───────────────────────────────────

const VAPID_PUBBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function byteDaBase64Url(base64: string): Uint8Array<ArrayBuffer> {
  const riempimento = '='.repeat((4 - (base64.length % 4)) % 4);
  const normale = (base64 + riempimento).replace(/-/g, '+').replace(/_/g, '/');
  const grezzo = atob(normale);
  const out = new Uint8Array(new ArrayBuffer(grezzo.length));
  for (let i = 0; i < grezzo.length; i += 1) out[i] = grezzo.charCodeAt(i);
  return out;
}

/**
 * Dove sta questo telefono rispetto alle notifiche.
 *  - `serve_home`: iPhone/iPad fuori dall'app installata — Safari non puo'
 *    ricevere push, serve «Aggiungi alla schermata Home» (iOS ≥ 16.4);
 *  - `nonsupportato`: il browser non ha le push;
 *  - `negato`: il permesso e' stato rifiutato, si riapre dalle impostazioni;
 *  - `acceso`: c'e' una sottoscrizione nel browser;
 *  - `spento`: si puo' attivare con un tocco.
 */
export type StatoPush = 'serve_home' | 'nonsupportato' | 'negato' | 'acceso' | 'spento';

export async function statoNotifichePush(): Promise<StatoPush> {
  if (typeof window === 'undefined') return 'nonsupportato';
  const ua = navigator.userAgent;
  const apple = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const installata =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches;
  if (apple && !installata) return 'serve_home';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return 'nonsupportato';
  }
  if (Notification.permission === 'denied') return 'negato';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    return sub ? 'acceso' : 'spento';
  } catch {
    return 'spento';
  }
}

export type EsitoAttivazione =
  | { esito: 'acceso' }
  | { esito: 'negato' | 'spento' | 'nonsupportato' }
  | { esito: 'guasto'; messaggio: string };

/**
 * Chiede il permesso e registra il telefono per chi e' dentro adesso.
 * ⚠️ Va chiamata DENTRO un tocco: dopo un giro di rete il permesso non si
 * puo' piu' chiedere. La richiesta e' la prima cosa che fa.
 */
export async function attivaNotifichePush(): Promise<EsitoAttivazione> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') {
    return { esito: 'nonsupportato' };
  }
  if (!VAPID_PUBBLICA || VAPID_PUBBLICA === 'placeholder') {
    return { esito: 'guasto', messaggio: 'Le notifiche non sono configurate sul server. Avvisa chi gestisce l’app.' };
  }
  let permesso: NotificationPermission;
  try {
    permesso = await Notification.requestPermission();
  } catch {
    return { esito: 'guasto', messaggio: 'Il telefono non ha risposto alla richiesta di permesso.' };
  }
  if (permesso !== 'granted') return { esito: permesso === 'denied' ? 'negato' : 'spento' };
  try {
    const reg = await navigator.serviceWorker.ready;
    // Una sottoscrizione precedente si riusa: chiederla al server e' anche il
    // modo di assegnarla a chi e' dentro adesso.
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: byteDaBase64Url(VAPID_PUBBLICA) }));
    const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
    const res = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys, userAgent: navigator.userAgent }),
    });
    if (!res.ok) {
      const e = (await res.json().catch(() => ({}))) as { error?: string };
      return { esito: 'guasto', messaggio: e.error ?? 'Il server non ha accettato la registrazione.' };
    }
    return { esito: 'acceso' };
  } catch (e) {
    return { esito: 'guasto', messaggio: e instanceof Error ? e.message : 'Non è stato possibile attivarle.' };
  }
}
