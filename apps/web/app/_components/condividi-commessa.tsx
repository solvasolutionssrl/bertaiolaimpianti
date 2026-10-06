'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, Eye, EyeOff, Link2, Loader2, Share2, X } from 'lucide-react';
import { Button, cn } from '@kommessa/ui';
import { giorniRimasti, urlLinkPubblico } from '@kommessa/api/link-pubblico';

import {
  creaLinkPubblico,
  revocaLinkPubblico,
  type LinkPubblicoVista,
} from '../_actions/link-pubblico';
import { useAlert, useConfirm } from './confirm-provider';

/**
 * Condividere una commessa con chi non ha un account.
 *
 * ## La scelta sui «dettagli», e perché è qui e non nel codice
 *
 * I dettagli di una commessa sono la **dettatura integrale del capo**: possono
 * contenere il nome del cliente, un numero di telefono, un indirizzo — cioè
 * esattamente ciò che questo link non deve esporre. Decidere una volta per
 * tutte nel codice sarebbe sbagliato in entrambi i versi: escluderli sempre
 * toglie l'informazione utile, includerli sempre fa uscire dati che non
 * dovevano.
 *
 * Quindi si sceglie link per link, **con il testo sotto gli occhi**. Non si può
 * condividere per sbaglio un numero di telefono che si è appena letto.
 *
 * ## Il testo del tasto dice cosa succede
 *
 * «Rigenera» non è un sinonimo di «crea»: spegne il link precedente. Chi preme
 * dev'essere avvisato prima, non scoprirlo quando il cliente scrive che il
 * link non va più.
 */

export function CondividiCommessa({
  commessaId,
  /** Il link già attivo, se c'è. Il token NON c'è: non si rilegge. */
  linkAttivo,
  dettagliTesto,
  /** Come il tasto si presenta: voce di menu sul telefono, tasto in ufficio. */
  variante = 'tasto',
  onChiudiMenu,
}: {
  commessaId: string;
  linkAttivo: LinkPubblicoVista | null;
  dettagliTesto: string | null;
  variante?: 'tasto' | 'voce-menu';
  onChiudiMenu?: () => void;
}) {
  const router = useRouter();
  const alert = useAlert();
  const confirm = useConfirm();

  const [aperto, setAperto] = React.useState(false);
  const [mostraDettagli, setMostraDettagli] = React.useState(
    linkAttivo?.mostraDettagli ?? false,
  );
  const [token, setToken] = React.useState<string | null>(null);
  const [inCorso, setInCorso] = React.useState(false);
  const [copiato, setCopiato] = React.useState(false);

  const origine = typeof window !== 'undefined' ? window.location.origin : '';
  const url = token ? urlLinkPubblico(origine, token) : null;

  async function genera() {
    if (linkAttivo) {
      const ok = await confirm({
        title: 'Rigenerare il collegamento?',
        description: 'Il collegamento mandato finora smette di funzionare subito. Chi lo ha ricevuto non vedrà più le foto finché non gli mandate quello nuovo.',
        confirmLabel: 'Rigenera',
      });
      if (!ok) return;
    }
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
    router.refresh();
  }

  async function copia() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiato(true);
      setTimeout(() => setCopiato(false), 2000);
    } catch {
      await alert({
        title: 'Copia non riuscita',
        body: 'Selezionate l’indirizzo e copiatelo a mano.',
      });
    }
  }

  const apri = () => {
    setAperto(true);
    onChiudiMenu?.();
  };

  const trigger =
    variante === 'voce-menu' ? (
      <button
        type="button"
        onClick={apri}
        className="flex min-h-[44px] w-full items-center gap-2.5 px-3 text-left text-sm transition hover:bg-accent/10"
      >
        <Share2 aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
        Condividi con il cliente
        {linkAttivo ? (
          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
        ) : null}
      </button>
    ) : (
      <Button type="button" size="sm" variant="outline" onClick={apri}>
        <Share2 aria-hidden="true" className="h-3.5 w-3.5" />
        Condividi
        {linkAttivo ? (
          <span className="ml-1 h-2 w-2 rounded-full bg-emerald-500" />
        ) : null}
      </Button>
    );

  if (!aperto) return trigger;

  const giorni = linkAttivo ? giorniRimasti(linkAttivo, new Date()) : null;

  return (
    <>
      {trigger}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Condividi la commessa"
        className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center"
        onClick={() => setAperto(false)}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-background p-4 sm:rounded-2xl"
        >
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">Condividi con il cliente</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Un indirizzo da mandare in un messaggio. Chi lo apre vede le foto
                e i video, e nient&apos;altro.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAperto(false)}
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
              Non si vedono: telefono, indirizzo, mappa, nome del cliente, stato
              del lavoro, documenti e preventivi.
            </li>
            <li className="flex items-center gap-1.5">
              <Eye aria-hidden="true" className="h-3 w-3 shrink-0" />
              Si vedono: il titolo del lavoro e le foto e i video.
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
                    Chi apre il collegamento leggerà <strong>esattamente</strong>{' '}
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
                Pronto. Copiatelo adesso: non si rilegge più.
              </p>
              <div className="flex items-center gap-1.5">
                <code className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2 py-1.5 text-[11px]">
                  {url}
                </code>
                <Button type="button" size="sm" onClick={copia} className="shrink-0">
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

          {/* Lo stato del link già attivo. */}
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
                L&apos;indirizzo non si rilegge: se è stato perso, rigeneratelo.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={genera} disabled={inCorso} size="sm">
              {inCorso ? (
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 aria-hidden="true" className="h-3.5 w-3.5" />
              )}
              {linkAttivo ? 'Rigenera' : 'Crea il collegamento'}
            </Button>
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
              Scade da solo dopo 30 giorni.
            </span>
          </div>
        </div>
      </div>
    </>
  );
}
