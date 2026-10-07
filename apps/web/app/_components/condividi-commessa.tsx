'use client';

import * as React from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Check, Copy, Eye, EyeOff, Link2, Loader2, Share2, X } from 'lucide-react';
import { Button, cn } from '@kommessa/ui';
import {
  GIORNI_VALIDITA,
  giorniRimasti,
  urlLinkPubblico,
} from '@kommessa/api/link-pubblico';

import {
  creaLinkPubblico,
  revocaLinkPubblico,
  type LinkPubblicoVista,
} from '../_actions/link-pubblico';
import { useAlert, useConfirm } from './confirm-provider';

/**
 * Condividere il lavoro con chi non ha un account.
 *
 * ## La scelta sui «dettagli», e perché è qui e non nel codice
 *
 * I dettagli di una commessa sono la **dettatura integrale del capo**: possono
 * contenere il nome di chi ha chiamato, un numero di telefono, un indirizzo —
 * cioè esattamente ciò che questo link non deve esporre. Decidere una volta per
 * tutte nel codice sarebbe sbagliato in entrambi i versi: escluderli sempre
 * toglie l'informazione utile, includerli sempre fa uscire dati che non
 * dovevano.
 *
 * Quindi si sceglie link per link, **con il testo sotto gli occhi**. Non si può
 * condividere per sbaglio un numero di telefono che si è appena letto.
 *
 * ## Due tocchi, e non è una svista
 *
 * `navigator.share` apre il foglio di condivisione del sistema solo se viene
 * chiamata **dentro il gesto che l'ha scatenata**: su iOS una chiamata che
 * arriva dopo un `await` viene rifiutata con `NotAllowedError`, perché nel
 * frattempo l'attivazione dell'utente è scaduta. Creare il collegamento è una
 * server action, cioè un giro di rete: non c'è modo di generarlo e condividerlo
 * nello stesso tocco. E non si può aggirare passando una promessa a `share`:
 * `ShareData` accetta solo `title`, `text`, `url` e `files`, valori già pronti.
 *
 * Perciò il primo tocco **crea** e il secondo **manda**: l'indirizzo compare a
 * schermo e il tasto diventa «Invia il collegamento», che è una riga sola
 * dentro il gesto — appunti e foglio di condivisione, senza niente in mezzo.
 *
 * ## Il dialog si può comandare da fuori
 *
 * `aperto` / `onApertoChange` servono a chi tiene il tasto in un contenitore
 * che si chiude al tocco (il menu «⋯» della scheda sul telefono). ⚠️ Un
 * componente con stato dentro un contenitore che si smonta al click perde lo
 * stato nello stesso istante in cui lo imposta: React 18 batcha i due
 * aggiornamenti, il contenitore sparisce, e con lui lo stato appena scritto.
 * Il tasto sta nel menu, lo stato sta fuori.
 */

/**
 * Cosa finisce nel messaggio.
 *
 * ⚠️ **Niente che venga dalla commessa.** Il titolo risolto pesca dalla
 * dettatura del capo e dal nome della cartella, che contiene il nome del
 * cliente: le stesse cose che la pagina pubblica non mostra. Il messaggio lo
 * scrive chi manda; qui dentro va l'indirizzo e nient'altro.
 */
const TITOLO_CONDIVISIONE = 'Foto e video del lavoro';
const TESTO_CONDIVISIONE = `Foto e video del lavoro. Il collegamento scade dopo ${GIORNI_VALIDITA} giorni.`;

/** Com'è andato l'ultimo invio. Si dice sotto al tasto, in una riga. */
type Esito = 'foglio' | 'appunti' | 'copia-fallita';

const MESSAGGIO_ESITO: Record<Esito, string> = {
  foglio: 'Copiato negli appunti. Scegliete dove mandarlo.',
  appunti: 'Copiato negli appunti: incollatelo in un messaggio.',
  'copia-fallita': 'Appunti non disponibili: copiate l’indirizzo qui sopra a mano.',
};

export function CondividiCommessa({
  commessaId,
  /** Il link già attivo, se c'è. Il token NON c'è: non si rilegge. */
  linkAttivo,
  dettagliTesto,
  /**
   * L'origine con cui si compone l'indirizzo, letta dal server.
   * ⚠️ `window.location.origin` è solo il ripiego: su un deploy di anteprima
   * scriverebbe nel collegamento l'host dell'anteprima, che fra una settimana
   * non risponde più.
   */
  origine: origineServer,
  /** Apertura comandata da fuori. Senza, il dialog si regge da sé. */
  aperto,
  onApertoChange,
  /** Falso quando il tasto lo disegna chi ci sta attorno (voce di menu). */
  renderTrigger = true,
}: {
  commessaId: string;
  linkAttivo: LinkPubblicoVista | null;
  dettagliTesto: string | null;
  origine?: string;
  aperto?: boolean;
  onApertoChange?: (aperto: boolean) => void;
  renderTrigger?: boolean;
}) {
  const router = useRouter();
  const alert = useAlert();
  const confirm = useConfirm();

  // Chi passa `aperto` comanda, e lo stato interno resta fermo: due verità
  // sull'apertura si contraddicono al primo tocco.
  const [apertoInterno, setApertoInterno] = React.useState(false);
  const mostrato = aperto ?? apertoInterno;
  const cambiaApertura = (v: boolean) => {
    if (aperto === undefined) setApertoInterno(v);
    onApertoChange?.(v);
  };

  const [mostraDettagli, setMostraDettagli] = React.useState(
    linkAttivo?.mostraDettagli ?? false,
  );
  const [token, setToken] = React.useState<string | null>(null);
  const [inCorso, setInCorso] = React.useState(false);
  const [copiato, setCopiato] = React.useState(false);
  const [esito, setEsito] = React.useState<Esito | null>(null);

  // Il foglio di condivisione c'è sui telefoni e non sui computer. Si guarda
  // dopo il montaggio: in SSR `navigator` non esiste, e un controllo nel render
  // farebbe divergere server e client. `montato` serve al portal: niente
  // `document` sul server.
  const [montato, setMontato] = React.useState(false);
  const [sistemaCondivide, setSistemaCondivide] = React.useState(false);
  React.useEffect(() => {
    setMontato(true);
    setSistemaCondivide(typeof navigator.share === 'function');
  }, []);

  // Riaprendo il dialog non si resta con l'esito dell'invio di prima.
  React.useEffect(() => {
    if (mostrato) setEsito(null);
  }, [mostrato]);

  const origine =
    origineServer ?? (typeof window !== 'undefined' ? window.location.origin : '');
  const url = token ? urlLinkPubblico(origine, token) : null;

  async function genera() {
    if (linkAttivo) {
      const ok = await confirm({
        title: 'Rigenerare il collegamento?',
        description: 'Il collegamento mandato finora smette di funzionare subito. Chi lo ha ricevuto non vedrà più le foto finché non gli arriva quello nuovo.',
        confirmLabel: 'Rigenera',
      });
      if (!ok) return;
    }
    setEsito(null);
    setInCorso(true);
    const r = await creaLinkPubblico({ commessaId, mostraDettagli });
    setInCorso(false);
    if (!r.ok) {
      await alert({ title: 'Non creato', body: r.error });
      return;
    }
    setToken(r.data.token);
    router.refresh();
  }

  async function spegni() {
    const ok = await confirm({
      title: 'Spegnere il collegamento?',
      description: 'Chi lo ha ricevuto non vedrà più niente. L’operazione non si annulla: per ricondividere se ne genera uno nuovo.',
      confirmLabel: 'Spegni',
      destructive: true,
    });
    if (!ok) return;
    setInCorso(true);
    const r = await revocaLinkPubblico({ commessaId });
    setInCorso(false);
    if (!r.ok) {
      await alert({ title: 'Non spento', body: r.error });
      return;
    }
    setToken(null);
    setEsito(null);
    router.refresh();
  }

  /** Scrivere negli appunti senza mai sollevare: in HTTP non c'è `clipboard`. */
  function negliAppunti(valore: string): Promise<void> {
    try {
      return navigator.clipboard.writeText(valore);
    } catch (e) {
      return Promise.reject(e);
    }
  }

  async function copia() {
    if (!url) return;
    try {
      await negliAppunti(url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      await alert({
        title: 'Copia non riuscita',
        body: 'Selezionate l’indirizzo e copiatelo a mano.',
      });
    }
  }

  /**
   * Il tasto principale quando l'indirizzo c'è: appunti **e** foglio di
   * condivisione del sistema.
   *
   * ⚠️ Da qui alla chiamata a `navigator.share` non c'è **nessun `await`**, ed
   * è la sola ragione per cui funziona: la chiamata vale solo finché vale il
   * tocco che l'ha scatenata. Le due promesse si gestiscono dopo, con `then`.
   * L'ordine non è casuale: gli appunti si scrivono per primi perché `share`
   * **consuma** l'attivazione dell'utente, e dopo una share consumata una
   * scrittura negli appunti verrebbe rifiutata da WebKit.
   */
  function invia() {
    if (!url) return;
    const dati: ShareData = {
      title: TITOLO_CONDIVISIONE,
      text: TESTO_CONDIVISIONE,
      url,
    };

    negliAppunti(url).then(
      () => {
        setCopiato(true);
        setTimeout(() => setCopiato(false), 2000);
      },
      () => setEsito('copia-fallita'),
    );

    const puoCondividere =
      sistemaCondivide &&
      (typeof navigator.canShare !== 'function' || navigator.canShare(dati));
    if (!puoCondividere) {
      setEsito('appunti');
      return;
    }

    setEsito('foglio');
    navigator.share(dati).catch((errore: unknown) => {
      // Chiudere il foglio senza scegliere non è un guasto: non si dice niente.
      // Si guarda il nome e non il tipo: c'è chi solleva un `DOMException` e
      // chi un `Error`, e il nome è l'unica cosa su cui sono d'accordo.
      if ((errore as { name?: string } | null)?.name === 'AbortError') return;
      setEsito('appunti');
    });
  }

  const trigger = renderTrigger ? (
    <Button type="button" size="sm" variant="outline" onClick={() => cambiaApertura(true)}>
      <Share2 aria-hidden="true" className="h-3.5 w-3.5" />
      Condividi il lavoro
      {linkAttivo ? (
        <span className="ml-1 h-2 w-2 rounded-full bg-emerald-500" />
      ) : null}
    </Button>
  ) : null;

  if (!mostrato || !montato) return trigger;

  const giorni = linkAttivo ? giorniRimasti(linkAttivo, new Date()) : null;

  // Il dialog va su `body`: nella scheda sul telefono questo componente vive
  // dentro l'Hero, che ha `overflow-hidden`, e sotto una barra fissa in basso.
  // Un `fixed` lasciato lì resta intrappolato nel contesto di impilamento
  // della pagina, anche con uno z alto.
  const dialog = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Condividi il lavoro"
      /*
       * Sul telefono il pannello **non** e' incollato in basso.
       *
       * Com'era: `items-end` e angoli arrotondati solo in cima, cioe' a filo
       * col bordo dello schermo. Su un iPhone quel bordo e' occupato dalla
       * barra di sistema (la striscia del gesto «home»), quindi l'ultimo tasto
       * finiva sotto una zona che intercetta lo scorrimento: si prova a
       * premerlo e invece si chiude l'app.
       *
       * ⚠️ Non basta uno stacco fisso: con `viewport-fit=cover` l'altezza
       * della finestra comprende quella barra, e quanto misura dipende dal
       * modello. Quindi **10% dello schermo PIU' la zona di sicurezza**, letta
       * dal sistema. Su un telefono senza barra `env(...)` vale zero e resta
       * il solo 10%.
       *
       * Da schermo largo torna centrato come prima (`sm:`).
       */
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 px-3 pb-[calc(10dvh+env(safe-area-inset-bottom,0px))] sm:items-center sm:px-4 sm:pb-0"
      onClick={() => cambiaApertura(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        /* Angoli tondi su tutti e quattro i lati: staccato dal bordo, due
           angoli vivi in fondo si leggono come un pannello tagliato.
           Il `max-h` lascia fuori lo stacco appena aggiunto, altrimenti un
           contenuto lungo tornerebbe a toccare il bordo. */
        className="max-h-[calc(90dvh-10dvh-env(safe-area-inset-bottom,0px))] w-full max-w-lg overflow-y-auto rounded-2xl bg-background p-4 shadow-soft-lg sm:max-h-[90dvh]"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">Condividi il lavoro</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Un indirizzo da mandare in un messaggio. Chi lo apre vede il
              titolo del lavoro, le foto e i video
              {dettagliTesto
                ? ', e i dettagli solo se la casella qui sotto è spuntata.'
                : '.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => cambiaApertura(false)}
            aria-label="Chiudi"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {/* Cosa NON esce. Detto prima, non in fondo. */}
        <ul className="mb-3 space-y-1 rounded-lg border border-border bg-muted/30 p-2.5 text-xs text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <EyeOff aria-hidden="true" className="h-3 w-3 shrink-0" />
            Non si vedono: anagrafica e contatti, indirizzo, mappa, stato del
            lavoro, codice interno, documenti e preventivi.
          </li>
          <li className="flex items-center gap-1.5">
            <Eye aria-hidden="true" className="h-3 w-3 shrink-0" />
            Si vedono: il titolo del lavoro, le foto e i video.
          </li>
        </ul>

        {/* La scelta sui dettagli, col testo vero sotto gli occhi. */}
        {dettagliTesto ? (
          <div className="mb-3 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5">
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={mostraDettagli}
                onChange={(e) => setMostraDettagli(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0"
              />
              <span className="min-w-0 text-xs">
                <span className="block font-semibold">
                  Mostra anche i dettagli del lavoro
                </span>
                <span className="mt-0.5 block text-muted-foreground">
                  Chi riceve il collegamento leggerà <strong>esattamente</strong>{' '}
                  questo:
                </span>
                <span className="mt-1.5 block max-h-24 overflow-y-auto whitespace-pre-wrap rounded border border-border bg-background px-2 py-1.5 text-[11px] leading-relaxed">
                  {dettagliTesto}
                </span>
              </span>
            </label>
          </div>
        ) : null}

        {/* L'indirizzo appena generato: si vede UNA volta. */}
        {url ? (
          <div className="mb-3 rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-2.5">
            <p className="mb-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-400">
              Pronto. Mandatelo adesso: l&apos;indirizzo non si rilegge più.
            </p>
            <div className="flex items-center gap-1.5">
              <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1.5 text-[11px]">
                {url}
              </code>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={copia}
                className="shrink-0"
              >
                {copiato ? (
                  <Check aria-hidden="true" className="h-3.5 w-3.5" />
                ) : (
                  <Copy aria-hidden="true" className="h-3.5 w-3.5" />
                )}
                {copiato ? 'Copiato' : 'Copia'}
              </Button>
            </div>
          </div>
        ) : null}

        {/* Il link già attivo, e perché non lo si può rimandare così com'è. */}
        {linkAttivo && !url ? (
          <div className="mb-3 rounded-lg border border-border p-2.5 text-xs">
            <p className="flex items-center gap-1.5 font-medium">
              <Link2 aria-hidden="true" className="h-3.5 w-3.5 text-emerald-600" />
              C&apos;è un collegamento attivo
            </p>
            <p className="mt-1 text-muted-foreground">
              Scade fra {giorni} {giorni === 1 ? 'giorno' : 'giorni'} ·{' '}
              {linkAttivo.aperture === 0
                ? 'mai aperto'
                : `aperto ${linkAttivo.aperture} ${linkAttivo.aperture === 1 ? 'volta' : 'volte'}`}
              {linkAttivo.creatoDaNome ? ` · creato da ${linkAttivo.creatoDaNome}` : ''}
            </p>
            <p className="mt-1 text-muted-foreground">
              L&apos;indirizzo non è conservato da nessuna parte: non si
              rilegge e non si può rimandare da qui. Per mandarlo di nuovo va
              rigenerato, e quello consegnato finora smette di funzionare
              subito.
            </p>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {url ? (
            <Button type="button" onClick={invia} size="sm">
              {sistemaCondivide ? (
                <Share2 aria-hidden="true" className="h-3.5 w-3.5" />
              ) : (
                <Copy aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {sistemaCondivide ? 'Invia il collegamento' : 'Copia il collegamento'}
            </Button>
          ) : (
            <Button type="button" onClick={genera} disabled={inCorso} size="sm">
              {inCorso ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {linkAttivo ? 'Rigenera il collegamento' : 'Crea il collegamento'}
            </Button>
          )}
          {linkAttivo ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={spegni}
              disabled={inCorso}
            >
              Spegni
            </Button>
          ) : null}
          <span className={cn('text-xs text-muted-foreground', inCorso && 'opacity-60')}>
            {esito
              ? MESSAGGIO_ESITO[esito]
              : `Scade da solo dopo ${GIORNI_VALIDITA} giorni.`}
          </span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {trigger}
      {createPortal(dialog, document.body)}
    </>
  );
}
