import { redirect } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

import { etichettaAccesso } from '@kommessa/api/identita';

import { getTenantContextCached } from '@/app/_lib/tenant-cache';
import { casaPerRuolo, devoCambiarePassword } from '@/app/_lib/cambio-password';
import { CambiaPasswordForm } from './_components/cambia-password-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'La tua password · Kommessa' };

/**
 * La schermata dove si sceglie la propria password.
 *
 * Sta **fuori** dai gusci dell'ufficio e del telefono, di proposito: è la
 * pagina in cui i gusci mandano chi deve ancora cambiarla, e se fosse dentro
 * uno di essi il controllo rimanderebbe a se stesso in cerchio.
 *
 * Fino a oggi questa pagina non esisteva, e la conseguenza era più grossa del
 * primo accesso: **nessun utente di nessun cliente poteva cambiarsi la
 * password.** Solo il super admin SOLVA aveva un modulo per farlo. Chi
 * sospettava che la sua password fosse in giro non aveva nessun gesto a
 * disposizione.
 */
export default async function CambiaPasswordPage() {
  const ctx = await getTenantContextCached();
  if (!ctx) redirect('/login');

  const obbligato = await devoCambiarePassword();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck aria-hidden="true" className="h-5 w-5" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            {obbligato ? 'Scegli la tua password' : 'Cambia la password'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {obbligato
              ? 'Quella che ti hanno dato in ufficio la sanno in due. Scegline una che sai solo tu: da adesso userai questa per entrare.'
              : 'Da adesso entrerai con quella nuova. Il nome utente non cambia.'}
          </p>
        </div>

        <CambiaPasswordForm
          nomeAccesso={etichettaAccesso(ctx.email)}
          obbligato={obbligato}
          casa={casaPerRuolo(ctx.role)}
        />
      </div>
    </div>
  );
}
