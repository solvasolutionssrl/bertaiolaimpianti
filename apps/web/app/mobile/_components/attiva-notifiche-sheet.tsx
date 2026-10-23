'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { BellRing, Briefcase, CalendarClock, CalendarDays, Check, Loader2, Share, SquarePlus } from 'lucide-react';

import { attivaNotifichePush, statoNotifichePush, type StatoPush } from '@/app/_lib/push-client';
import { Portal } from './portal';

const CHIAVE = 'kommessa.notifiche.proposto';

/**
 * «Attiva le notifiche»: il foglio che compare all'apertura dell'app finche'
 * questo telefono non e' registrato.
 *
 * Al 21/10/2026 c'era UNA sottoscrizione su quattro clienti: la pagina che
 * chiede il permesso sta due livelli sotto il profilo, e una riga sottile in
 * cima alla home (il banner di prima) si chiudeva senza leggerla. Qui la
 * richiesta e' grande, dice a cosa serve, e si attiva **con un tocco qui
 * dentro** (il permesso del browser si chiede nel tocco, non dopo un giro).
 *
 * Compare a ogni apertura dell'app, una volta per sessione del browser:
 * «Più tardi» la mette via fino alla prossima apertura, non per quattordici
 * giorni. Tre forme, una per situazione:
 *  - si puo' attivare → il tasto grande;
 *  - iPhone fuori dall'app installata → i due passi per metterla in Home,
 *    perche' Safari da solo non riceve push;
 *  - permesso negato → dove riaprirlo nelle impostazioni del telefono.
 * Non compare se il browser non ha le push: non c'e' niente da chiedere.
 */
export function AttivaNotificheSheet() {
  const router = useRouter();
  const [stato, setStato] = useState<StatoPush | 'accendo' | 'fatto' | null>(null);
  const [errore, setErrore] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        if (sessionStorage.getItem(CHIAVE)) return;
      } catch {
        // senza storage si propone comunque
      }
      const s = await statoNotifichePush();
      if (!vivo) return;
      if (s === 'acceso' || s === 'nonsupportato') return;
      setStato(s);
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const metti_via = () => {
    try {
      sessionStorage.setItem(CHIAVE, '1');
    } catch {
      // ignorato
    }
    setStato(null);
  };

  const attiva = async () => {
    setErrore(null);
    setStato('accendo');
    const r = await attivaNotifichePush();
    if (r.esito === 'acceso') {
      setStato('fatto');
      router.refresh();
      setTimeout(metti_via, 1400);
    } else if (r.esito === 'guasto') {
      setErrore(r.messaggio);
      setStato('spento');
    } else {
      setStato(r.esito === 'nonsupportato' ? 'spento' : r.esito);
    }
  };

  if (stato === null) return null;

  return (
    <Portal>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Attiva le notifiche"
        data-foglio-notifiche={stato}
        className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 backdrop-blur-[2px]"
        style={{ pointerEvents: 'auto' }}
      >
        <div
          className="animate-page-in w-full max-w-md rounded-t-3xl bg-card px-6 pt-7 shadow-2xl"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
        >
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-sky-500 text-white shadow-lg shadow-primary/30">
            {stato === 'fatto' ? (
              <Check className="h-10 w-10" strokeWidth={2.5} aria-hidden="true" />
            ) : (
              <BellRing className="h-10 w-10" strokeWidth={2} aria-hidden="true" />
            )}
          </div>

          {stato === 'serve_home' ? (
            <>
              <h2 className="mt-5 text-center text-2xl font-semibold tracking-tight">Metti Kommessa in Home</h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
                Su iPhone le notifiche sono disponibili solo dall’applicazione installata. Completare l’installazione e riaprire da lì.
              </p>
              <ol className="mt-5 space-y-3">
                <Passo n={1} icona={<Share className="h-5 w-5" aria-hidden="true" />}>
                  Tocca <span className="font-semibold text-foreground">Condividi</span> in basso in Safari
                </Passo>
                <Passo n={2} icona={<SquarePlus className="h-5 w-5" aria-hidden="true" />}>
                  Scegli <span className="font-semibold text-foreground">Aggiungi alla schermata Home</span>
                </Passo>
              </ol>
              <button type="button" onClick={metti_via} className="mt-6 w-full rounded-2xl bg-primary py-4 text-base font-semibold text-white shadow-soft active:scale-[0.99]">
                Ho capito
              </button>
            </>
          ) : stato === 'negato' ? (
            <>
              <h2 className="mt-5 text-center text-2xl font-semibold tracking-tight">Le notifiche sono bloccate</h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
                Il telefono ha rifiutato il permesso. Si riapre dalle impostazioni: <span className="font-semibold text-foreground">Impostazioni → Notifiche → Kommessa</span> (su Android: impostazioni del sito in Chrome).
              </p>
              <button type="button" onClick={metti_via} className="mt-6 w-full rounded-2xl bg-primary py-4 text-base font-semibold text-white shadow-soft active:scale-[0.99]">
                Ho capito
              </button>
            </>
          ) : (
            <>
              <h2 className="mt-5 text-center text-2xl font-semibold tracking-tight">
                {stato === 'fatto' ? 'Notifiche attive' : 'Attiva le notifiche'}
              </h2>
              <p className="mt-2 text-center text-sm leading-relaxed text-muted-foreground">
                {stato === 'fatto'
                  ? 'Gli avvisi verranno recapitati su questo dispositivo, anche ad applicazione chiusa.'
                  : 'Le comunicazioni di competenza arrivano tempestivamente, anche ad applicazione chiusa.'}
              </p>
              {stato !== 'fatto' ? (
                <ul className="mt-5 space-y-3">
                  <Voce icona={<Briefcase className="h-5 w-5" aria-hidden="true" />} titolo="Commesse e attività assegnate" testo="Quando l’ufficio assegna una commessa o un’attività." />
                  <Voce icona={<CalendarClock className="h-5 w-5" aria-hidden="true" />} titolo="Ore da inserire" testo="La sera, se la presenza è registrata e le ore non sono attribuite alle commesse." />
                  <Voce icona={<CalendarDays className="h-5 w-5" aria-hidden="true" />} titolo="Pianificazione settimanale" testo="Quando la pianificazione viene pubblicata o modificata." />
                </ul>
              ) : null}
              {errore ? (
                <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-center text-xs text-destructive">
                  {errore}
                </p>
              ) : null}
              {stato !== 'fatto' ? (
                <>
                  <button
                    type="button"
                    onClick={attiva}
                    disabled={stato === 'accendo'}
                    className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-primary py-4 text-base font-semibold text-white shadow-soft transition-transform active:scale-[0.99] disabled:opacity-60"
                  >
                    {stato === 'accendo' ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <BellRing className="h-5 w-5" aria-hidden="true" />}
                    {stato === 'accendo' ? 'Attivazione in corso…' : 'Attiva le notifiche'}
                  </button>
                  <button type="button" onClick={metti_via} className="mt-2 w-full py-3 text-sm font-medium text-muted-foreground active:text-foreground">
                    Più tardi
                  </button>
                </>
              ) : null}
            </>
          )}
        </div>
      </div>
    </Portal>
  );
}

function Voce({ icona, titolo, testo }: { icona: React.ReactNode; titolo: string; testo: string }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">{icona}</span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{titolo}</span>
        <span className="block text-xs leading-snug text-muted-foreground">{testo}</span>
      </span>
    </li>
  );
}

function Passo({ n, icona, children }: { n: number; icona: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white">{n}</span>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">{icona}</span>
      <span className="text-sm leading-snug text-muted-foreground">{children}</span>
    </li>
  );
}
