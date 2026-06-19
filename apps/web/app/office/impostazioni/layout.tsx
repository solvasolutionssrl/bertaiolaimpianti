import type { ReactNode } from 'react';
import { createServerSupabase } from '@kommessa/api/server';
import { requireTenantContext } from '@kommessa/api/tenant';
import { tenantHasModule } from '@/app/_lib/modules';
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

  return (
    <div className="w-full">
      <SettingsTopNav isPlatformAdmin={isPlatformAdmin} hasKantiere={hasKantiere} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
