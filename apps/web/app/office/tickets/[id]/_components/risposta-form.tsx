'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent } from '@impiantixplus/ui';
import { inviaMessaggio } from '../../../_actions/tickets';

export function RispostaForm({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);

  return (
    <form
      action={(fd) => {
        setErr(null);
        const body = String(fd.get('body') ?? '').trim();
        const isInternal = fd.get('internal') === 'on';
        if (!body) {
          setErr('Scrivi un messaggio prima di inviare.');
          return;
        }
        start(async () => {
          try {
            await inviaMessaggio({
              ticketId,
              body,
              isInternalNote: isInternal,
            });
            if (ref.current) ref.current.value = '';
            router.refresh();
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Errore invio.');
          }
        });
      }}
    >
      <Card>
        <CardContent className="space-y-3 p-4">
          <textarea
            ref={ref}
            name="body"
            rows={4}
            placeholder="Scrivi una risposta…"
            className="w-full rounded-md border border-input bg-background p-2 text-sm"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" name="internal" />
              Nota interna (non inviata al cliente)
            </label>
            <Button type="submit" size="sm" disabled={pending}>
              {pending ? 'Invio…' : 'Invia'}
            </Button>
          </div>
          {err && <p className="text-xs text-destructive">{err}</p>}
        </CardContent>
      </Card>
    </form>
  );
}
