'use client';

/**
 * PdfAnnotatorStandalone — client wrapper della route /annota.
 *
 * Esegue (in useEffect) la sequenza identica al PdfAnnotateButton modale
 * ma "standalone": lock + signed url + caricaAnnotazioniFile, poi mount
 * PdfAnnotator. Su close → router.push() torna alla lista documenti.
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { PdfAnnotator } from '../../../../../../_components/photo-annotation-loader';
import {
  acquisisciLock,
  caricaAnnotazioniFile,
  ottieniSignedUrl,
  rilasciaLock,
  salvaAnnotazione,
} from '../../../../../../_actions/annotations';
import {
  deserializeLayer,
  type Shape,
} from '../../../../../../_lib/annotation-shapes';

export interface PdfAnnotatorStandaloneProps {
  commessaId: string;
  fileRefId: string;
  filename: string;
}

export function PdfAnnotatorStandalone(props: PdfAnnotatorStandaloneProps) {
  const { commessaId, fileRefId, filename } = props;
  const router = useRouter();
  const [fileUrl, setFileUrl] = React.useState<string | null>(null);
  const [initialPages, setInitialPages] = React.useState<
    Array<{ page: number; layer: Shape[]; width: number; height: number }>
  >([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // Lock
      const lock = await acquisisciLock(fileRefId);
      if (cancelled) return;
      if (!lock.ok) {
        const who = lock.lockedBy.displayName ?? 'Un altro utente';
        setError(`${who} sta annotando questo PDF. Riprova fra qualche minuto.`);
        return;
      }
      // Signed URL
      const url = await ottieniSignedUrl(fileRefId);
      if (cancelled) return;
      if (!url.ok) {
        await rilasciaLock(fileRefId);
        setError(url.error);
        return;
      }
      // Annotazioni esistenti
      const pages = await caricaAnnotazioniFile(fileRefId);
      const init =
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
      if (cancelled) return;
      setInitialPages(init);
      setFileUrl(url.url);
    })();
    return () => {
      cancelled = true;
      // Best-effort rilascio lock al unmount
      void rilasciaLock(fileRefId);
    };
  }, [fileRefId]);

  const onClose = () => {
    router.push(`/office/commesse/${commessaId}/documenti`);
  };

  const onSavePage = async (
    page: number,
    layer: Shape[],
    width: number,
    height: number,
  ) => {
    const res = await salvaAnnotazione({
      fileRefId,
      layer,
      width,
      height,
      kind: 'pdf',
      page,
    });
    if (!res.ok) throw new Error(res.error);
  };

  if (error) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-slate-950 p-6 text-slate-100">
        <p className="max-w-md rounded-md border border-amber-300/30 bg-amber-50/10 px-4 py-3 text-center text-sm text-amber-200">
          {error}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Torna ai documenti
        </button>
      </div>
    );
  }

  if (!fileUrl) {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-3 bg-slate-950 text-slate-100">
        <div className="h-0.5 w-32 animate-pulse bg-gradient-to-r from-primary to-accent" />
        <Loader2 className="h-6 w-6 animate-spin" aria-hidden="true" />
        <p className="text-sm text-slate-300">Apertura PDF…</p>
      </div>
    );
  }

  return (
    <PdfAnnotator
      fileRefId={fileRefId}
      fileUrl={fileUrl}
      title={filename}
      initialPages={initialPages}
      onSavePage={onSavePage}
      onClose={onClose}
    />
  );
}
