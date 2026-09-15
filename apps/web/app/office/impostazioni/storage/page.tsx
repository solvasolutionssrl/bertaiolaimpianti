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
  // Al browser va solo quello che il modulo mostra, mai la password: la pagina
  // la apre anche l'ufficio, in sola lettura. Legge camelCase con fallback
  // snake_case (legacy).
  const configMostrata = {
    baseUrl:
      (config.baseUrl as string | undefined) ?? (config.base_url as string | undefined) ?? '',
    user: (config.user as string | undefined) ?? '',
    hasPassword: Boolean(
      ((config.appPassword as string | undefined) ?? (config.app_password as string | undefined))?.trim(),
    ),
  };

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
        initialConfig={configMostrata}
        canEdit={canEdit}
      />
    </div>
  );
}
