'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@kommessa/ui';
import { testR2Connection } from '../../_actions/storage-r2';
import { useAlert } from '@/app/_components/confirm-provider';

export function RetestButton() {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();

  const handleRetest = () => {
    start(async () => {
      const res = await testR2Connection();
      if (!res.ok) {
        await showAlert({
          title: 'Errore connessione R2',
          body: res.error,
        });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleRetest}
      disabled={pending}
    >
      {pending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {pending ? 'Test in corso…' : 'Ri-testa connessione'}
    </Button>
  );
}
