import { createServerSupabase } from '@impiantixplus/api/server';
import { NuovoTicketForm } from './_components/form';

export const metadata = { title: 'Nuovo ticket' };
export const dynamic = 'force-dynamic';

export default async function NuovoTicketPage() {
  const supabase = createServerSupabase();
  const { data: clienti } = await supabase
    .from('clienti')
    .select('id, ragione_sociale')
    .order('ragione_sociale')
    .limit(500);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Nuovo ticket</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Apri un ticket manuale (es. richiesta telefonica di un cliente).
        </p>
      </header>
      <NuovoTicketForm clienti={(clienti ?? []) as any} />
    </div>
  );
}
