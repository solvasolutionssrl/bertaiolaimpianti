import { Timer } from 'lucide-react';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { createServerSupabase } from '@impiantixplus/api/server';
import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { SlaForm, type SlaPolicyRow } from './_components/sla-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'SLA · Impostazioni' };

export default async function SlaPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const canEdit = canManageTenant(ctx);

  const { data } = await supabase
    .from('sla_policy')
    .select('priorita, response_minutes, close_minutes')
    .order('priorita');

  const policies = (data ?? []) as SlaPolicyRow[];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="SLA ticket"
        description="Definisci entro quanti minuti rispondere e chiudere un ticket in base alla priorità. Le scadenze si calcolano dall'apertura del ticket."
        icon={<Timer />}
      />
      {!canEdit ? <AdminRequiredNotice /> : null}
      <SlaForm policies={policies} canEdit={canEdit} />
    </div>
  );
}
