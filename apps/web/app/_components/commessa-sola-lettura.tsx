import { Lock } from 'lucide-react';

/**
 * La riga che spiega perche' su questa commessa non si aggiunge piu' niente.
 *
 * Togliere i tasti e basta lascia chi guarda a chiedersi se si e' rotto
 * qualcosa: il lavoro e' finito, non guasto. Per questo la scheda lo dice.
 *
 * Le due diciture restano distinte perche' i due stati vogliono dire cose
 * diverse, e la differenza si vede dal telefono: una completata si consulta
 * anche da li', una archiviata no.
 */
export function CommessaSolaLettura({
  stato,
  nota,
  className,
}: {
  stato: string | null | undefined;
  /** Riga in piu' per il posto in cui si sta mostrando (es. come riaprirla). */
  nota?: string;
  className?: string;
}) {
  const archiviata = stato === 'archiviata';
  const titolo = archiviata ? 'Commessa archiviata.' : 'Commessa completata.';
  const corpo = archiviata
    ? 'Si consulta soltanto: non si aggiungono foto, attività, riunioni, tag o tecnici. Dal telefono non compare.'
    : 'Si consulta soltanto: non si aggiungono foto, attività, riunioni, tag o tecnici.';

  return (
    <div
      className={[
        'flex items-start gap-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs leading-relaxed text-muted-foreground',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p>
        <span className="font-medium text-foreground">{titolo}</span>{' '}
        {corpo}
        {nota ? <span className="block mt-0.5">{nota}</span> : null}
      </p>
    </div>
  );
}
