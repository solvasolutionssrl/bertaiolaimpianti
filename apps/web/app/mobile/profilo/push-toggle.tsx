'use client';

import * as React from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { Button } from '@impiantixplus/ui';

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

type State = 'idle' | 'subscribing' | 'subscribed' | 'denied' | 'unsupported' | 'error';

/**
 * Bottone subscribe/unsubscribe Web Push.
 *
 * Stati:
 *  - unsupported: browser senza Push API o iOS < 16.4 / PWA non installata
 *  - denied:      utente ha negato il permesso → spiega come riabilitarlo
 *  - subscribed:  attiva, mostra "Invia test" + "Disattiva"
 *  - idle:        non ancora iscritto, mostra "Attiva"
 */
export function PushToggle() {
  const [state, setState] = React.useState<State>('idle');
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window)
    ) {
      setState('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setState('denied');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub ? 'subscribed' : 'idle'))
      .catch(() => setState('error'));
  }, []);

  async function subscribe() {
    setState('subscribing');
    setMsg(null);
    try {
      if (!VAPID_PUBLIC || VAPID_PUBLIC === 'placeholder') {
        throw new Error('VAPID non configurato');
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        setState(perm === 'denied' ? 'denied' : 'idle');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC),
      });
      const json = sub.toJSON() as {
        endpoint: string;
        keys: { p256dh: string; auth: string };
      };
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
          userAgent: navigator.userAgent,
        }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? 'subscribe fallita');
      }
      setState('subscribed');
      setMsg('Notifiche attive.');
    } catch (err) {
      setState('error');
      setMsg(err instanceof Error ? err.message : 'errore');
    }
  }

  async function unsubscribe() {
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`,
          { method: 'DELETE' },
        );
        await sub.unsubscribe();
      }
      setState('idle');
      setMsg('Notifiche disattivate.');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'errore');
    }
  }

  async function sendTest() {
    setMsg(null);
    const res = await fetch('/api/push/test', { method: 'POST' });
    const json = (await res.json().catch(() => ({}))) as {
      sent?: number;
      pruned?: number;
      failed?: number;
      error?: string;
    };
    if (!res.ok) {
      setMsg(json.error ?? 'errore');
      return;
    }
    setMsg(
      `Inviata a ${json.sent ?? 0} device${json.pruned ? ` (${json.pruned} scaduto rimosso)` : ''}.`,
    );
  }

  if (state === 'unsupported') {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 p-3 text-xs text-muted-foreground">
        <BellOff className="mr-1 inline h-3.5 w-3.5" />
        Notifiche push non supportate da questo browser. Su iPhone installa
        prima la PWA dal pulsante &ldquo;Aggiungi a Home&rdquo;.
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
        <BellOff className="mr-1 inline h-3.5 w-3.5" />
        Hai negato le notifiche. Riabilita dalle impostazioni del browser per
        questo sito, poi ricarica la pagina.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {state === 'subscribed' ? (
        <>
          <div className="flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 p-3 text-xs text-success">
            <BellRing className="h-3.5 w-3.5" />
            Notifiche attive su questo dispositivo.
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={sendTest}
              className="flex-1"
            >
              Invia test
            </Button>
            <Button variant="ghost" size="sm" onClick={unsubscribe}>
              Disattiva
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="min-h-[48px] w-full justify-start"
          onClick={subscribe}
          disabled={state === 'subscribing'}
        >
          {state === 'subscribing' ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Bell className="h-4 w-4" />
          )}
          {state === 'subscribing' ? 'Attivazione…' : 'Attiva notifiche push'}
        </Button>
      )}
      {msg ? <p className="text-xs text-muted-foreground">{msg}</p> : null}
    </div>
  );
}
