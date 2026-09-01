import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { leggiMetodiPagamento } from '@/app/_lib/metodi-pagamento';
import { PagamentiClient } from './_components/pagamenti-client';

export const dynamic = 'force-dynamic';

/**
 * Metodi di pagamento delle spese.
 *
 * Non è dietro nessun modulo: fa parte del prodotto e vale per tutti i clienti,
 * anche quelli che le spese non le usano ancora.
 */
export default async function PagamentiPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const metodi = await leggiMetodiPagamento(supabase, ctx.tenantId);
  const puoModificare = ['owner', 'admin', 'office'].includes(ctx.role);

  return <PagamentiClient metodi={metodi} puoModificare={puoModificare} />;
}
