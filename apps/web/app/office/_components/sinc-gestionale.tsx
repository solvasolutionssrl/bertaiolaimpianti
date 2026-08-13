import { AlertTriangle, Cloud, CloudOff, CloudUpload } from 'lucide-react';
import { cn } from '@kommessa/ui';

/**
 * ⚠️ **Il nome del gestionale non si scrive MAI in un'etichetta.**
 *
 * A schermo si dice sempre «il gestionale». Il nome vero (`ergo`,
 * `teamsystem`, quello che sarà) arriva dalla configurazione del cliente e
 * compare **solo nel suggerimento al passaggio del mouse**, dove è
 * un'informazione di servizio e non una parola cucita nel prodotto.
 *
 * Il motivo è pratico: il giorno che il secondo cliente ha un ERP diverso,
 * una scritta «Aggiornato su ERGO» va cercata in venti file e riscritta —
 * ammesso di ricordarsene. Con la parola generica non cambia niente.
 *
 * **Il vocabolario, uguale ovunque:**
 * - «**Collegato al gestionale**» → un'anagrafica nostra è agganciata a una
 *   loro (un cantiere ↔ una commessa esterna);
 * - «**Registrato sul gestionale**» → un dato nostro (una spesa, delle ore,
 *   un viaggio) è stato portato fuori davvero.
 *
 * Sono due cose diverse, e vanno tenute distinte: un cantiere può essere
 * collegato da settimane senza che ne sia ancora uscito niente.
 */

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

// ---------------------------------------------------------------------------
// Record portati fuori
// ---------------------------------------------------------------------------

export interface Esportazione {
  esito: 'ok' | 'errore' | string;
  /** Quando è finito sul gestionale: lo dichiara chi ce l'ha portato. */
  scrittoAl: string;
  /** Numero documento, protocollo… quello che il gestionale ha risposto. */
  riferimento?: unknown;
  errore?: string | null;
}

/**
 * «Questa spesa (o riga di ore, o viaggio) è finita sul gestionale.»
 *
 * Non è un dettaglio da amministratore: è la differenza fra un documento che
 * il commercialista troverà e uno che dovrà essere inserito a mano. Finché
 * questo segno non c'era, l'unico modo di saperlo era aprire il pannello di
 * piattaforma — cioè non saperlo.
 *
 * Tre stati e basta:
 * - **uscito** → verde, con il riferimento del gestionale nel suggerimento;
 * - **fallito** → ambra col motivo, perché un tentativo andato male non deve
 *   somigliare a «non ancora provato»;
 * - **niente** → nessun segno. Un'icona su ogni riga di cinquanta sarebbe
 *   rumore, e la maggior parte delle spese, in un dato momento, non è ancora
 *   uscita.
 */
export function RegistratoSulGestionale({
  esportazioni,
  sistema,
  compatto = false,
}: {
  esportazioni: Esportazione[] | undefined;
  sistema?: string | null;
  compatto?: boolean;
}) {
  if (!esportazioni || esportazioni.length === 0) return null;

  const riuscite = esportazioni.filter((e) => e.esito === 'ok');
  const fallite = esportazioni.filter((e) => e.esito !== 'ok');
  const dove = sistema ? ` (${sistema})` : '';

  if (riuscite.length === 0) {
    const motivo = fallite[0]?.errore?.slice(0, 200);
    return (
      <span
        title={`Tentato l'invio al gestionale${dove} senza riuscirci.${motivo ? ` Motivo: ${motivo}` : ''}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {compatto ? null : 'Invio non riuscito'}
      </span>
    );
  }

  const ultima = riuscite.reduce((a, b) => (a.scrittoAl > b.scrittoAl ? a : b));
  const quando = new Intl.DateTimeFormat('it-IT', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'Europe/Rome',
  }).format(new Date(ultima.scrittoAl));
  const rif =
    ultima.riferimento && typeof ultima.riferimento === 'object'
      ? Object.entries(ultima.riferimento as Record<string, unknown>)
          .map(([k, v]) => `${k}: ${String(v)}`)
          .join(' · ')
      : null;

  return (
    <span
      title={`Registrato sul gestionale${dove} il ${quando}.${rif ? `\n${rif}` : ''}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
    >
      <CloudUpload className="h-3 w-3" aria-hidden="true" />
      {compatto ? null : 'Sul gestionale'}
    </span>
  );
}
