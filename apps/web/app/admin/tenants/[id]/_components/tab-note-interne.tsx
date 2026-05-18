'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, Lock } from 'lucide-react';
import { Button, Card, CardContent } from '@impiantixplus/ui';
import { aggiornaTenant } from '../../../_actions/tenants';

export function TabNoteInterne({
  tenantId,
  noteInterne,
}: {
  tenantId: string;
  noteInterne: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [note, setNote] = React.useState(noteInterne);

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Note interne SOLVA
          </h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Visibili solo ai platform admin. Non vengono mostrate al tenant.
        </p>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={10}
          className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          placeholder="Storico contatti, accordi commerciali, gotcha tecnici, riferimenti interni…"
        />
        <div className="flex justify-end">
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await aggiornaTenant({
                  tenantId,
                  note_interne: note || null,
                });
                if (!res.ok) alert(res.error);
                router.refresh();
              })
            }
          >
            <Save className="h-3.5 w-3.5" />
            Salva note
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
