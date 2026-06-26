'use client';

import * as React from 'react';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@kommessa/ui';

import {
  MediaAttachSection,
  type MediaFile,
} from '../../../../office/commesse/nuova/_components/media-attach-section';
import {
  uploadMediaBatch,
  type UploadProgressMap,
  type UploadMediaResult,
} from '../../../../office/commesse/nuova/_lib/upload-media';

interface Props {
  commessaId: string;
}

type State = 'idle' | 'uploading' | 'done' | 'error';

export function AddMediaSection({ commessaId }: Props) {
  const [files, setFiles] = React.useState<MediaFile[]>([]);
  const [uploadProgress, setUploadProgress] = React.useState<UploadProgressMap>(new Map());
  const [results, setResults] = React.useState<UploadMediaResult[]>([]);
  const [uploadState, setUploadState] = React.useState<State>('idle');
  const abortRef = React.useRef<AbortController | null>(null);

  const handleUpload = async () => {
    if (files.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setUploadState('uploading');
    try {
      const res = await uploadMediaBatch(
        files,
        commessaId,
        (map) => setUploadProgress(new Map(map)),
        controller.signal,
      );
      setResults(res);
      const cancelled = res.every((r) => r.error === 'Annullato');
      setUploadState(cancelled ? 'idle' : res.some((r) => !r.ok) ? 'error' : 'done');
    } catch {
      setUploadState('error');
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    abortRef.current?.abort();
    setUploadProgress(new Map());
    setUploadState('idle');
  };

  const reset = () => {
    setFiles([]);
    setUploadProgress(new Map());
    setResults([]);
    setUploadState('idle');
  };

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok && r.error !== 'Annullato').length;
  const uploading = uploadState === 'uploading';

  if (uploadState === 'done' || (uploadState === 'error' && results.length > 0)) {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {ok > 0 && (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{ok} file caricati con successo</span>
          </div>
        )}
        {fail > 0 && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              {fail} file non caricati —{' '}
              {results.find((r) => !r.ok && r.error !== 'Annullato')?.error ?? 'errore sconosciuto'}
            </span>
          </div>
        )}
        <Button type="button" variant="outline" size="sm" onClick={reset} className="w-full">
          Carica altri file
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <MediaAttachSection
        files={files}
        onChange={setFiles}
        uploading={uploading}
        uploadProgress={uploadProgress}
        onCancel={handleCancel}
      />

      {files.length > 0 && !uploading && (
        <Button
          type="button"
          size="lg"
          className="min-h-[48px] w-full"
          onClick={handleUpload}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Carica {files.length} file
        </Button>
      )}
    </div>
  );
}
