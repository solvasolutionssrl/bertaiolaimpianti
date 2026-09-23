'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { Button } from '@kommessa/ui';
import { endImpersonation, rinnovaShadow } from '../admin/_actions/tenants';

/** Ogni quanto si chiede al server di prorogare la sessione admin messa da parte. */
const RINNOVO_MS = 15 * 60 * 1000;

/**
 * Avvisa il super admin che sta guardando l'applicazione come un utente del
 * tenant, e gli da' la via di ritorno alla console.
 *
 * Sta qui e non sotto `office/` perche' serve a tutte le superfici: un tenant
 * Kantiere si gira quasi tutto da mobile, e li' prima non c'era nessun avviso
 * ne' nessun modo di tornare indietro.
 *
 * ⚠️ Nell'ufficio va passata alla shell come prop `banner`, non renderizzata
 * accanto ad essa: la shell e' alta una viewport e non scorre, quindi una barra
 * sorella allunga il documento e sparisce al primo scroll senza piu' tornare.
 */
export function ImpersonationBanner({ tenantLabel }: { tenantLabel: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();

  // L'identita' admin vive in un cookie con scadenza propria, mentre i cookie di
  // sessione del tenant si rinnovano a ogni richiesta: senza proroga, dopo
  // qualche ora si resta dentro al tenant senza piu' modo di tornare indietro se
  // non uscendo. Gira solo finche' questa barra e' a schermo, cioe' solo durante
  // l'impersonation.
  React.useEffect(() => {
    void rinnovaShadow();
    const id = setInterval(() => void rinnovaShadow(), RINNOVO_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      role="alert"
      className="flex w-full flex-wrap items-center gap-3 bg-accent px-4 py-2 text-accent-foreground shadow-soft"
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
        Torna alla console
      </Button>
    </div>
  );
}
