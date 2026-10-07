'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * **«Qual è la cosa di cui mi parlava la notifica?»**
 *
 * Arrivando da un avviso si atterra su un elenco di venti righe, e quella che
 * riguarda l'avviso è una. Finora non c'era nessun modo di saperlo: si leggeva
 * «ti è stato affidato un lavoro», si toccava, e ci si trovava davanti la
 * stessa pagina di sempre.
 *
 * Chi arriva con `?evidenzia=<id>` nell'indirizzo vede quella riga **portata a
 * schermo** e cerchiata d'ambra per tre secondi.
 *
 * ## Tre decisioni
 *
 * ⚠️ **L'anello si spegne da solo, e l'indirizzo non si tocca.** Lasciarlo
 * acceso vuol dire che ricaricando la pagina fra un'ora lampeggia di nuovo;
 * riscrivere l'indirizzo per toglierlo vuol dire che il tasto «indietro» del
 * telefono riporta sulla stessa pagina con l'evidenza già consumata. Si lascia
 * il parametro dov'è e si spegne lo stato: l'indirizzo resta condivisibile e
 * l'effetto non torna.
 *
 * ⚠️ **Si porta a schermo una volta sola**, al montaggio. Un `scrollIntoView`
 * a ogni ridisegno strappa la pagina sotto le dita di chi ha già cominciato a
 * scorrere.
 *
 * ⚠️ **`block: 'center'` e non `'start'`**: in cima alla finestra la riga
 * finisce sotto l'intestazione appiccicata, e si evidenzia qualcosa che non si
 * vede.
 */
export function useEvidenzia(id: string): {
  evidenziata: boolean;
  rif: React.RefObject<HTMLDivElement>;
} {
  const params = useSearchParams();
  const cercata = params?.get('evidenzia') ?? null;
  const eQuesta = cercata !== null && cercata === id;

  const [accesa, setAccesa] = React.useState(eQuesta);
  const rif = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!eQuesta) return;
    setAccesa(true);
    const t1 = setTimeout(() => {
      rif.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);
    const t2 = setTimeout(() => setAccesa(false), 3200);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // Volutamente solo su `eQuesta`: l'effetto è una cosa che succede
    // all'arrivo, non uno stato da tenere allineato.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eQuesta]);

  return { evidenziata: accesa, rif };
}

/**
 * Il guscio attorno a una riga evidenziabile.
 *
 * Si usa dove la riga è già un elemento suo (una scheda, un `<li>`): avvolge,
 * non disegna. `rounded` serve perché l'anello segue il bordo di chi avvolge, e
 * un anello quadrato attorno a una scheda arrotondata si vede che è sbagliato.
 */
export function Evidenziabile({
  id,
  className,
  children,
}: {
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { evidenziata, rif } = useEvidenzia(id);
  return (
    <div
      ref={rif}
      className={[
        'rounded-lg',
        evidenziata ? 'animate-evidenzia' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
