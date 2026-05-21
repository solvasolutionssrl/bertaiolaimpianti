'use client';

/**
 * AnnotationOverlay — orchestra l'apertura dell'editor di annotazioni
 * sopra al MediaLightbox.
 *
 * Flusso:
 *   1. resolveFileRefId():
 *      - se item.annotation.fileRefId è già noto → usalo
 *      - altrimenti chiama risolviFileRefPerPath per creare/recuperare la
 *        riga file_refs corrispondente al file su Nextcloud
 *   2. acquisisciLock(fileRefId) (lock pessimistico, TTL 5 min)
 *   3. caricaAnnotazioniFile(fileRefId) → initialLayer (immagini) o
 *      initialPages (PDF)
 *   4. Mount PhotoAnnotator (immagini) o PdfAnnotator (PDF) in dialog
 *   5. onSave → salvaAnnotazione(...) (per-pagina nei PDF)
 *   6. onClose → rilasciaLock + chiudi
 *
 * Mostra messaggi chiari se il file è bloccato da un altro utente o se
 * la risoluzione del fileRef fallisce.
 */

import * as React from 'react';
import { Loader2, AlertTriangle } from 'lucide-react';

import {
  acquisisciLock,
  caricaAnnotazioniFile,
  rilasciaLock,
  risolviFileRefPerPath,
  salvaAnnotazione,
} from '../_actions/annotations';
import type { Shape } from '../_lib/annotation-shapes';

import { PhotoAnnotator, PdfAnnotator } from './annotation/loader';

export interface AnnotationTarget {
  /** Se il file ha già un row su file_refs, passa l'id direttamente. */
  fileRefId?: string;
  /** Altrimenti, info per risolvere/creare la riga via risolviFileRefPerPath. */
  resolve?: {
    commessaId: string;
    path: string;
    filename: string;
    mime?: string;
    sizeBytes?: number;
  };
}

interface Props {
  /** URL sorgente per l'annotator (img/pdf). */
  src: string;
  /** Mime principale del file (image/* o application/pdf). */
  mime: string;
  /** Filename (titolo). */
  filename: string;
  /** Target per risoluzione + lock. */
  target: AnnotationTarget;
  onClose: () => void;
}

type Stage =
  | { kind: 'resolving' }
  | { kind: 'locking'; fileRefId: string }
  | { kind: 'loading'; fileRefId: string }
  | {
      kind: 'ready';
      fileRefId: string;
      kindFile: 'image' | 'pdf';
      initialLayer?: Shape[];
      initialWidth?: number;
      initialHeight?: number;
      initialPages?: Array<{ page: number; layer: Shape[]; width: number; height: number }>;
    }
  | { kind: 'locked_by_other'; userName: string | null; remainingSec: number }
  | { kind: 'error'; message: string };

export function AnnotationOverlay({ src, mime, filename, target, onClose }: Props) {
  const [stage, setStage] = React.useState<Stage>({ kind: 'resolving' });
  const lockedRef = React.useRef<string | null>(null);

  const isPdf = mime === 'application/pdf' || /\.pdf$/i.test(filename);
  const isImage = mime.startsWith('image/');

  // Bootstrap (mount once)
  React.useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        // 1. Resolve fileRefId
        let fileRefId = target.fileRefId;
        if (!fileRefId) {
          if (!target.resolve) {
            setStage({ kind: 'error', message: 'Nessun target per annotazione' });
            return;
          }
          const r = await risolviFileRefPerPath(target.resolve);
          if (cancelled) return;
          if (!r.ok) {
            setStage({ kind: 'error', message: r.error });
            return;
          }
          fileRefId = r.fileRefId;
        }

        // 2. Acquire lock
        setStage({ kind: 'locking', fileRefId });
        const lock = await acquisisciLock(fileRefId);
        if (cancelled) return;
        if (!lock.ok) {
          setStage({
            kind: 'locked_by_other',
            userName: lock.lockedBy.displayName,
            remainingSec: lock.lockedBy.remainingSec,
          });
          return;
        }
        lockedRef.current = fileRefId;

        // 3. Load existing annotations
        setStage({ kind: 'loading', fileRefId });
        const loaded = await caricaAnnotazioniFile(fileRefId);
        if (cancelled) return;
        if (!loaded.ok) {
          setStage({ kind: 'error', message: loaded.error });
          return;
        }

        // 4. Build initial layer/pages
        if (isPdf) {
          const pages = loaded.pages
            .filter((p) => p.page !== null)
            .map((p) => ({
              page: p.page as number,
              layer: p.layer,
              width: p.width,
              height: p.height,
            }));
          setStage({
            kind: 'ready',
            fileRefId,
            kindFile: 'pdf',
            initialPages: pages,
          });
        } else {
          const single = loaded.pages.find((p) => p.page === null) ?? loaded.pages[0];
          setStage({
            kind: 'ready',
            fileRefId,
            kindFile: 'image',
            initialLayer: single?.layer ?? [],
            initialWidth: single?.width,
            initialHeight: single?.height,
          });
        }
      } catch (e) {
        if (cancelled) return;
        setStage({
          kind: 'error',
          message: e instanceof Error ? e.message : 'Errore sconosciuto',
        });
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      // Release lock on unmount (best-effort)
      const id = lockedRef.current;
      if (id) {
        rilasciaLock(id).catch(() => {});
        lockedRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── Render ─────────────────────────────────────────────────────────────

  if (stage.kind === 'resolving' || stage.kind === 'locking' || stage.kind === 'loading') {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-100">
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <p className="text-sm text-slate-300">
          {stage.kind === 'resolving' && 'Preparazione file…'}
          {stage.kind === 'locking' && 'Acquisizione lock…'}
          {stage.kind === 'loading' && 'Caricamento annotazioni…'}
        </p>
      </div>
    );
  }

  if (stage.kind === 'locked_by_other') {
    const mins = Math.ceil(stage.remainingSec / 60);
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/95 p-6">
        <div className="max-w-sm rounded-xl border border-amber-500/40 bg-amber-950/40 p-5 text-amber-100">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <p className="font-semibold">File in modifica</p>
          </div>
          <p className="text-sm text-amber-200/90">
            {stage.userName ? `${stage.userName}` : 'Un altro utente'} sta annotando questo
            file. Riprova fra ~{mins} minut{mins === 1 ? 'o' : 'i'}.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-md bg-amber-500/20 px-4 py-2 text-sm font-medium text-amber-100 hover:bg-amber-500/30"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  if (stage.kind === 'error') {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/95 p-6">
        <div className="max-w-sm rounded-xl border border-red-500/40 bg-red-950/40 p-5 text-red-100">
          <div className="mb-2 flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            <p className="font-semibold">Impossibile aprire l'editor</p>
          </div>
          <p className="text-sm text-red-200/90">{stage.message}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded-md bg-red-500/20 px-4 py-2 text-sm font-medium text-red-100 hover:bg-red-500/30"
          >
            Chiudi
          </button>
        </div>
      </div>
    );
  }

  // stage.kind === 'ready'
  const fileRefId = stage.fileRefId;

  if (stage.kindFile === 'image' && isImage) {
    return (
      <div className="fixed inset-0 z-[60]">
        <PhotoAnnotator
          fileRefId={fileRefId}
          imageUrl={src}
          title={filename}
          initialLayer={stage.initialLayer}
          width={stage.initialWidth}
          height={stage.initialHeight}
          onSave={async (layer, width, height) => {
            await salvaAnnotazione({
              fileRefId,
              layer,
              width,
              height,
              kind: 'image',
            });
          }}
          onClose={() => {
            const id = lockedRef.current;
            if (id) {
              rilasciaLock(id).catch(() => {});
              lockedRef.current = null;
            }
            onClose();
          }}
        />
      </div>
    );
  }

  if (stage.kindFile === 'pdf' && isPdf) {
    return (
      <div className="fixed inset-0 z-[60]">
        <PdfAnnotator
          fileRefId={fileRefId}
          fileUrl={src}
          title={filename}
          initialPages={stage.initialPages}
          onSavePage={async (page, layer, width, height) => {
            await salvaAnnotazione({
              fileRefId,
              layer,
              width,
              height,
              kind: 'pdf',
              page,
            });
          }}
          onClose={() => {
            const id = lockedRef.current;
            if (id) {
              rilasciaLock(id).catch(() => {});
              lockedRef.current = null;
            }
            onClose();
          }}
        />
      </div>
    );
  }

  return null;
}
