'use client';

/**
 * PdfAnnotateButton — pulsante "Annota" accanto a un PDF nel tab Documenti.
 *
 * Flusso:
 *  1) Click → risolviFileRefPerPath() (crea file_refs row se mancante)
 *  2) acquisisciLock(fileRefId) (lock pessimistico)
 *  3) ottieniSignedUrl(fileRefId) → URL temporanea al PDF
 *  4) caricaAnnotazioniFile(fileRefId) → annotazioni pre-esistenti per pagina
 *  5) Mount <PdfAnnotator/> (dynamic ssr:false) in dialog full-screen
 *  6) Salvataggi: per-pagina via salvaAnnotazione({ kind:'pdf', page })
 *  7) Close: rilasciaLock + router.refresh
 *
 * UI badge "N annotazioni · M pagine" se la prop `summary` è non null.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { PenLine, MessageSquareDashed, Loader2 } from 'lucide-react';

import { PdfAnnotator } from '../../../../../_components/photo-annotation-loader';
import {
  acquisisciLock,
  caricaAnnotazioniFile,
  ottieniSignedUrl,
  rilasciaLock,
  risolviFileRefPerPath,
  salvaAnnotazione,
} from '../../../../../_actions/annotations';
import {
  deserializeLayer,
  type Shape,
} from '../../../../../_lib/annotation-shapes';

export interface PdfAnnotateButtonProps {
  commessaId: string;
  path: string;
  filename: string;
  sizeBytes?: number;
  /** Riepilogo annotazioni preesistenti (dal view file_annotations_summary). */
  summary?: { total: number; pagine_annotate: number } | null;
}

interface OpenState {
  fileRefId: string;
  fileUrl: string;
  filename: string;
  initialPages: Array<{ page: number; layer: Shape[]; width: number; height: number }>;
}

export function PdfAnnotateButton(props: PdfAnnotateButtonProps) {
  const { commessaId, path, filename, sizeBytes, summary } = props;
  const router = useRouter();
  const [opening, setOpening] = React.useState(false);
  const [state, setState] = React.useState<OpenState | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const apri = async () => {
    setError(null);
    setOpening(true);
    try {
      // 1) Resolve file_ref
      const ref = await risolviFileRefPerPath({
        commessaId,
        path,
        filename,
        sizeBytes,
        mime: 'application/pdf',
      });
      if (!ref.ok) {
        setError(ref.error);
        return;
      }
      const fileRefId = ref.fileRefId;

      // 2) Lock
      const lock = await acquisisciLock(fileRefId);
      if (!lock.ok) {
        const who = lock.lockedBy.displayName ?? 'Un altro utente';
        const sec = lock.lockedBy.remainingSec;
        setError(
          `${who} sta annotando questo PDF. Riprova fra ~${Math.ceil(sec / 60)} min.`,
        );
        return;
      }

      // 3) Signed URL
      const url = await ottieniSignedUrl(fileRefId);
      if (!url.ok) {
        await rilasciaLock(fileRefId);
        setError(url.error);
        return;
      }

      // 4) Carica annotazioni esistenti
      const pages = await caricaAnnotazioniFile(fileRefId);
      const initialPages =
        pages.ok && pages.kind === 'pdf'
          ? pages.pages
              .filter((p) => p.page !== null)
              .map((p) => ({
                page: p.page!,
                layer: deserializeLayer(p.layer),
                width: p.width,
                height: p.height,
              }))
          : [];

      setState({ fileRefId, fileUrl: url.url, filename, initialPages });
    } finally {
      setOpening(false);
    }
  };

  const onClose = async () => {
    if (state) await rilasciaLock(state.fileRefId);
    setState(null);
    router.refresh();
  };

  const onSavePage = async (
    page: number,
    layer: Shape[],
    width: number,
    height: number,
  ) => {
    if (!state) return;
    const res = await salvaAnnotazione({
      fileRefId: state.fileRefId,
      layer,
      width,
      height,
      kind: 'pdf',
      page,
    });
    if (!res.ok) throw new Error(res.error);
  };

  const hasAnnotations = (summary?.total ?? 0) > 0;

  return (
    <>
      <button
        type="button"
        onClick={apri}
        disabled={opening}
        aria-label={`Annota PDF ${filename}`}
        className={[
          'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors',
          hasAnnotations
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'border border-input bg-background text-foreground hover:bg-accent/10 hover:text-accent',
        ].join(' ')}
      >
        {opening ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
        ) : hasAnnotations ? (
          <MessageSquareDashed className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        {hasAnnotations
          ? `${summary!.total} ann · ${summary!.pagine_annotate}p`
          : 'Annota'}
      </button>

      {error ? (
        <span className="text-[10px] text-destructive" role="alert">
          {error}
        </span>
      ) : null}

      {state ? (
        <PdfAnnotator
          fileRefId={state.fileRefId}
          fileUrl={state.fileUrl}
          title={state.filename}
          initialPages={state.initialPages}
          onSavePage={onSavePage}
          onClose={onClose}
        />
      ) : null}
    </>
  );
}
