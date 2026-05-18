'use client';

/**
 * Grid client-side della galleria foto commessa (ufficio).
 *
 * Server component fetcha la lista; questo client component gestisce:
 *  - apertura dell'editor in modale full-screen
 *  - acquisizione/rilascio lock pessimistico
 *  - salvataggio shapes via Server Action `salvaAnnotazione`
 *  - refresh dei dati (`router.refresh`) dopo il save
 *
 * Mostriamo un badge "Annotata" sulla thumbnail se è presente una riga
 * `file_annotations` (qualsiasi version).
 */

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Image as ImgIcon, PencilLine, MessageSquareDashed } from 'lucide-react';

import {
  PhotoAnnotationEditor,
} from '../../../../_components/photo-annotation-loader';
import {
  acquisisciLock,
  ottieniSignedUrl,
  rilasciaLock,
  salvaAnnotazione,
} from '../../../../_actions/annotations';
import {
  deserializeLayer,
  type Shape,
} from '../../../../_lib/annotation-shapes';
import { fmtDataOra } from '../../../_lib/format';

export interface FotoItem {
  id: string;
  filename: string;
  mime: string;
  thumbnail_url: string | null;
  taken_at: string | null;
  uploaded_at: string | null;
  momento: string | null;
  // Annotazione max-version (se esiste)
  annotation: {
    id: string;
    layer_json: unknown;
    width_px: number;
    height_px: number;
  } | null;
}

export interface FotoGridProps {
  foto: FotoItem[];
}

export function FotoGrid({ foto }: FotoGridProps) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<{
    fileRefId: string;
    imageUrl: string;
    filename: string;
    initialLayer: Shape[];
    width: number;
    height: number;
  } | null>(null);
  const [lockError, setLockError] = React.useState<string | null>(null);
  const [opening, setOpening] = React.useState<string | null>(null);

  const apriEditor = async (f: FotoItem) => {
    setLockError(null);
    setOpening(f.id);
    try {
      // 1) Lock
      const lockRes = await acquisisciLock(f.id);
      if (!lockRes.ok) {
        const who = lockRes.lockedBy.displayName ?? 'Un altro utente';
        const sec = lockRes.lockedBy.remainingSec;
        setLockError(
          `${who} sta editando questa foto. Riprova fra ~${Math.ceil(sec / 60)} min.`,
        );
        return;
      }

      // 2) Signed URL (la thumbnail_url è low-res; serve l'originale)
      const urlRes = await ottieniSignedUrl(f.id);
      if (!urlRes.ok) {
        setLockError(urlRes.error);
        await rilasciaLock(f.id);
        return;
      }

      const initialLayer = f.annotation
        ? deserializeLayer(f.annotation.layer_json)
        : [];

      setEditing({
        fileRefId: f.id,
        imageUrl: urlRes.url,
        filename: f.filename,
        initialLayer,
        // Se abbiamo già un canvas reference dal record, usiamolo per
        // garantire coordinate stabili fra editor e viewer.
        width: f.annotation?.width_px ?? 0,
        height: f.annotation?.height_px ?? 0,
      });
    } finally {
      setOpening(null);
    }
  };

  const onClose = async () => {
    if (editing) await rilasciaLock(editing.fileRefId);
    setEditing(null);
    router.refresh();
  };

  const onSave = async (layer: Shape[], width: number, height: number) => {
    if (!editing) return;
    const res = await salvaAnnotazione({
      fileRefId: editing.fileRefId,
      layer,
      width,
      height,
    });
    if (!res.ok) throw new Error(res.error);
  };

  if (foto.length === 0) return null;

  return (
    <>
      {lockError ? (
        <div
          role="alert"
          className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          {lockError}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {foto.map((f) => {
          const hasAnnotation = !!f.annotation;
          return (
            <figure
              key={f.id}
              className="group relative overflow-hidden rounded-md border border-border bg-card"
            >
              <button
                type="button"
                onClick={() => apriEditor(f)}
                disabled={opening === f.id}
                aria-label={`Annota foto ${f.filename}`}
                className="block w-full text-left"
              >
                {f.thumbnail_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.thumbnail_url}
                    alt={f.filename}
                    className="aspect-square w-full object-cover transition-transform group-hover:scale-[1.02]"
                  />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-muted text-muted-foreground">
                    <ImgIcon className="h-6 w-6" />
                  </div>
                )}

                {/* Overlay azione */}
                <span className="pointer-events-none absolute inset-x-2 bottom-10 hidden items-center justify-center gap-1 rounded-md bg-black/70 px-2 py-1 text-xs font-medium text-white group-hover:flex">
                  <PencilLine className="h-3.5 w-3.5" aria-hidden="true" />
                  Annota
                </span>

                {/* Badge annotata */}
                {hasAnnotation ? (
                  <span
                    className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-primary/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground shadow"
                    title="Foto annotata"
                  >
                    <MessageSquareDashed
                      className="h-3 w-3"
                      aria-hidden="true"
                    />
                    Annotata
                  </span>
                ) : null}
              </button>

              <figcaption className="px-2 py-1.5 text-[11px] text-muted-foreground">
                <p className="truncate font-medium text-foreground">
                  {f.filename}
                </p>
                <p>{fmtDataOra(f.taken_at ?? f.uploaded_at)}</p>
                {f.momento ? <p>{f.momento}</p> : null}
              </figcaption>
            </figure>
          );
        })}
      </div>

      {editing ? (
        <PhotoAnnotationEditor
          fileRefId={editing.fileRefId}
          imageUrl={editing.imageUrl}
          title={editing.filename}
          initialLayer={editing.initialLayer}
          width={editing.width || undefined}
          height={editing.height || undefined}
          onSave={onSave}
          onClose={onClose}
        />
      ) : null}
    </>
  );
}
