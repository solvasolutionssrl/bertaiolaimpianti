'use client';

import * as React from 'react';
import { Upload, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@impiantixplus/ui';

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

  const handleUpload = async () => {
    if (files.length === 0) return;
    setUploadState('uploading');
    try {
      const res = await uploadMediaBatch(files, commessaId, (map) =>
        setUploadProgress(new Map(map)),
      );
      setResults(res);
      setUploadState(res.some((r) => !r.ok) ? 'error' : 'done');
    } catch {
      setUploadState('error');
    }
  };

  const reset = () => {
    setFiles([]);
    setUploadProgress(new Map());
    setResults([]);
    setUploadState('idle');
  };

  const ok = results.filter((r) => r.ok).length;
  const fail = results.filter((r) => !r.ok).length;
  const uploading = uploadState === 'uploading';

  if (uploadState === 'done' || uploadState === 'error') {
    return (
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {ok > 0 && (
          <div className="flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{ok} foto/video caricati con successo</span>
          </div>
        )}
        {fail > 0 && (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{fail} file non caricati — riprova</span>
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
      />

      {files.length > 0 && !uploading && (
        <Button
          type="button"
          size="lg"
          className="min-h-[48px] w-full"
          onClick={handleUpload}
        >
          <Upload className="h-4 w-4" aria-hidden="true" />
          Carica {files.length} foto/video
        </Button>
      )}

      {uploading && (
        <div className="flex items-center justify-center gap-2 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          <span>Caricamento in corso…</span>
        </div>
      )}
    </div>
  );
}
