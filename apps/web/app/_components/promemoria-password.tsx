import Link from 'next/link';
import { KeyRound } from 'lucide-react';

import { statoPassword } from '../_lib/cambio-password';

/**
 * Una riga che dice a chi sta ancora usando la password consegnata
 * dall'ufficio che quella password la sanno in due.
 *
 * ## Perché non è un muro
 *
 * Il muro esiste (`/cambia-password`, e il cancello nei gusci) e resta il
 * predefinito. Ma consegnare gli accessi a una squadra intera in presenza è
 * un momento in cui il muro lavora contro: tredici persone che devono
 * inventarsi una password nello stesso momento, davanti a chi gliel'ha appena
 * data, non entrano — chiedono aiuto, e il primo contatto con l'applicazione
 * diventa un intoppo. Allora si fa entrare, e si continua a chiedere.
 *
 * ## Perché non si può chiudere
 *
 * Un avviso con la crocetta è un avviso che si chiude, non una cosa che si fa.
 * Questo sparisce da solo nel momento esatto in cui la persona fa quello che
 * chiede, e non un istante prima: è l'unico modo perché il promemoria
 * significhi qualcosa. In cambio costa una riga alta trentadue pixel.
 *
 * ## Perché legge da sé
 *
 * `statoPassword()` sta dentro `cache()`: chiamarla qui non aggiunge una
 * query, perché i gusci l'hanno già chiesta per il cancello. Così il punto di
 * montaggio è una riga sola e non c'è una prop da ricordarsi di passare —
 * esattamente il genere di dimenticanza che ieri ha lasciato scoperte quattro
 * strade su sei.
 */
export async function PromemoriaPassword() {
  const { obbligato, provvisoria } = await statoPassword();

  // Se è obbligato non è qui: il guscio l'ha già mandato alla schermata.
  if (!provvisoria || obbligato) return null;

  return (
    <Link
      href="/cambia-password"
      className="flex w-full items-center gap-2.5 bg-amber-50 px-4 py-2 text-amber-900 transition-colors hover:bg-amber-100 dark:bg-amber-950/60 dark:text-amber-100 dark:hover:bg-amber-900/60"
    >
      <KeyRound aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
      <span className="min-w-0 text-xs font-medium leading-tight">
        Stai usando la password che ti hanno dato in ufficio.
      </span>
      <span className="ml-auto shrink-0 text-xs font-semibold underline underline-offset-2">
        Cambiala
      </span>
    </Link>
  );
}
