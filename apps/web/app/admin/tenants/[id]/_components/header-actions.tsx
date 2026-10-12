'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Eye, MoreVertical, RotateCcw, Trash2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@kommessa/ui';
import {
  sospendiTenant,
  riattivaTenant,
  eliminaTenant,
} from '../../../_actions/tenants';
import { SceltaImpersonazione } from '../../../_components/scegli-impersonazione';
import { useConfirm, useAlert } from '@/app/_components/confirm-provider';

interface Props {
  tenantId: string;
  slug: string;
  nome: string;
  sospeso: boolean;
}

export function TenantDetailHeaderActions({ tenantId, slug, nome, sospeso }: Props) {
  const router = useRouter();
  const askConfirm = useConfirm();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [scegliChi, setScegliChi] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ⭐ «Entra come…» e non «Apri come tenant»: prima questo tasto pescava
          un amministratore qualsiasi e non si poteva sapere chi. Ora chiede. */}
      <Button
        variant="outline"
        size="sm"
        onClick={() => setScegliChi(true)}
        disabled={pending}
      >
        <Eye className="h-3.5 w-3.5" />
        Entra come…
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-9 w-9" aria-label="Altre azioni">
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          {sospeso ? (
            <DropdownMenuItem
              onSelect={() =>
                start(async () => {
                  const res = await riattivaTenant(tenantId);
                  if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
                  router.refresh();
                })
              }
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Riattiva
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onSelect={() => {
                const motivo = prompt(`Sospendi ${nome} (${slug}) — motivo (opzionale)`) ?? undefined;
                start(async () => {
                  const res = await sospendiTenant(tenantId, motivo);
                  if (!res.ok) await showAlert({ title: 'Errore', body: res.error });
                  router.refresh();
                });
              }}
            >
              <Ban className="h-3.5 w-3.5" />
              Sospendi
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={async () => {
              const conferma = await askConfirm({
                title: `Eliminare definitivamente "${nome}" (${slug})?`,
                description: 'Questa è una soft-delete (sospeso=true, motivo=ELIMINATO). I dati restano in DB.',
                destructive: true,
              });
              if (!conferma) return;
              start(async () => {
                const res = await eliminaTenant(tenantId);
                if (!res.ok) {
                  await showAlert({ title: 'Errore', body: res.error });
                  return;
                }
                router.push('/admin/tenants');
                router.refresh();
              });
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Elimina (soft)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <SceltaImpersonazione
        tenantId={tenantId}
        tenantNome={nome}
        aperto={scegliChi}
        onChiudi={() => setScegliChi(false)}
      />
    </div>
  );
}
