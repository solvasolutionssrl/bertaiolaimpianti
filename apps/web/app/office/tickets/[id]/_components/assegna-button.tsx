'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@impiantixplus/ui';
import { Shuffle } from 'lucide-react';
import { assegnaRoundRobin } from '../../../_actions/tickets';

/**
 * Bottone "Assegna automaticamente" — round-robin sul carico ticket aperti
 * dello staff del tenant. Chiama `assegnaRoundRobin` server action.
 */
export function AssegnaButton({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setErr(null);
          setOk(null);
          start(async () => {
            try {
              const res = await assegnaRoundRobin(ticketId);
              setOk(`Assegnato (carico precedente: ${res.carico} ticket).`);
              router.refresh();
            } catch (e) {
              setErr(e instanceof Error ? e.message : 'Errore assegnazione.');
            }
          });
        }}
      >
        <Shuffle className="h-4 w-4" />
        {pending ? 'Assegnazione…' : 'Assegna automaticamente'}
      </Button>
      {err && <p className="text-xs text-destructive">{err}</p>}
      {ok && <p className="text-xs text-muted-foreground">{ok}</p>}
    </div>
  );
}
