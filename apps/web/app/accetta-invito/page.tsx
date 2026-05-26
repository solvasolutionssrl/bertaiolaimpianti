import { redirect } from 'next/navigation';
import { getTenantContext } from '@kommessa/api/tenant';
import { AccettaInvitoForm } from './_components/accetta-invito-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Imposta password · Kommessa' };

export default async function AccettaInvitoPage() {
  const ctx = await getTenantContext();

  // Se non c'è sessione, il codice non è stato scambiato → torna al login
  if (!ctx) {
    redirect('/login?error=invalid_link');
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            Benvenuto su Kommessa
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Scegli una password per attivare il tuo account.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Accedi come <span className="font-medium text-foreground">{ctx.email}</span>
          </p>
        </div>

        <AccettaInvitoForm email={ctx.email} role={ctx.role} />
      </div>
    </div>
  );
}
