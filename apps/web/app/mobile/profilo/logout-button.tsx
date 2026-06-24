'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Loader2 } from 'lucide-react';

import { createBrowserSupabase } from '@kommessa/api/client';
import { Button, cn } from '@kommessa/ui';

import { useConfirm } from '../../_components/confirm-provider';
import { registraEventoAccesso } from '@/app/_actions/auth-events';

/**
 * Sezione "Sessione" collassata in fondo al profilo.
 *
 * Scelta UX (28/05/2026 — feedback Bertaiola): il vecchio bottone "Esci"
 * full-width destructive era troppo facile da toccare per errore (etichetta
 * generica + posizione finger-friendly). Ora:
 *  1. Il logout NON è visibile finché l'utente non apre il disclosure
 *     "Sessione" (atto deliberato).
 *  2. Al tap su "Esci dall'account" parte un `useConfirm` con descrizione
 *     esplicita prima del `signOut()`.
 *  3. Label estesa per disambiguare con i tanti "Indietro" della navigazione.
 */
export function LogoutButton() {
  const router = useRouter();
  const askConfirm = useConfirm();
  const [pending, startTransition] = React.useTransition();
  const [open, setOpen] = React.useState(false);

  const onLogout = async () => {
    const ok = await askConfirm({
      title: 'Vuoi uscire dall’account?',
      description:
        'Verrà chiusa la sessione. Per rientrare dovrai inserire di nuovo email e password.',
      confirmLabel: 'Sì, esci',
      cancelLabel: 'Annulla',
      destructive: true,
    });
    if (!ok) return;

    startTransition(async () => {
      await registraEventoAccesso('logout');
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
      router.push('/mobile/login');
      router.refresh();
    });
  };

  return (
    <section
      aria-label="Sessione"
      className="mt-2 rounded-lg border border-dashed border-border bg-muted/20"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Sessione · gestione account
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-180',
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-dashed border-border px-3 py-3">
          <p className="mb-2 text-xs text-muted-foreground">
            Chiudere la sessione termina l’accesso su questo dispositivo. I
            dati restano salvati e potrai rientrare con le tue credenziali.
          </p>
          <Button
            variant="outline"
            size="sm"
            className="w-full text-destructive hover:bg-destructive/5 hover:text-destructive"
            onClick={onLogout}
            disabled={pending}
          >
            {pending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Esci dall’account
          </Button>
        </div>
      ) : null}
    </section>
  );
}
