import { Building2 } from 'lucide-react';
import { createServiceSupabase } from '@impiantixplus/api/service';
import { requirePlatformAdmin } from '../../_lib/guard';
import { SectionHeader } from '../../../_components/section-header';
import { NuovoTenantWizard } from './_components/wizard';

export const metadata = { title: 'Platform · Nuovo tenant' };
export const dynamic = 'force-dynamic';

export default async function NuovoTenantPage() {
  await requirePlatformAdmin();
  const supabase = createServiceSupabase();
  const { data: plans } = await supabase
    .from('plans')
    .select('id, code, nome, prezzo_mensile_eur, attivo, ordine')
    .eq('attivo', true)
    .order('ordine');

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <SectionHeader
        eyebrow="Onboarding"
        title="Nuovo tenant"
        description="3 step rapidi: anagrafica → storage → primo owner. L'invito viene inviato via email."
        icon={<Building2 />}
      />
      <NuovoTenantWizard
        plans={(plans ?? []).map((p: any) => ({
          id: p.id,
          code: p.code,
          nome: p.nome,
          prezzo_mensile_eur: Number(p.prezzo_mensile_eur),
        }))}
      />
    </div>
  );
}
