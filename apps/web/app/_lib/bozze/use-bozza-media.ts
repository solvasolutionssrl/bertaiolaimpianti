'use client';

/**
 * Upload dei media DURANTE la bozza (staging R2), in modo che non si perdano
 * se l'utente viene interrotto prima di finalizzare.
 *
 * - `stage(files, enabled)`: carica in background i file non ancora caricati
 *   sulla bozza (enabled = la bozza esiste già lato server). Best-effort, in
 *   catena per non sovrapporre upload.
 * - `finalizeMedia(files)`: attende la catena, carica eventuali rimasti, e
 *   ritorna i fileRefId dei file ANCORA presenti (keep-set per finalizzaBozza,
 *   che eliminerà quelli rimossi dall'utente).
 *
 * I file vengono caricati una sola volta (dedup via mappa mediaId→fileRefId).
 */

import { useCallback, useRef, useState } from 'react';

import {
  uploadMediaBatch,
  type UploadProgressMap,
} from '../../office/commesse/nuova/_lib/upload-media';
import type { MediaFile } from '../../office/commesse/nuova/_components/media-attach-section';

const PENDING = '__pending__';

export function useBozzaMedia(bozzaId: string, flush: () => Promise<void>) {
  // mediaId → fileRefId ('__pending__' mentre in volo)
  const stagedRef = useRef<Map<string, string>>(new Map());
  const chainRef = useRef<Promise<void>>(Promise.resolve());
  const [progress, setProgress] = useState<UploadProgressMap>(new Map());
  const [uploading, setUploading] = useState(false);

  const stage = useCallback(
    (files: MediaFile[], enabled: boolean) => {
      if (!enabled) return;
      const pending = files.filter((f) => !stagedRef.current.has(f.id));
      if (pending.length === 0) return;
      pending.forEach((f) => stagedRef.current.set(f.id, PENDING));
      chainRef.current = chainRef.current.then(async () => {
        setUploading(true);
        try {
          await flush(); // assicura che la bozza esista lato server
          const res = await uploadMediaBatch(pending, { bozzaId }, (p) =>
            setProgress(new Map(p)),
          );
          res.forEach((r) => {
            if (r.ok && r.fileRefId) stagedRef.current.set(r.id, r.fileRefId);
            else stagedRef.current.delete(r.id); // fallito: ritenta al prossimo giro
          });
        } catch {
          pending.forEach((f) => stagedRef.current.delete(f.id));
        } finally {
          setUploading(false);
        }
      });
    },
    [bozzaId, flush],
  );

  const finalizeMedia = useCallback(
    async (
      files: MediaFile[],
    ): Promise<{ keep: string[]; results: Array<{ name: string; ok: boolean }> }> => {
      await chainRef.current; // attendi gli eager in volo
      const missing = files.filter((f) => {
        const v = stagedRef.current.get(f.id);
        return !v || v === PENDING;
      });
      if (missing.length > 0) {
        setUploading(true);
        try {
          await flush();
          const res = await uploadMediaBatch(missing, { bozzaId }, (p) =>
            setProgress(new Map(p)),
          );
          res.forEach((r) => {
            if (r.ok && r.fileRefId) stagedRef.current.set(r.id, r.fileRefId);
          });
        } finally {
          setUploading(false);
        }
      }
      // keep = fileRefId dei file ancora presenti e caricati
      const keep: string[] = [];
      const results: Array<{ name: string; ok: boolean }> = [];
      for (const f of files) {
        const v = stagedRef.current.get(f.id);
        const ok = Boolean(v && v !== PENDING);
        if (ok) keep.push(v as string);
        results.push({ name: f.file.name, ok });
      }
      return { keep, results };
    },
    [bozzaId, flush],
  );

  return { progress, uploading, stage, finalizeMedia };
}
