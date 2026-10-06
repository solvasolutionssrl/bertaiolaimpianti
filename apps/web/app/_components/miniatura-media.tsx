'use client';

import * as React from 'react';
import { FileWarning, Play } from 'lucide-react';
import { cn } from '@kommessa/ui';

/**
 * L'anteprima di un file in galleria: **attesa, errore e segnaposto in un
 * posto solo**.
 *
 * ## Cosa c'era prima
 *
 * Sei gallerie, sei comportamenti. Una sola (la scheda commessa mobile) aveva
 * `onError` e una rete di sicurezza a tempo; le altre no. Dove non c'era
 * `onError`, un'immagine che non arriva restava un riquadro rotto per sempre;
 * dove c'era uno stato di attesa senza scadenza, la rotella girava finché
 * qualcuno non cambiava pagina.
 *
 * I video poi non avevano anteprima affatto: si montava
 * `<video preload="metadata">` puntato al **file intero** sperando che il
 * browser disegnasse il primo fotogramma. Su iPhone (`.mov` HEVC) non succede
 * quasi mai, e intanto ogni cella della griglia si tirava giù l'intestazione di
 * un filmato da decine di MB.
 *
 * ## Come funziona ora
 *
 * Foto e video chiedono **la stessa cosa** — `/api/photo/<id>?size=thumb` —
 * perché da oggi anche i video hanno una miniatura vera, estratta dal telefono
 * al momento dell'invio. Il video si distingue solo per il triangolo sopra.
 *
 * Tre strade, tutte chiuse:
 *
 * - arriva → si vede;
 * - l'anteprima non c'è (404: video vecchi, miniatura mai generata) → segnaposto
 *   **subito**, nessuna attesa;
 * - non arriva né un sì né un no → dopo `ATTESA_MAX_MS` si mostra il
 *   segnaposto. È la rete contro la rotella eterna: un evento che non scatta
 *   non si può aspettare per sempre.
 */

/** Oltre questo tempo si smette di aspettare e si mostra il segnaposto. */
const ATTESA_MAX_MS = 12_000;

export function MiniaturaMedia({
  fileId,
  video = false,
  alt,
  className,
  /** Testo del segnaposto quando l'anteprima non c'è. */
  etichettaAssente,
}: {
  fileId: string;
  video?: boolean;
  alt: string;
  className?: string;
  etichettaAssente?: string;
}) {
  const [stato, setStato] = React.useState<'attesa' | 'ok' | 'assente'>('attesa');

  React.useEffect(() => {
    // Il file può cambiare se la griglia riusa la cella: si riparte da capo.
    setStato('attesa');
  }, [fileId]);

  React.useEffect(() => {
    if (stato !== 'attesa') return;
    const t = setTimeout(() => setStato('assente'), ATTESA_MAX_MS);
    return () => clearTimeout(t);
  }, [stato, fileId]);

  const assente = stato === 'assente';

  return (
    <span
      className={cn(
        'relative flex items-center justify-center overflow-hidden bg-muted',
        className,
      )}
    >
      {!assente ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/photo/${fileId}?size=thumb`}
          alt={alt}
          loading="lazy"
          decoding="async"
          onLoad={() => setStato('ok')}
          onError={() => setStato('assente')}
          className={cn(
            'h-full w-full object-cover transition-opacity duration-200',
            stato === 'ok' ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}

      {stato === 'attesa' ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-muted-foreground/10"
        />
      ) : null}

      {assente ? (
        <span className="flex flex-col items-center gap-1 px-1 text-center text-muted-foreground">
          {video ? (
            <Play aria-hidden="true" className="h-5 w-5" />
          ) : (
            <FileWarning aria-hidden="true" className="h-5 w-5" />
          )}
          <span className="text-[10px] leading-tight">
            {etichettaAssente ?? (video ? 'Video' : 'Anteprima non pronta')}
          </span>
        </span>
      ) : null}

      {video && !assente ? (
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white shadow">
            <Play className="h-4 w-4 fill-current" />
          </span>
        </span>
      ) : null}
    </span>
  );
}
