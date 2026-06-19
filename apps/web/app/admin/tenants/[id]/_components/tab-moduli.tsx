'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Badge, Button, Card, CardContent } from '@kommessa/ui';
import { aggiornaModuloTenant } from '../../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

export function TabModuli({
  tenantId,
  kantiereAttivo,
}: {
  tenantId: string;
  kantiereAttivo: boolean;
}) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [attivo, setAttivo] = React.useState(kantiereAttivo);
  const dirty = attivo !== kantiereAttivo;

  const apply = () => {
    start(async () => {
      const res = await aggiornaModuloTenant({
        tenantId,
        moduleCode: 'kantiere',
        attivo,
      });
      if (!res.ok) {
        await showAlert({ title: 'Errore', body: res.error });
        return;
      }
      router.refresh();
    });
  };

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        {/* base: sempre attivo, non modificabile */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Base</p>
            <p className="text-[11px] text-muted-foreground">
              Commesse, foto, ticketing. Sempre attivo per ogni tenant.
            </p>
          </div>
          <Badge variant="secondary">Sempre attivo</Badge>
        </div>

        {/* kantiere: toggle */}
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">Kantiere — Tesserino Digitale</p>
            <p className="text-[11px] text-muted-foreground">
              Dipendenti, squadre, presenze/ore, QR cantiere. Additivo a base.
            </p>
          </div>
          <label className="inline-flex shrink-0 cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={attivo}
              onChange={(e) => setAttivo(e.target.checked)}
              disabled={pending}
            />
            <span className="text-xs text-muted-foreground">
              {attivo ? 'Attivo' : 'Spento'}
            </span>
          </label>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border pt-4">
          <p className="text-[11px] leading-snug text-muted-foreground">
            L&apos;attivazione è immediata. Lo storico audit registra il cambio
            e l&apos;utente platform admin.
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {dirty ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setAttivo(kantiereAttivo)}
                disabled={pending}
              >
                Annulla
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              onClick={apply}
              disabled={pending || !dirty}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {pending ? 'Salvo…' : 'Applica'}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
