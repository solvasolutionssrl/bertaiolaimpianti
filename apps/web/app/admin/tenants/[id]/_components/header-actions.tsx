'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Ban, ExternalLink, MoreVertical, RotateCcw, Trash2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@impiantixplus/ui';
import {
  sospendiTenant,
  riattivaTenant,
  eliminaTenant,
  impersonate,
} from '../../../_actions/tenants';

interface Props {
  tenantId: string;
  slug: string;
  nome: string;
  sospeso: boolean;
}

export function TenantDetailHeaderActions({ tenantId, slug, nome, sospeso }: Props) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          start(async () => {
            // impersonate è un redirect — non torna
            await impersonate(tenantId);
          })
        }
        disabled={pending}
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Apri come tenant
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
                  if (!res.ok) alert(res.error);
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
                  if (!res.ok) alert(res.error);
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
            onSelect={() => {
              const conferma = confirm(
                `Eliminare definitivamente "${nome}" (${slug})?\n\nQuesta è una soft-delete (sospeso=true, motivo=ELIMINATO). I dati restano in DB.`,
              );
              if (!conferma) return;
              start(async () => {
                const res = await eliminaTenant(tenantId);
                if (!res.ok) {
                  alert(res.error);
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
    </div>
  );
}
