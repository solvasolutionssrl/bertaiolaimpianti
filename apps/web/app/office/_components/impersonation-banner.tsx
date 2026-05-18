'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@impiantixplus/ui';
import { endImpersonation } from '../../admin/_actions/tenants';

/**
 * Banner full-width che avvisa il platform admin SOLVA che sta visualizzando
 * la UI tenant in modalità impersonation.
 *
 * NOTA: in questa fase MVP non c'è enforcement RLS — il banner serve
 * principalmente come avviso visivo + audit. Vedi CLAUDE.md §E del prompt
 * Super Admin UI.
 */
export function ImpersonationBanner({ tenantLabel }: { tenantLabel: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  return (
    <div
      role="alert"
      className="sticky top-0 z-50 flex w-full flex-wrap items-center gap-3 bg-accent px-4 py-2 text-accent-foreground shadow-soft"
    >
      <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 text-sm font-semibold tracking-tight">
        Modalità impersonation · stai visualizzando{' '}
        <span className="font-mono">{tenantLabel}</span>
      </p>
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto border border-accent-foreground/30 bg-accent-foreground/10 text-accent-foreground hover:bg-accent-foreground/20"
        disabled={pending}
        onClick={() =>
          start(async () => {
            // endImpersonation è una Server Action e fa redirect → /admin
            await endImpersonation();
            router.refresh();
          })
        }
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Torna a admin
      </Button>
    </div>
  );
}
