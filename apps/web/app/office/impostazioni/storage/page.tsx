import { HardDrive } from 'lucide-react';
import { requireTenantContext } from '@kommessa/api/tenant';
import { createServiceSupabase } from '@kommessa/api/service';
import { SectionHeader } from '../_components/section-header';
import { AdminRequiredNotice } from '../_components/admin-required';
import { canManageTenant } from '../_components/role-gate';
import { StorageForm } from './_components/storage-form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Storage · Impostazioni' };

type Provider = 'supabase' | 'nextcloud';

export default async function StoragePage() {
  const ctx = await requireTenantContext();
  // `storage_config` è un segreto (credenziali Nextcloud): si legge via service
  // role, scoping esplicito al proprio tenant. La colonna NON è leggibile dal
  // client authenticated (REVOKE), così un membro non può esfiltrarla via API.
  const supabase = createServiceSupabase();
  const canEdit = canManageTenant(ctx);

  const { data: tenant } = await supabase
    .from('tenants')
    .select('storage_provider, storage_config')
    .eq('id', ctx.tenantId)
    .maybeSingle();

  const provider: Provider =
    (tenant?.storage_provider as Provider | null) ?? 'supabase';
  const config =
    (tenant?.storage_config as Record<string, unknown> | null) ?? {};

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Configurazione storage"
        description="Decidi dove vengono salvati documenti e foto delle commesse: Supabase Storage (default) o Nextcloud via WebDAV."
        icon={<HardDrive />}
      />
      {!canEdit ? <AdminRequiredNotice /> : null}
      <StorageForm
        initialProvider={provider}
        initialConfig={config}
        canEdit={canEdit}
      />
    </div>
  );
}
