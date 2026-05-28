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
import { sospendiTenant, riattivaTenant, impersonate } from '../../_actions/tenants';
import { useAlert, useConfirm } from '@/app/_components/confirm-provider';

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
  const askConfirm = useConfirm();
  const [pending, start] = React.useTransition();

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
            <DropdownMenuItem
              onSelect={async () => {
                const ok = await askConfirm({
                  title: `Impersonare "${tenantNome}"?`,
                  description:
                    'Entrerai in /office come admin di questo tenant. Tutte le tue azioni vengono tracciate in audit con flag platform=true. Esci con il banner in alto a destra.',
                  confirmLabel: 'Impersona',
                });
                if (!ok) return;
                start(async () => {
                  try {
                    const res = await impersonate(tenantId);
                    if (res && 'ok' in res && !res.ok)
                      await showAlert({ title: 'Errore', body: res.error });
                  } catch (e) {
                    const msg =
                      e instanceof Error && !e.message.includes('NEXT_REDIRECT')
                        ? e.message
                        : null;
                    if (msg) await showAlert({ title: 'Errore', body: msg });
                  }
                });
              }}
            >
              <UserCheck className="h-3.5 w-3.5" />
              Impersona tenant
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
    </div>
  );
}
