import { AlertTriangle, Cloud, CloudOff, CloudUpload } from 'lucide-react';
import { cn } from '@kommessa/ui';

/**
 * ⚠️ **Il nome del gestionale non si scrive da nessuna parte.**
 *
 * Non nelle etichette, non nei suggerimenti al passaggio del mouse, da nessuna
 * parte. A schermo si dice sempre **«il gestionale locale»**.
 *
 * Il motivo è pratico: il giorno che il secondo cliente ha un programma
 * diverso, una scritta col nome del primo va cercata in venti file e riscritta,
 * ammesso di ricordarsene. E nel frattempo qualcuno legge il nome sbagliato.
 * Con la parola generica non cambia niente e non sbaglia nessuno.
 *
 * Chi ha bisogno di sapere quale programma sia — noi, per assistenza — lo trova
 * nel pannello di piattaforma. Il cliente ne ha uno solo: per lui è «il
 * gestionale», punto.
 *
 * **Il vocabolario, uguale ovunque:**
 * - «**Collegato al gestionale locale**»: un'anagrafica nostra è agganciata a
 *   una loro (un cantiere con una commessa di là);
 * - «**Registrato sul gestionale locale**»: un dato nostro (una spesa, delle
 *   ore, un viaggio) è uscito davvero.
 *
 * Sono due cose diverse: un cantiere può essere collegato da settimane senza
 * che ne sia ancora uscito niente.
 */

/**
 * La nuvoletta «questo lavoro è collegato al gestionale locale».
 *
 * Risponde a una domanda che in ufficio ci si fa in continuazione: *le ore di
 * questo cantiere finiranno di là, o restano qui?* Un cantiere non collegato
 * non è rotto, semplicemente i suoi dati non sono attribuibili a niente là
 * fuori, e se ne accorgono a fine mese.
 *
 * **In elenco si segna solo chi è collegato.** Marcare anche gli altri vorrebbe
 * dire un'icona su ognuna di duecento righe, e un segnale che c'è sempre smette
 * di essere un segnale. Nella scheda invece si mostrano tutti e due gli stati,
 * perché lì la domanda uno se la sta facendo apposta.
 */
export function SincGestionale({
  collegato,
  /** Il codice di là, se c'è: si legge senza aprire niente. */
  externalId,
  mostraSeAssente = false,
  className,
}: {
  collegato: boolean;
  externalId?: string | null;
  mostraSeAssente?: boolean;
  className?: string;
}) {
  if (!collegato && !mostraSeAssente) return null;

  if (!collegato) {
    return (
      <span
        title="Non è collegato al gestionale locale: i dati di questo lavoro non escono da qui."
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
          ? `Collegato al gestionale locale, con il codice ${externalId}.`
          : 'Collegato al gestionale locale.'
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
}: {
  collegato: boolean;
  externalId?: string | null;
}) {
  if (!collegato) return null;
  const testo = externalId
    ? `Collegato al gestionale locale, con il codice ${externalId}.`
    : 'Collegato al gestionale locale.';
  return (
    <span title={testo} className="inline-flex shrink-0 text-sky-600 dark:text-sky-400">
      <Cloud className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="sr-only">{testo}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Dati usciti
// ---------------------------------------------------------------------------

export interface Esportazione {
  esito: 'ok' | 'errore' | string;
  /** Quando è arrivato di là: lo dichiara chi ce l'ha portato. */
  scrittoAl: string;
  /** Numero documento, protocollo, quello che il gestionale ha risposto. */
  riferimento?: unknown;
  errore?: string | null;
}

/**
 * «Questa spesa (o riga di ore, o viaggio) è arrivata sul gestionale locale.»
 *
 * Non è un dettaglio da tecnici: è la differenza fra un documento che il
 * commercialista troverà e uno che qualcuno dovrà reinserire a mano. Finché
 * questo segno non c'era, l'unico modo di saperlo era chiedere a noi.
 *
 * Tre stati e basta:
 * - **uscito**: verde, col riferimento nel suggerimento;
 * - **non riuscito**: ambra col motivo, perché un tentativo andato male non
 *   deve somigliare a «non ancora provato»;
 * - **niente**: nessun segno. In un dato momento la maggior parte delle spese
 *   non è ancora uscita, e un'icona su ogni riga sarebbe solo rumore.
 */
export function RegistratoSulGestionale({
  esportazioni,
  compatto = false,
}: {
  esportazioni: Esportazione[] | undefined;
  compatto?: boolean;
}) {
  if (!esportazioni || esportazioni.length === 0) return null;

  const riuscite = esportazioni.filter((e) => e.esito === 'ok');
  const fallite = esportazioni.filter((e) => e.esito !== 'ok');

  if (riuscite.length === 0) {
    const motivo = fallite[0]?.errore?.slice(0, 200);
    return (
      <span
        title={`Ho provato a mandarla sul gestionale locale e non ci sono riuscito.${motivo ? ` Motivo: ${motivo}` : ''}`}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
      >
        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
        {compatto ? null : 'Non è uscita'}
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
      title={`Registrata sul gestionale locale il ${quando}.${rif ? `\n${rif}` : ''}`}
      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
    >
      <CloudUpload className="h-3 w-3" aria-hidden="true" />
      {compatto ? null : 'Sul gestionale'}
    </span>
  );
}
