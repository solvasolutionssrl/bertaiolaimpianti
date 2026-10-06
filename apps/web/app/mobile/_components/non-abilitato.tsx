import Link from 'next/link';
import { HardHat } from 'lucide-react';

/**
 * «Questa cosa esiste, ma non per te.»
 *
 * ## Perché una pagina e non un rimbalzo
 *
 * Il primo tentativo era `redirect('/mobile')`, ed era sbagliato due volte.
 *
 * ⚠️ **Tecnicamente**: un `redirect()` dentro un Server Component che sta
 * sotto un `<Suspense>` — e con un `loading.tsx` accanto ogni pagina ci sta —
 * non può più mandare una risposta di reindirizzamento, perché la risposta è
 * già partita. Il risultato misurato: l'indirizzo resta quello, e lo schermo
 * mostra **solo la barra in basso**. Una pagina bianca. È la stessa trappola
 * annotata in CLAUDE.md per la landing dell'app, e ci sono cascato lo stesso:
 * l'ha trovata il banco di prova, non la lettura del codice.
 *
 * **E di prodotto**: un rimbalzo silenzioso non spiega niente. Chi arriva qui
 * ci arriva da un collegamento vecchio o da un indirizzo battuto a mano, e
 * merita di sapere perché non entra e a chi chiedere.
 */
export function NonAbilitato({
  titolo,
  spiegazione,
}: {
  titolo: string;
  spiegazione: string;
}) {
  return (
    <div className="flex min-h-[70dvh] flex-col items-center justify-center gap-4 p-8 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <HardHat aria-hidden="true" className="h-6 w-6" />
      </span>
      <div>
        <h1 className="text-base font-semibold">{titolo}</h1>
        <p className="mt-1.5 max-w-xs text-sm text-muted-foreground">{spiegazione}</p>
      </div>
      <Link
        href="/mobile"
        className="inline-flex h-11 items-center rounded-lg border border-border px-5 text-sm font-medium"
      >
        Torna a oggi
      </Link>
    </div>
  );
}
