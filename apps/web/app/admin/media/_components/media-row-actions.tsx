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
  Undo2,
} from 'lucide-react';
import { Button } from '@kommessa/ui';

import {
  forceResetFile,
  hardDeleteFile,
  restoreMedia,
  retrySyncFile,
} from '../_actions/sync';
import { useConfirm } from '@/app/_components/confirm-provider';

interface Props {
  fileRefId: string;
  /** Disabilita il retry se lo stato non è ritentabile (es. uploading, synced). */
  canRetry: boolean;
  /** Status corrente, per decidere se mostrare "Forza reset". */
  status: string;
  /** Scadenza del cestino (deleted_at + 30gg). Solo per status='deleted'. */
  purgeAfter?: string | null;
}

/** "tra 12 giorni" / "tra 3 ore" / "in scadenza" a partire da una ISO futura. */
function formatCountdown(iso: string): { label: string; urgent: boolean } {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return { label: 'in scadenza', urgent: true };
  const giorni = Math.floor(ms / 86_400_000);
  if (giorni >= 1) {
    return { label: `scade tra ${giorni} ${giorni === 1 ? 'giorno' : 'giorni'}`, urgent: giorni <= 3 };
  }
  const ore = Math.max(1, Math.floor(ms / 3_600_000));
  return { label: `scade tra ${ore} ${ore === 1 ? 'ora' : 'ore'}`, urgent: true };
}

export function MediaRowActions({ fileRefId, canRetry, status, purgeAfter }: Props) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<{ ok: boolean; message: string } | null>(null);

  const runAction = async (fn: () => Promise<{ ok: boolean; message: string }>) => {
    setPending(true);
    setResult(null);
    try {
      const r = await fn();
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

  const onRetry = () => runAction(() => retrySyncFile(fileRefId));

  const onForceReset = async () => {
    const ok = await askConfirm({
      title: 'Forzare il reset di questo file?',
      description:
        'Lo stato torna a "uploaded" e il prossimo batch cron (≤10 min) lo riproverà da zero. Da usare quando un file è bloccato in syncing/sync_failed e il retry normale non basta.',
      confirmLabel: 'Sì, resetta',
      destructive: true,
    });
    if (!ok) return;
    runAction(() => forceResetFile(fileRefId));
  };

  const onHardDelete = async () => {
    const ok = await askConfirm({
      title: 'Spostare questo file nel cestino?',
      description:
        'Sparirà da Nextcloud e da tutta l’app. Il backup su R2 resta 30 giorni: entro quel termine puoi Ripristinarlo da qui. Oltre la scadenza il cron lo elimina in via definitiva. Audit registrato.',
      confirmLabel: 'Sì, sposta nel cestino',
      destructive: true,
    });
    if (!ok) return;
    runAction(() => hardDeleteFile(fileRefId));
  };

  const onRestore = async () => {
    const ok = await askConfirm({
      title: 'Ripristinare questo file dal cestino?',
      description:
        'Il file verrà rimesso su Nextcloud (ri-sincronizzato da R2) e tornerà visibile nella commessa e negli allegati riunione collegati.',
      confirmLabel: 'Sì, ripristina',
    });
    if (!ok) return;
    runAction(() => restoreMedia(fileRefId));
  };

  // "Forza reset" disponibile per i casi in cui il file è bloccato in stato
  // intermedio o failed-recoverable. Per 'synced' non serve. Per 'uploading'
  // l'upload R2 è ancora in atto sul client → non resettare.
  const canForceReset = ['syncing', 'sync_failed'].includes(status);
  const inCestino = status === 'deleted';
  // Ripristinabile solo finché il backup R2 non è stato purgato (purge_after
  // ancora valorizzato). Dopo il purge non c'è più nulla da rimettere.
  const canRestore = inCestino && !!purgeAfter;
  const countdown = purgeAfter ? formatCountdown(purgeAfter) : null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {!inCestino ? (
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
      ) : null}

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

      {inCestino ? (
        <>
          {countdown ? (
            <span
              className={
                'whitespace-nowrap font-mono text-[10px] ' +
                (countdown.urgent ? 'text-destructive' : 'text-muted-foreground')
              }
              title="Scadenza del backup nel cestino (poi eliminazione definitiva)"
            >
              {countdown.label}
            </span>
          ) : (
            <span className="whitespace-nowrap font-mono text-[10px] text-muted-foreground">
              backup purgato
            </span>
          )}
          {canRestore ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onRestore}
              disabled={pending}
              title="Ripristina: rimette il file su Nextcloud e nell'app"
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Undo2 className="h-3.5 w-3.5" />
              )}
              Ripristina
            </Button>
          ) : null}
        </>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onHardDelete}
          disabled={pending}
          title="Sposta nel cestino: rimuove da Nextcloud, tiene il backup R2 per 30 giorni"
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      )}

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
