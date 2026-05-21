'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@impiantixplus/ui';

import { retrySyncFile } from '../_actions/sync';

interface Props {
  fileRefId: string;
  /** Disabilita il retry se lo stato non è ritentabile (es. uploading, synced). */
  canRetry: boolean;
}

export function MediaRowActions({ fileRefId, canRetry }: Props) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  const onRetry = async () => {
    setPending(true);
    setResult(null);
    try {
      const r = await retrySyncFile(fileRefId);
      setResult(r);
      router.refresh();
    } catch (e) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : 'Errore sconosciuto',
      });
    } finally {
      setPending(false);
      setTimeout(() => setResult(null), 4000);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRetry}
        disabled={pending || !canRetry}
        title={!canRetry ? 'Stato non ritentabile' : 'Sincronizza ora'}
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : result?.ok ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" />
        ) : result?.ok === false ? (
          <AlertCircle className="h-3.5 w-3.5 text-destructive" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        Re-sync
      </Button>
      {result && (
        <span
          className={
            'truncate font-mono text-[10px] ' +
            (result.ok ? 'text-success' : 'text-destructive')
          }
          title={result.message}
        >
          {result.message.slice(0, 40)}
        </span>
      )}
    </div>
  );
}
