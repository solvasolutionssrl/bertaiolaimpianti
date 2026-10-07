'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { CalendarClock, KeyRound } from 'lucide-react';

/**
 * Il popup che dice quanti giorni restano alla scadenza della password.
 *
 * ## Perché un popup E una riga fissa
 *
 * Sono due mestieri diversi, e qui servono entrambi. La **riga fissa**
 * (`PromemoriaPassword`) non si può chiudere e sta lì finché la cosa non è
 * fatta: è il promemoria. Il **popup** interrompe una volta al giorno e poi si
 * toglie di mezzo: è l'avviso. Un popup che non si può chiudere sarebbe un
 * muro con dieci giorni di anticipo; una riga che si chiude non sarebbe un
 * promemoria. Chiuderlo oggi non lo chiude domani, perché domani il numero è
 * un altro e la cosa è più urgente.
 *
 * ⚠️ **Una volta al giorno, non una volta sola.** La chiave di memoria
 * contiene il giorno: `kommessa:password-scade:2026-12-03`. Con una chiave
 * sola, chi lo chiude il primo dicembre non lo rivede e si presenta il dieci
 * davanti al muro senza essere stato avvisato — cioè l'avviso avrebbe
 * funzionato all'incontrario.
 *
 * ⚠️ **Il giorno arriva dal server come prop.** Non si chiama `new Date()`
 * nell'inizializzatore di uno stato di un componente reso anche dal server:
 * è il difetto che faceva comparire «Errore critico» all'avvio della PWA
 * (mismatch di idratazione, React #310).
 *
 * ⚠️ **Sta su `document.body`, non dentro i gusci.** Nell'ufficio il guscio ha
 * altezza fissa e scorre solo il `<main>`; nel telefono c'è la barra in basso
 * fissa. Un elemento `fixed` dentro quegli alberi resta intrappolato nel loro
 * contesto di impilamento e finisce sotto.
 *
 * Non è un dialog Radix di proposito: un dialog modale spegne i puntatori su
 * tutto il `<body>` e li riaccende solo nel proprio recinto. Per un avviso che
 * compare da sé, senza che nessuno l'abbia chiesto, è un rischio sproporzionato
 * — se qualcosa va storto l'applicazione diventa inservibile.
 */
const ATTESA_MS = 1_200;

function chiave(giorno: string): string {
  return 'kommessa:password-scade:' + giorno;
}

function giaVistoOggi(giorno: string): boolean {
  try {
    return window.localStorage.getItem(chiave(giorno)) === '1';
  } catch {
    // Finestra anonima, dati del sito bloccati: si mostra. Meglio un avviso
    // in più che una scadenza non detta.
    return false;
  }
}

export function AvvisoScadenzaPassword({
  titolo,
  corpo,
  oggi,
  urgente,
}: {
  titolo: string;
  corpo: string;
  /** Il giorno italiano, dal server: è la chiave della memoria. */
  oggi: string;
  /** Da qui in giù non si rimanda con leggerezza: resta un giorno o due. */
  urgente: boolean;
}) {
  const [aperto, setAperto] = React.useState(false);
  const rifTasto = React.useRef<HTMLAnchorElement>(null);

  React.useEffect(() => {
    if (giaVistoOggi(oggi)) return;
    // Una breve attesa: comparire nello stesso istante in cui la pagina si
    // disegna sembra un errore della pagina, non un avviso.
    const t = window.setTimeout(() => setAperto(true), ATTESA_MS);
    return () => window.clearTimeout(t);
  }, [oggi]);

  const piuTardi = React.useCallback(() => {
    try {
      window.localStorage.setItem(chiave(oggi), '1');
    } catch {
      // Niente da fare: ricomparirà al prossimo caricamento. Accettabile.
    }
    setAperto(false);
  }, [oggi]);

  React.useEffect(() => {
    if (!aperto) return;
    rifTasto.current?.focus({ preventScroll: true });
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') piuTardi();
    };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [aperto, piuTardi]);

  if (!aperto || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="Chiudi l’avviso"
        onClick={piuTardi}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="scad-pwd-titolo"
        className="relative w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-soft-md"
        style={{
          marginTop: 'env(safe-area-inset-top, 0px)',
          marginBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <span
          className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${
            urgente ? 'bg-destructive/10 text-destructive' : 'bg-amber-500/10 text-amber-600'
          }`}
        >
          <CalendarClock aria-hidden="true" className="h-5 w-5" />
        </span>
        <h2
          id="scad-pwd-titolo"
          className="text-base font-semibold leading-tight tracking-tight text-foreground"
        >
          {titolo}
        </h2>
        <p className="mt-1.5 text-sm leading-snug text-muted-foreground">{corpo}</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row">
          <button
            type="button"
            onClick={piuTardi}
            className="h-10 flex-1 rounded-md border border-border bg-background px-4 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            Più tardi
          </button>
          <Link
            ref={rifTasto}
            href="/cambia-password"
            onClick={piuTardi}
            className="flex h-10 flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 text-xs font-semibold text-primary-foreground transition-colors hover:brightness-110"
          >
            <KeyRound aria-hidden="true" className="h-3.5 w-3.5" />
            Cambiala adesso
          </Link>
        </div>
      </div>
    </div>,
    document.body,
  );
}
