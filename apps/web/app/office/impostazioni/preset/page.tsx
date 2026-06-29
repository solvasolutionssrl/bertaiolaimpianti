import { Layers } from 'lucide-react';
import { notFound } from 'next/navigation';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServerSupabase } from '@kommessa/api/server';
import { getAppModeCached } from '@/app/_lib/app-mode';
import { tenantFeatureEnabled } from '@/app/_lib/tenant-features';
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
  // Funzione "mondo commesse": bloccata (404) se nascosta per il tenant.
  const kommessaWorld = (await getAppModeCached()) !== 'kantiere';
  if (!(await tenantFeatureEnabled('preset_lavoro', kommessaWorld))) notFound();
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
