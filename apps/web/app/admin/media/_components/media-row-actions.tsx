'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

import {
  forceResetFile,
  hardDeleteFile,
  retrySyncFile,
} from '../_actions/sync';
import { useConfirm } from '@/app/_components/confirm-provider';

interface Props {
  fileRefId: string;
  /** Disabilita il retry se lo stato non è ritentabile (es. uploading, synced). */
  canRetry: boolean;
  /** Status corrente, per decidere se mostrare "Forza reset". */
  status: string;
}

export function MediaRowActions({ fileRefId, canRetry, status }: Props) {
  const router = useRouter();
  const askConfirm = useConfirm();
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
      setTimeout(() => setResult(null), 6000);
    }
  };

  const onForceReset = async () => {
    const ok = await askConfirm({
      title: 'Forzare il reset di questo file?',
      description:
        'Lo stato torna a "uploaded" e il prossimo batch cron (≤10 min) lo riproverà da zero. Da usare quando un file è bloccato in syncing/sync_failed e il retry normale non basta.',
      confirmLabel: 'Sì, resetta',
      destructive: true,
    });
    if (!ok) return;
    setPending(true);
    setResult(null);
    try {
      const r = await forceResetFile(fileRefId);
      setResult(r);
      router.refresh();
    } catch (e) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : 'Errore sconosciuto',
      });
    } finally {
      setPending(false);
      setTimeout(() => setResult(null), 6000);
    }
  };

  // "Forza reset" disponibile per i casi in cui il file è bloccato in stato
  // intermedio o failed-recoverable. Per 'synced' non serve. Per 'uploading'
  // l'upload R2 è ancora in atto sul client → non resettare.
  const canForceReset = ['syncing', 'sync_failed'].includes(status);
  // Hard delete: tutti gli stati tranne 'deleted'.
  const canDelete = status !== 'deleted';

  const onHardDelete = async () => {
    const ok = await askConfirm({
      title: 'Eliminare definitivamente questo file?',
      description:
        'Verrà rimosso da R2 e dai link applicativi (es. allegati riunione). La copia su Nextcloud NON viene toccata — la elimini a mano dal client Nextcloud se serve. Audit registrato. Operazione non reversibile.',
      confirmLabel: 'Sì, elimina',
      destructive: true,
    });
    if (!ok) return;
    setPending(true);
    setResult(null);
    try {
      const r = await hardDeleteFile(fileRefId);
      setResult(r);
      router.refresh();
    } catch (e) {
      setResult({
        ok: false,
        message: e instanceof Error ? e.message : 'Errore sconosciuto',
      });
    } finally {
      setPending(false);
      setTimeout(() => setResult(null), 6000);
    }
  };

  return (
    <div className="flex items-center justify-end gap-1.5">
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
      {canForceReset ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onForceReset}
          disabled={pending}
          title="Forza reset: riporta lo stato a 'uploaded' per ricominciare il sync da zero"
          className="text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {canDelete ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onHardDelete}
          disabled={pending}
          title="Elimina file: rimuove da R2 + link applicativi (Nextcloud lo elimini a mano)"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      {result && (
        <span
          className={
            'max-w-[260px] truncate font-mono text-[10px] ' +
            (result.ok ? 'text-success' : 'text-destructive')
          }
          title={result.message}
        >
          {result.message}
        </span>
      )}
    </div>
  );
}
