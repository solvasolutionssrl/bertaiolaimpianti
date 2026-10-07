import Link from 'next/link';
import { CalendarClock, KeyRound } from 'lucide-react';

import { romeDay } from '@kommessa/api/rome-time';
import { formattaGiorno, quandoScade, testoScadenza } from '@kommessa/api/scadenza-password';

import { statoPassword } from '../_lib/cambio-password';
import { AvvisoScadenzaPassword } from './avviso-scadenza-password';

/**
 * Una riga che dice a chi deve cambiare la password perché deve cambiarla.
 *
 * Due ragioni, una riga sola: la password gliel'ha data l'ufficio, oppure sta
 * scadendo. ⚠️ **Due righe impilate sarebbero due avvisi per una cosa sola**:
 * la scadenza vince perché ha una data, e chi la rispetta spegne anche l'altra
 * (cambiandola diventa sua).
 *
 * ## Perché non è un muro
 *
 * Il muro esiste (`/cambia-password`, e il cancello nei gusci) e scatta quando
 * c'è una ragione per fermare qualcuno. Ma consegnare gli accessi a una squadra
 * intera in presenza è un momento in cui il muro lavora contro: tredici
 * persone che devono inventarsi una password nello stesso momento, davanti a
 * chi gliel'ha appena data, non entrano — chiedono aiuto, e il primo contatto
 * con l'applicazione diventa un intoppo. Allora si fa entrare, e si continua
 * a chiedere. Lo stesso vale per i dieci giorni prima della scadenza.
 *
 * ## Perché non si può chiudere
 *
 * Un avviso con la crocetta è un avviso che si chiude, non una cosa che si fa.
 * Questo sparisce da solo nel momento esatto in cui la persona fa quello che
 * chiede, e non un istante prima. Il popup accanto, che invece si chiude, fa
 * l'altro mestiere: vedi `avviso-scadenza-password.tsx`.
 *
 * ## Perché legge da sé
 *
 * `statoPassword()` sta dentro `cache()`: chiamarla qui non aggiunge una
 * query, perché i gusci l'hanno già chiesta per il cancello. Così il punto di
 * montaggio è una riga sola e non c'è una prop da ricordarsi di passare —
 * esattamente il genere di dimenticanza che il 07/10 ha lasciato scoperte
 * quattro strade su sei.
 */
export async function PromemoriaPassword() {
  const { obbligato, provvisoria, scadenza } = await statoPassword();

  // Se è obbligato non è qui: il guscio l'ha già mandato alla schermata.
  if (obbligato) return null;

  const inScadenza = scadenza.stato === 'in_scadenza';
  if (!inScadenza && !provvisoria) return null;

  const testo = testoScadenza(scadenza);
  const oggi = romeDay(new Date());

  return (
    <>
      <Link
        href="/cambia-password"
        className="flex w-full items-center gap-2.5 bg-amber-50 px-4 py-2 text-amber-900 transition-colors hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/60"
      >
        {inScadenza ? (
          <CalendarClock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <KeyRound aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        )}
        <span className="min-w-0 text-xs font-medium leading-tight">
          {inScadenza
            ? `La password scade ${quandoScade(scadenza.giorniRimasti)}, il ${formattaGiorno(scadenza.scadenza)}.`
            : 'Stai usando la password che ti hanno dato in ufficio.'}
        </span>
        <span className="ml-auto shrink-0 text-xs font-semibold underline underline-offset-2">
          Cambiala
        </span>
      </Link>

      {/* L'interruzione, una volta al giorno. Il promemoria sopra resta. */}
      {inScadenza ? (
        <AvvisoScadenzaPassword
          titolo={testo.titolo}
          corpo={testo.corpo}
          oggi={oggi}
          urgente={scadenza.giorniRimasti <= 2}
        />
      ) : null}
    </>
  );
}
