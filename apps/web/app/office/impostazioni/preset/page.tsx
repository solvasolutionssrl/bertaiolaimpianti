import { Layers } from 'lucide-react';
import { requireTenantContext } from '@impiantixplus/api/tenant';
import { createServerSupabase } from '@impiantixplus/api/server';
import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import {
  PresetManager,
  type PresetRow,
} from './_components/preset-manager';
import type { VoceCatalogoOpt } from './_components/preset-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Preset · Impostazioni' };

export default async function PresetPage() {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const canEdit = canManageTenant(ctx);

  const [presetRes, vociRes] = await Promise.all([
    supabase
      .from('preset')
      .select('id, nome, descrizione, voci_default, created_at')
      .order('nome'),
    supabase
      .from('voci_catalogo')
      .select('id, nome, categoria, "default"')
      .order('ordine_visualizzazione'),
  ]);

  const preset = (presetRes.data ?? []) as PresetRow[];
  const voci = (vociRes.data ?? []) as VoceCatalogoOpt[];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Preset di lavoro"
        description="Combinazioni di voci ricorrenti, riutilizzabili in pochi clic al momento di creare una nuova commessa."
        icon={<Layers />}
      />
      {!canEdit ? <AdminRequiredNotice /> : null}
      <PresetManager preset={preset} voci={voci} canEdit={canEdit} />
    </div>
  );
}
