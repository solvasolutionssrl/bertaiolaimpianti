'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Ban,
  Link2,
  MoreVertical,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@kommessa/ui';
import { sospendiTenant, riattivaTenant } from '../../_actions/tenants';
import { SceltaImpersonazione } from '../../_components/scegli-impersonazione';
import { useAlert } from '@/app/_components/confirm-provider';

interface Props {
  tenantId: string;
  tenantNome: string;
  slug: string;
  sospeso: boolean;
}

/**
 * Azioni per riga tenant nella lista admin.
 *
 * Pattern post-refactor: "Apri →" è l'azione primaria sempre visibile
 * (link a /admin/tenants/[id]). I 3 puntini restano solo per le azioni
 * secondarie (impersona, sospendi/riattiva, copia link onboarding).
 *
 * Razionale richiesto cliente: aprire un tenant non deve richiedere 2 click
 * (dropdown → "Apri dettaglio"). Un solo tap.
 */
export function TenantRowActions({ tenantId, tenantNome, slug, sospeso }: Props) {
  const router = useRouter();
  const showAlert = useAlert();
  const [pending, start] = React.useTransition();
  const [scegliChi, setScegliChi] = React.useState(false);

  return (
    <div className="flex items-center justify-end gap-1">
      <Button asChild size="sm" variant="outline" disabled={pending}>
        <Link
          href={`/admin/tenants/${tenantId}`}
          className="gap-1.5 font-medium"
        >
          Apri
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            aria-label="Altre azioni"
            disabled={pending}
          >
            <MoreVertical className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          {!sospeso ? (
            /* ⚠️ Il menu apre il dialog, non lo contiene: un menu Radix si
               smonta al click e si porterebbe via lo stato. */
            <DropdownMenuItem onSelect={() => setScegliChi(true)}>
              <UserCheck className="h-3.5 w-3.5" />
              Entra come…
            </DropdownMenuItem>
          ) : null}
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
          <DropdownMenuSeparator />
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
      <SceltaImpersonazione
        tenantId={tenantId}
        tenantNome={tenantNome}
        aperto={scegliChi}
        onChiudi={() => setScegliChi(false)}
      />
    </div>
  );
}
