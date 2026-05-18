'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, CardContent, Input, Label } from '@impiantixplus/ui';
import { creaTicket } from '../../../_actions/tickets';

export function NuovoTicketForm({
  clienti,
}: {
  clienti: Array<{ id: string; ragione_sociale: string }>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  return (
    <form
      action={(fd) => {
        setErr(null);
        const oggetto = String(fd.get('oggetto') ?? '').trim();
        const descrizione = String(fd.get('descrizione') ?? '').trim();
        const clienteId = String(fd.get('cliente_id') ?? '') || undefined;
        const priorita = String(fd.get('priorita') ?? 'media') as any;
        if (oggetto.length < 3) {
          setErr("L'oggetto è troppo corto.");
          return;
        }
        start(async () => {
          try {
            const res = await creaTicket({
              oggetto,
              descrizione,
              clienteId,
              priorita,
              source: 'manual',
            });
            router.push(`/office/tickets/${res.id}`);
          } catch (e) {
            setErr(e instanceof Error ? e.message : 'Errore.');
          }
        });
      }}
    >
      <Card>
        <CardContent className="space-y-4 p-6">
          <div>
            <Label htmlFor="oggetto">Oggetto</Label>
            <Input id="oggetto" name="oggetto" required className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="cliente_id">Cliente</Label>
            <select
              id="cliente_id"
              name="cliente_id"
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="">— Nessuno —</option>
              {clienti.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.ragione_sociale}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="priorita">Priorità</Label>
            <select
              id="priorita"
              name="priorita"
              defaultValue="media"
              className="mt-1.5 h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="bassa">Bassa</option>
              <option value="media">Media</option>
              <option value="alta">Alta</option>
              <option value="urgente">Urgente</option>
            </select>
          </div>
          <div>
            <Label htmlFor="descrizione">Descrizione</Label>
            <textarea
              id="descrizione"
              name="descrizione"
              rows={5}
              required
              className="mt-1.5 w-full rounded-md border border-input bg-background p-2 text-sm"
            />
          </div>
          {err && <p className="text-sm text-destructive">{err}</p>}
          <div className="flex items-center justify-end gap-2">
            <Button asChild type="button" variant="ghost">
              <a href="/office/tickets">Annulla</a>
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? 'Creazione…' : 'Apri ticket'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
