'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play } from 'lucide-react';
import { Button } from '@kommessa/ui';

import { runSyncBatch } from '../_actions/sync';

export function SyncBatchButton() {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [last, setLast] = React.useState<string | null>(null);

  const onClick = async () => {
    setPending(true);
    setLast(null);
    try {
      const r = await runSyncBatch(10);
      setLast(
        `Processati ${r.processed} · ${r.synced} synced · ${r.failed} failed · ${r.skipped} skipped`,
      );
      router.refresh();
    } catch (e) {
      setLast(`Errore: ${e instanceof Error ? e.message : 'unknown'}`);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <Button type="button" onClick={onClick} disabled={pending}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        Esegui batch ora (10)
      </Button>
      {last && <span className="font-mono text-xs text-muted-foreground">{last}</span>}
    </div>
  );
}
