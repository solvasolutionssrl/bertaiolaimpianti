import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { ImpostazioniClient } from './_components/impostazioni-client';

export const dynamic = 'force-dynamic';

export default async function KantiereImpostazioniPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();

  const { data: row } = await supabase
    .from('tenant_modules' as never)
    .select('config')
    .eq('tenant_id', ctx.tenantId)
    .eq('module_code', 'kantiere')
    .maybeSingle();

  const config = ((row as { config: Record<string, unknown> | null } | null)?.config) ?? {};
  const soglia = typeof config.soglia_ore_ordinarie === 'number' ? config.soglia_ore_ordinarie : 8;
  const sede = typeof config.sede_partenza_default === 'string' ? config.sede_partenza_default : '';

  return (
    <div className="w-full space-y-6">
      <header>
        <h1 className="text-xl font-semibold">Kantiere — Impostazioni</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Parametri del modulo presenze e cantieri per questo tenant.
        </p>
      </header>
      <ImpostazioniClient soglia={soglia} sede={sede} />
    </div>
  );
}
