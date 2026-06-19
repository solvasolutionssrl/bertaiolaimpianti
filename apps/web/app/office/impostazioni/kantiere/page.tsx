import { redirect } from 'next/navigation';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { SectionHeader } from '../_components/section-header';
import { ImpostazioniClient } from '@/app/office/kantiere/impostazioni/_components/impostazioni-client';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Kantiere · Impostazioni' };

export default async function KantiereSettingsPage() {
  const ctx = await requireTenantContext();

  if (!(await tenantHasModule('kantiere'))) {
    redirect('/office/impostazioni/profilo');
  }

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
    <div className="space-y-6">
      <SectionHeader
        title="Kantiere"
        description="Parametri del modulo presenze e cantieri: soglia ore ordinarie, sede di partenza predefinita."
      />
      <ImpostazioniClient soglia={soglia} sede={sede} />
    </div>
  );
}
