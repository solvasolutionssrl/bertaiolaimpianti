'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@impiantixplus/ui';
import { ArrowRightLeft } from 'lucide-react';
import { convertiInCommessa } from '../../../_actions/tickets';

export function ConvertiButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="secondary"
        size="sm"
        disabled={pending}
        onClick={() => {
          setErr(null);
          start(async () => {
            try {
              const res = await convertiInCommessa({ ticketId });
              router.push(`/office/commesse/${res.commessaId}`);
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Errore conversione.');
            }
          });
        }}
      >
        <ArrowRightLeft className="h-4 w-4" />
        {pending ? 'Conversione…' : 'Converti in commessa'}
      </Button>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </div>
  );
}
