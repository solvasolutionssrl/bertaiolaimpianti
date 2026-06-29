import type { ReactNode } from 'react';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
import { getAppModeCached } from '@/app/_lib/app-mode';
import { tenantFeatureEnabled } from '@/app/_lib/tenant-features';
import { SettingsTopNav } from './_components/settings-tabs';

export const metadata = { title: 'Impostazioni · Kommessa' };

export default async function ImpostazioniLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ctx = await requireTenantContext();
  const supabase = createServerSupabase();
  const { data } = await supabase.auth.getUser();
  const meta = (data.user?.app_metadata ?? {}) as Record<string, unknown>;
  const isPlatformAdmin =
    meta.platform_admin === true ||
    meta.platform_admin === 'true' ||
    ctx.email.toLowerCase() === 'dev@solva.it';
  const hasKantiere = await tenantHasModule('kantiere');
  // Visibilità funzioni "mondo commesse": feature-flag per-tenant (default =
  // app_mode ≠ kantiere), gestibile dal super admin.
  const kommessaWorld = (await getAppModeCached()) !== 'kantiere';
  const [showVoci, showPreset] = await Promise.all([
    tenantFeatureEnabled('voci_catalogo', kommessaWorld),
    tenantFeatureEnabled('preset_lavoro', kommessaWorld),
  ]);
  const hiddenIds = [
    ...(showVoci ? [] : ['voci']),
    ...(showPreset ? [] : ['preset']),
  ];

  return (
    <div className="w-full">
      <SettingsTopNav
        isPlatformAdmin={isPlatformAdmin}
        hasKantiere={hasKantiere}
        hiddenIds={hiddenIds}
      />
      <div className="mt-6">{children}</div>
    </div>
  );
}
