import { LoginForm } from './_components/form';

export const metadata = { title: 'Accedi' };
// useSearchParams() in LoginForm richiede rendering dinamico (no prerender).
export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            SOLVA × Bertaiola Impianti
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            impiantiXplus
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Accedi al gestionale commesse
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
