'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Building2, CalendarClock, Coffee, Loader2, LogOut, Play } from 'lucide-react';

import { segnaPresenzaInSede } from '@/app/_actions/kantiere-timbra';

/**
 * La presenza in sede senza cantiere, dal telefono.
 *
 * Lo stesso gesto che l'ufficio ha dalla scrivania: chi comincia la giornata
 * e non sa ancora (o non vuole dire adesso) su cosa lavora, segna che c'e'.
 * La presenza va nel REGISTRO, come un badge; le ore si assegnano ai
 * cantieri alla fine, con «Inserisci le commesse» nella tab Ore.
 *
 * Due pezzi: il tasto che fa partire la presenza (sta in fondo ai due fogli
 * di avvio, sotto la scelta del cantiere) e la card della presenza in corso
 * (pausa, ripresa, fine). ⚠️ La card agisce solo su una presenza segnata
 * dall'app o dal PC: una presenza aperta con il badge si chiude al terminale,
 * o il registro si ritrova un'uscita in piu' quando la persona passa il badge.
 */

export function messaggioPresenza(code: string): string {
  switch (code) {
    case 'TURNO_GIA_APERTO':
      return 'Hai già una giornata aperta. Chiudila prima di iniziarne un’altra.';
    case 'NESSUN_TURNO_APERTO':
      return 'Non risulta una presenza aperta. Ricarica la pagina.';
    case 'NESSUN_DIPENDENTE':
      return 'Nessun profilo dipendente collegato a questo account.';
    case 'MODULO_OFF':
      return 'Il modulo Kantiere non è abilitato.';
    case 'NON_AUTENTICATO':
      return 'Devi accedere per iniziare la giornata.';
    default:
      return 'Non riuscito. Riprova.';
  }
}

const fmtOra = new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', hour: '2-digit', minute: '2-digit' });
const hm = (min: number) => `${Math.floor(min / 60)}:${String(min % 60).padStart(2, '0')}`;

/** Il tasto «Inizia senza cantiere», per i fogli di avvio. */
export function IniziaSenzaCantiere({ onDone, onErrore }: { onDone: () => void; onErrore: (msg: string) => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const r = await segnaPresenzaInSede({ azione: 'inizio', dispositivo: 'telefono' });
          if (r.ok) {
            onDone();
            router.refresh();
          } else onErrore(messaggioPresenza(r.error));
        });
      }}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-background px-3.5 py-3 text-left transition-colors active:scale-[0.99] disabled:opacity-50"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Building2 className="h-4 w-4" aria-hidden="true" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Inizia senza cantiere</span>
        <span className="block text-xs leading-snug text-muted-foreground">Sei in sede: le ore le assegni alla fine.</span>
      </span>
    </button>
  );
}

export interface PresenzaSedeVista {
  /** ISO del primo ingresso di oggi. */
  inizioIso: string | null;
  /** ISO dell'ultima uscita, se la presenza e' chiusa. */
  fineIso: string | null;
  aperta: boolean;
  /** Minuti di presenza netti delle pause, da ripartire. */
  nettoMin: number;
  /** Almeno un evento viene dal terminale. */
  dalTerminale: boolean;
}

/** La presenza in sede di oggi: in corso, oppure chiusa e da ripartire. */
export function PresenzaSedeCard({ presenza }: { presenza: PresenzaSedeVista }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [errore, setErrore] = useState<string | null>(null);
  const azione = (a: 'pausa' | 'ripresa' | 'fine') => {
    setErrore(null);
    startTransition(async () => {
      const r = await segnaPresenzaInSede({ azione: a, dispositivo: 'telefono' });
      if (r.ok) router.refresh();
      else setErrore(messaggioPresenza(r.error));
    });
  };
  const inizio = presenza.inizioIso ? fmtOra.format(new Date(presenza.inizioIso)) : '';
  const fine = presenza.fineIso ? fmtOra.format(new Date(presenza.fineIso)) : '';

  return (
    <section
      data-presenza-sede={presenza.aperta ? 'aperta' : 'chiusa'}
      className="rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-50 via-sky-50/60 to-transparent p-4 shadow-soft"
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-sky-800/80">
        {presenza.dalTerminale ? 'Badge' : 'In sede'}
      </p>
      {presenza.aperta ? (
        <>
          <p className="mt-1 text-lg font-semibold text-sky-900">Dentro dalle {inizio}</p>
          {presenza.dalTerminale ? (
            <p className="mt-1 text-xs text-sky-900/80">La giornata si chiude al terminale, con il badge.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-sky-900/80">Senza cantiere: le ore le assegni alla fine, quando chiudi.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => azione('pausa')}
                  className="flex items-center justify-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3 py-3 text-sm font-semibold text-sky-900 active:scale-[0.99] disabled:opacity-50"
                >
                  <Coffee className="h-4 w-4" aria-hidden="true" /> Pausa
                </button>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => azione('fine')}
                  className="flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-3 text-sm font-semibold text-white active:scale-[0.99] disabled:opacity-50"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" /> Fine giornata
                </button>
              </div>
            </>
          )}
        </>
      ) : (
        <>
          <p className="mt-1 text-lg font-semibold text-sky-900">
            {inizio} → {fine}
          </p>
          <p className="mt-1 text-xs text-sky-900/80">{hm(presenza.nettoMin)} di presenza: dì su quali commesse hai lavorato.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {!presenza.dalTerminale ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => azione('ripresa')}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-sky-300 bg-white px-3 py-3 text-sm font-semibold text-sky-900 active:scale-[0.99] disabled:opacity-50"
              >
                <Play className="h-4 w-4" aria-hidden="true" /> Riprendi
              </button>
            ) : null}
            <Link
              href="/mobile/kantiere/ore"
              className={`flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-3 py-3 text-sm font-semibold text-white active:scale-[0.99] ${presenza.dalTerminale ? 'col-span-2' : ''}`}
            >
              <CalendarClock className="h-4 w-4" aria-hidden="true" /> Inserisci le commesse
            </Link>
          </div>
        </>
      )}
      {errore ? <p className="mt-2 text-xs text-destructive">{errore}</p> : null}
    </section>
  );
}
