/**
 * La striscia dietro la Dynamic Island, del colore di **questa** pagina.
 *
 * ⚠️ Il layout dell'app ne disegna una fissa, blu, alta quanto
 * `safe-area-inset-top`: serve a tenere leggibili le icone bianche di sistema
 * su ogni pagina, e sulle pagine con l'intestazione blu la giunzione è
 * invisibile. Su una pagina con l'**intestazione arancione** quella striscia
 * diventa un gradino blu sopra l'arancione.
 *
 * Questo pezzo si mette sopra (`z-40` contro `z-30`) e la copre, solo dove
 * serve. Si poteva parametrizzare quella del layout, ma vorrebbe dire far
 * conoscere al guscio il colore di ogni pagina che ci finisce dentro: è la
 * pagina a sapere di che colore è.
 */
export function ScrimStatusBar({ tono }: { tono: 'richiesta' }) {
  return (
    <div
      aria-hidden="true"
      className={
        'pointer-events-none fixed inset-x-0 top-0 z-40 ' +
        (tono === 'richiesta' ? 'bg-accent' : 'bg-primary')
      }
      style={{ height: 'env(safe-area-inset-top, 0px)' }}
    />
  );
}
