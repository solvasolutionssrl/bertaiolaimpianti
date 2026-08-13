import { Cloud, CloudOff } from 'lucide-react';
import { cn } from '@kommessa/ui';

/**
 * La nuvoletta «questo lavoro è collegato al gestionale».
 *
 * Risponde a una domanda che l'ufficio si fa in continuazione e che finora
 * poteva risolvere solo aprendo la pagina Gestionale: *le ore di questo
 * cantiere finiranno sul nostro ERP, o resteranno qui?* Un cantiere non
 * collegato non è rotto — semplicemente i suoi dati non sono attribuibili a
 * niente là fuori, e la differenza si vede solo a fine mese.
 *
 * **In elenco si mostra solo il collegato.** Marcare anche i non collegati
 * significherebbe un'icona su ogni riga di duecento, e un segnale che c'è
 * sempre smette di essere un segnale. Nella scheda invece si mostrano
 * entrambi gli stati, perché lì la domanda la si sta facendo apposta.
 */
export function SincGestionale({
  collegato,
  /** Codice sul gestionale, se c'è: nel titolo si legge senza aprire nulla. */
  externalId,
  sistema,
  mostraSeAssente = false,
  className,
}: {
  collegato: boolean;
  externalId?: string | null;
  sistema?: string | null;
  mostraSeAssente?: boolean;
  className?: string;
}) {
  if (!collegato && !mostraSeAssente) return null;

  const dove = sistema ? ` ${sistema}` : ' gestionale';

  if (!collegato) {
    return (
      <span
        title={`Non collegato al${dove}: i dati di questo lavoro non escono da Kommessa.`}
        className={cn(
          'inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground',
          className,
        )}
      >
        <CloudOff className="h-3 w-3" aria-hidden="true" />
        Non collegato
      </span>
    );
  }

  return (
    <span
      title={
        externalId
          ? `Collegato al${dove} · ${externalId}`
          : `Collegato al${dove}`
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-sky-500/30 bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-400',
        className,
      )}
    >
      <Cloud className="h-3 w-3" aria-hidden="true" />
      {externalId ?? 'collegato'}
    </span>
  );
}

/** Variante minima per le tabelle fitte: solo la nuvola, niente testo. */
export function SincGestionalePunto({
  collegato,
  externalId,
  sistema,
}: {
  collegato: boolean;
  externalId?: string | null;
  sistema?: string | null;
}) {
  if (!collegato) return null;
  return (
    <span
      title={
        externalId
          ? `Collegato a ${sistema ?? 'gestionale'} · ${externalId}`
          : `Collegato a ${sistema ?? 'gestionale'}`
      }
      className="inline-flex shrink-0 text-sky-600 dark:text-sky-400"
    >
      <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">
        collegato al gestionale{externalId ? ` (${externalId})` : ''}
      </span>
    </span>
  );
}
