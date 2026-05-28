import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { ListTree, PackageOpen } from 'lucide-react';
import { EmptyState } from '../../../_components/empty-state';
import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import {
  VociList,
  type VoceCatalogo,
  type VoceOverride,
} from './_components/voci-list';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Voci catalogo · Impostazioni' };

export default async function VociPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const canEdit = canManageTenant(ctx);

  const [vociRes, overridesRes] = await Promise.all([
    supabase
      .from('voci_catalogo')
      .select(
        'id, nome, categoria, "default", cartella_template, ordine_visualizzazione, tenant_id',
      )
      .order('ordine_visualizzazione'),
    supabase
      .from('tenant_voci_override' as never)
      .select('voce_id, nome_override, min_foto_richieste_override, attiva')
      .eq('tenant_id', ctx.tenantId),
  ]);

  // Cast via unknown: tenant_id è introdotta dalla migration 28/05/2026,
  // i types generati la includeranno al prossimo `supabase gen types`.
  const voci = (vociRes.data ?? []) as unknown as VoceCatalogo[];
  const overrides = (overridesRes.data ?? []) as VoceOverride[];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Voci catalogo"
        description="Le voci canoniche sono globali e condivise. Puoi personalizzarne nome, foto minime e disponibilità per il tuo tenant, e aggiungere voci custom specifiche del tuo workflow."
        icon={<ListTree />}
      />

      {!canEdit ? <AdminRequiredNotice /> : null}

      {voci.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="Catalogo non ancora popolato"
          description="Esegui il seed Supabase per popolare le 38 voci canoniche del catalogo lavori."
        />
      ) : (
        <VociList voci={voci} overrides={overrides} canEdit={canEdit} />
      )}
    </div>
  );
}
