'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { MoreVertical, ExternalLink, Ban, RotateCcw, Link2 } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@impiantixplus/ui';
import { sospendiTenant, riattivaTenant } from '../../_actions/tenants';
import { useAlert } from '@/app/_components/confirm-provider';

interface Props {
  tenantId: string;
  slug: string;
  sospeso: boolean;
}

export function TenantRowActions({ tenantId, slug, sospeso }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label="Azioni"
          disabled={pending}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onSelect={() => router.push(`/admin/tenants/${tenantId}`)}
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Apri dettaglio
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
              const motivo = prompt('Motivo sospensione (opzionale)') ?? undefined;
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
        <DropdownMenuItem
          onSelect={async () => {
            const url = `${window.location.origin}/login?tenant=${slug}`;
            navigator.clipboard?.writeText(url);
            await showAlert({ title: 'Link onboarding copiato', body: url });
          }}
        >
          <Link2 className="h-3.5 w-3.5" />
          Copia link onboarding
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
