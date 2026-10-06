'use client';

import * as React from 'react';
import { Bell, BellOff, BellRing, Loader2 } from 'lucide-react';
import { Button } from '@kommessa/ui';

const VAPID_PUBBLICA = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

/**
 * La chiave VAPID viaggia in base64 per URL; `subscribe` vuole dei byte.
 *
 * ⚠️ Il tipo di ritorno è dichiarato `Uint8Array<ArrayBuffer>` e non
 * `Uint8Array`: nelle librerie di tipi recenti quest'ultimo copre anche un
 * buffer condiviso, che `applicationServerKey` non accetta. Senza
 * l'annotazione non compila, e con un `as never` compilerebbe nascondendo
 * l'unica cosa che qui conta — che quei byte siano una copia normale.
 */
function byteDaBase64Url(base64: string): Uint8Array<ArrayBuffer> {
  const riempimento = '='.repeat((4 - (base64.length % 4)) % 4);
  const normale = (base64 + riempimento).replace(/-/g, '+').replace(/_/g, '/');
  const grezzo = atob(normale);
  const out = new Uint8Array(new ArrayBuffer(grezzo.length));
  for (let i = 0; i < grezzo.length; i += 1) out[i] = grezzo.charCodeAt(i);
  return out;
}

type Stato = 'leggo' | 'spento' | 'accendo' | 'acceso' | 'negato' | 'nonsupportato' | 'guasto';

/**
 * **Accendere le notifiche su QUESTO telefono.**
 *
 * ## Perché è una cosa per dispositivo, e non una preferenza
 *
 * Una sottoscrizione push appartiene al singolo browser su cui è stata fatta:
 * accenderle sul telefono non le accende sul tablet, e cambiare telefono
 * vuol dire rifarlo. Per questo sta in una sezione a parte da «cosa farti
 * sapere», che invece è una scelta della persona e vale su tutto.
 *
 * ## ⚠️ Su iPhone serve la PWA installata
 *
 * Safari non espone `PushManager` a una pagina aperta nel browser: funziona
 * **solo** se l'app è stata aggiunta alla schermata iniziale (iOS 16.4+). È il
 * motivo per cui il caso «non supportato» non dice «il tuo browser è vecchio»
 * ma spiega cosa fare — su un iPhone del 2025 è il caso più probabile di
 * tutti, e un messaggio sbagliato manderebbe la persona a cercare un
 * aggiornamento che non serve.
 *
 * ## ⚠️ Il permesso si chiede dentro il tocco
 *
 * `Notification.requestPermission()` vale solo finché vale il gesto
 * dell'utente. Qui è la prima cosa che fa il gestore del tasto, prima di
 * qualunque giro di rete.
 */
export function SuQuestoTelefono() {
  const [stato, setStato] = React.useState<Stato>('leggo');
  const [nota, setNota] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      typeof Notification === 'undefined'
    ) {
      setStato('nonsupportato');
      return;
    }
    if (Notification.permission === 'denied') {
      setStato('negato');
      return;
    }
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setStato(sub ? 'acceso' : 'spento'))
      .catch(() => setStato('guasto'));
  }, []);

  async function accendi() {
    setNota(null);
    if (!VAPID_PUBBLICA || VAPID_PUBBLICA === 'placeholder') {
      setStato('guasto');
      setNota('Le notifiche non sono configurate sul server. Avvisa chi gestisce l’app.');
      return;
    }
    // ⚠️ Prima cosa, dentro il tocco: dopo un giro di rete il permesso non si
    // può più chiedere.
    let permesso: NotificationPermission;
    try {
      permesso = await Notification.requestPermission();
    } catch {
      setStato('guasto');
      setNota('Il telefono non ha risposto alla richiesta di permesso.');
      return;
    }
    if (permesso !== 'granted') {
      setStato(permesso === 'denied' ? 'negato' : 'spento');
      return;
    }

    setStato('accendo');
    try {
      const reg = await navigator.serviceWorker.ready;
      // Se una sottoscrizione c'è già (installazione precedente) si riusa:
      // `subscribe` su una esistente con la stessa chiave la restituisce, ma
      // chiederla è anche il modo di riallinearla col server.
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: byteDaBase64Url(VAPID_PUBBLICA),
        }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
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
        const e = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(e.error ?? 'Il server non ha accettato la registrazione.');
      }
      setStato('acceso');
      setNota('Fatto. Le notifiche arrivano su questo telefono.');
    } catch (e) {
      setStato('guasto');
      setNota(e instanceof Error ? e.message : 'Non è stato possibile attivarle.');
    }
  }

  async function spegni() {
    setNota(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Prima si toglie dal server, poi dal telefono: nell'ordine inverso,
        // se la rete cade, resta una riga che manda a un indirizzo morto.
        await fetch(`/api/push/subscribe?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: 'DELETE',
        });
        await sub.unsubscribe();
      }
      setStato('spento');
      setNota('Spente su questo telefono. Gli avvisi restano nell’elenco della campanella.');
    } catch (e) {
      setNota(e instanceof Error ? e.message : 'Non è stato possibile spegnerle.');
    }
  }

  if (stato === 'nonsupportato') {
    return (
      <Riquadro tono="neutro" icona={<BellOff className="h-4 w-4" />}>
        <p className="text-xs leading-relaxed">
          Per ricevere le notifiche su iPhone bisogna prima aggiungere Kommessa alla schermata
          iniziale: apri il menu di condivisione di Safari e scegli «Aggiungi a Home». Poi torna
          qui dall’app installata.
        </p>
      </Riquadro>
    );
  }

  if (stato === 'negato') {
    return (
      <Riquadro tono="guasto" icona={<BellOff className="h-4 w-4" />}>
        <p className="text-xs leading-relaxed">
          Le notifiche sono bloccate per questo sito. Si riattivano dalle impostazioni del
          telefono, alla voce di Safari o del browser, poi ricarica la pagina.
        </p>
      </Riquadro>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {stato === 'acceso' ? (
        <>
          <Riquadro tono="buono" icona={<BellRing className="h-4 w-4" />}>
            <p className="text-xs font-medium">Notifiche attive su questo telefono.</p>
          </Riquadro>
          <Button variant="ghost" size="sm" className="self-start" onClick={spegni}>
            Spegni su questo telefono
          </Button>
        </>
      ) : (
        <Button
          variant="outline"
          size="lg"
          className="min-h-[48px] w-full justify-start"
          onClick={accendi}
          disabled={stato === 'accendo' || stato === 'leggo'}
        >
          {stato === 'accendo' ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Bell className="h-4 w-4" aria-hidden="true" />
          )}
          {stato === 'accendo' ? 'Attivazione…' : 'Attiva le notifiche su questo telefono'}
        </Button>
      )}
      {nota ? <p className="text-xs text-muted-foreground">{nota}</p> : null}
    </div>
  );
}

function Riquadro({
  tono,
  icona,
  children,
}: {
  tono: 'buono' | 'guasto' | 'neutro';
  icona: React.ReactNode;
  children: React.ReactNode;
}) {
  const stile = {
    buono: 'border-emerald-500/30 bg-emerald-500/5 text-emerald-800 dark:text-emerald-300',
    guasto: 'border-destructive/30 bg-destructive/5 text-destructive',
    neutro: 'border-dashed border-border bg-muted/30 text-muted-foreground',
  }[tono];
  return (
    <div className={`flex items-start gap-2 rounded-lg border p-3 ${stile}`}>
      <span className="mt-px shrink-0" aria-hidden="true">
        {icona}
      </span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
