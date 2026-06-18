'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { History, Loader2 } from 'lucide-react';

import { Button } from '@kommessa/ui';
import { ripristinaVersione } from '../../../../../_actions/ripristina-versione';

/**
 * Pulsante "Ripristina" — visibile solo al superadmin (gating server-side
 * nella pagina). Ripristina i SOLI contenuti della versione; voci/cartelle
 * restano invariate. Genera una nuova versione 'ripristino'.
 */
export function RipristinaButton({
  commessaId,
  versioneId,
  versione,
}: {
  commessaId: string;
  versioneId: string;
  versione: number;
}) {
  const router = useRouter();
  const [conferma, setConferma] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const ripristina = () => {
    setError(null);
    start(async () => {
      const res = await ripristinaVersione({ commessaId, versioneId });
      if (res.ok) {
        setConferma(false);
        router.refresh();
        return;
      }
      setError(res.error);
    });
  };

  if (!conferma) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 px-2 text-[11px]"
        onClick={() => setConferma(true)}
      >
        <History className="h-3 w-3" aria-hidden="true" />
        Ripristina
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-[11px] text-muted-foreground">
        Ripristinare i contenuti della v{versione}? Tipologie e cartelle non
        verranno modificate.
      </p>
      <div className="flex items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={pending}
          onClick={() => setConferma(false)}
        >
          Annulla
        </Button>
        <Button
          type="button"
          size="sm"
          className="h-7 px-2 text-[11px]"
          disabled={pending}
          onClick={ripristina}
        >
          {pending ? (
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          ) : null}
          Conferma ripristino
        </Button>
      </div>
      {error ? (
        <p className="text-[11px] text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
